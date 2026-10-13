// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "./interfaces/IERC20.sol";
import {IPriceSource} from "./interfaces/IPriceSource.sol";

/// @notice Perpl exchange order (OrderDesc). Field order/types match the live execOrder ABI exactly.
struct PerplOrder {
    uint256 orderDescId;
    uint256 perpId;
    uint8 orderType; // 0 OpenLong, 1 OpenShort, 2 CloseLong, 3 CloseShort
    uint256 orderId;
    uint256 pricePNS;
    uint256 lotLNS;
    uint256 expiryBlock;
    bool postOnly;
    bool fillOrKill;
    bool immediateOrCancel;
    uint256 maxMatches;
    uint256 leverageHdths; // leverage x100 (200 = 2.00x)
    uint256 lastExecutionBlock;
    uint256 amountCNS;
    uint256 maxNegPnlCollatBPS;
}

interface IPerplExchange {
    function createAccount(uint256 amountCNS) external returns (uint256 accountId);
    function execOrder(PerplOrder calldata order) external;
    function withdrawCollateral(uint256 amountCNS) external;
}

/// @title Mandate
/// @notice Risk bounds the agent cannot exceed. The owner sets terms and custodies capital here; the
/// agent can only move it through executeSwap (spot) or execPerplOrder (perps), both of which the
/// contract bounds-checks. The mandate holds the Perpl account itself, so a compromised agent cannot
/// over-lever: execPerplOrder reverts before the order is sent if leverage exceeds the owner's terms.
contract Mandate {
    uint256 internal constant BPS = 10_000;

    enum Action { Abstain, Hedge, Rebalance }

    struct Terms {
        uint256 maxLeverageBps; // 20_000 = 2.00x
        uint256 maxSlippageBps; // 50 = 0.50%
        uint256 drawdownTriggerBps; // 1_000 = 10%
    }

    address public immutable owner;
    address public agent;
    Terms public terms;
    mapping(address => bool) public venueAllowed;
    IPriceSource public priceSource;
    uint256 public decisionCount;

    uint256 private _lock = 1;

    // Perpl on Monad testnet: the mandate custodies AUSD here and holds its own Perpl account.
    address public constant PERPL_EXCHANGE = 0x1964C32f0bE608E7D29302AFF5E61268E72080cc;
    IERC20 public constant PERPL_COLLATERAL = IERC20(0xa9012a055bd4e0eDfF8Ce09f960291C09D5322dC);

    event PerplOrderPlaced(uint256 indexed seq, uint8 orderType, uint256 perpId, uint256 lotLNS, uint256 leverageBps);

    event AgentSet(address indexed agent);
    event VenueSet(address indexed venue, bool allowed);
    event TermsSet(uint256 maxLeverageBps, uint256 maxSlippageBps, uint256 drawdownTriggerBps);
    event PriceSourceSet(address indexed priceSource);
    event Deposited(address indexed token, address indexed from, uint256 amount);
    event Withdrawn(address indexed token, address indexed to, uint256 amount);
    event Decision(
        uint256 indexed seq,
        Action indexed action,
        address indexed venue,
        bool acted,
        uint256 leverageBps,
        uint256 slippageBps,
        string reason
    );
    event SwapExecuted(
        uint256 indexed seq, address indexed venue, address tokenIn, address tokenOut, uint256 spent, uint256 received
    );

    error NotOwner();
    error NotAgent();
    error Reentrancy();
    error VenueNotAllowed(address venue);
    error LeverageExceeded(uint256 requested, uint256 max);
    error SlippageExceeded(uint256 requested, uint256 max);
    error PriceSourceUnset();
    error NoReferencePrice();
    error VenueCallFailed();
    error OverspentInput(uint256 spent, uint256 authorized);
    error SlippageFloorBreached(uint256 received, uint256 floor);

    modifier onlyOwner() { if (msg.sender != owner) revert NotOwner(); _; }
    modifier onlyAgent() { if (msg.sender != agent) revert NotAgent(); _; }
    modifier nonReentrant() { if (_lock != 1) revert Reentrancy(); _lock = 2; _; _lock = 1; }

    constructor(address agent_, Terms memory terms_) {
        owner = msg.sender;
        agent = agent_;
        terms = terms_;
        emit AgentSet(agent_);
        emit TermsSet(terms_.maxLeverageBps, terms_.maxSlippageBps, terms_.drawdownTriggerBps);
    }

    function setAgent(address agent_) external onlyOwner {
        agent = agent_;
        emit AgentSet(agent_);
    }

    function setVenue(address venue, bool allowed) external onlyOwner {
        venueAllowed[venue] = allowed;
        emit VenueSet(venue, allowed);
    }

    function setTerms(Terms calldata terms_) external onlyOwner {
        terms = terms_;
        emit TermsSet(terms_.maxLeverageBps, terms_.maxSlippageBps, terms_.drawdownTriggerBps);
    }

    function setPriceSource(IPriceSource priceSource_) external onlyOwner {
        priceSource = priceSource_;
        emit PriceSourceSet(address(priceSource_));
    }

    function deposit(IERC20 token, uint256 amount) external {
        require(token.transferFrom(msg.sender, address(this), amount), "deposit failed");
        emit Deposited(address(token), msg.sender, amount);
    }

    // owner only; the agent has no path to pull funds out
    function withdraw(IERC20 token, uint256 amount, address to) external onlyOwner nonReentrant {
        require(token.transfer(to, amount), "withdraw failed");
        emit Withdrawn(address(token), to, amount);
    }

    /// @notice Route a spot trade through an allowlisted venue. Bounds are enforced by measuring the
    /// realized balance deltas, not by trusting the agent's inputs: reverts (undoing the trade) if the
    /// venue pulls more than authorized or the received amount is below the owner's slippage floor.
    function executeSwap(
        address venue,
        IERC20 tokenIn,
        IERC20 tokenOut,
        uint256 amountIn,
        bytes calldata venueCalldata
    ) external onlyAgent nonReentrant returns (uint256 received) {
        if (!venueAllowed[venue]) revert VenueNotAllowed(venue);
        if (address(priceSource) == address(0)) revert PriceSourceUnset();

        uint256 spent;
        uint256 realizedSlippageBps;
        {
            uint256 expectedOut = priceSource.expectedOut(address(tokenIn), address(tokenOut), amountIn);
            if (expectedOut == 0) revert NoReferencePrice();

            uint256 inBefore = tokenIn.balanceOf(address(this));
            uint256 outBefore = tokenOut.balanceOf(address(this));

            tokenIn.approve(venue, amountIn);
            (bool ok,) = venue.call(venueCalldata);
            if (!ok) revert VenueCallFailed();
            tokenIn.approve(venue, 0);

            spent = inBefore - tokenIn.balanceOf(address(this));
            received = tokenOut.balanceOf(address(this)) - outBefore;

            if (spent > amountIn) revert OverspentInput(spent, amountIn);
            uint256 floorOut = expectedOut * (BPS - terms.maxSlippageBps) / BPS;
            if (received < floorOut) revert SlippageFloorBreached(received, floorOut);

            realizedSlippageBps = expectedOut > received ? (expectedOut - received) * BPS / expectedOut : 0;
        }

        uint256 seq = ++decisionCount;
        emit Decision(seq, Action.Rebalance, venue, true, 0, realizedSlippageBps, "");
        emit SwapExecuted(seq, venue, address(tokenIn), address(tokenOut), spent, received);
    }

    // perp-side decisions (relayed off-chain, so logged not custodied) and abstentions
    function act(Action action, address venue, uint256 leverageBps, uint256 slippageBps)
        external
        onlyAgent
        returns (uint256 seq)
    {
        if (!venueAllowed[venue]) revert VenueNotAllowed(venue);
        if (leverageBps > terms.maxLeverageBps) revert LeverageExceeded(leverageBps, terms.maxLeverageBps);
        if (slippageBps > terms.maxSlippageBps) revert SlippageExceeded(slippageBps, terms.maxSlippageBps);
        seq = ++decisionCount;
        emit Decision(seq, action, venue, true, leverageBps, slippageBps, "");
    }

    function abstain(string calldata reason) external onlyAgent returns (uint256 seq) {
        seq = ++decisionCount;
        emit Decision(seq, Action.Abstain, address(0), false, 0, 0, reason);
    }

    /// @notice Open the mandate's own Perpl account, funded by the AUSD it already custodies. Owner only.
    function openPerplAccount(uint256 amountCNS) external onlyOwner returns (uint256 accountId) {
        PERPL_COLLATERAL.approve(PERPL_EXCHANGE, amountCNS);
        accountId = IPerplExchange(PERPL_EXCHANGE).createAccount(amountCNS);
    }

    /// @notice Pull collateral back out of the Perpl account into the mandate (owner can then withdraw).
    function withdrawPerplCollateral(uint256 amountCNS) external onlyOwner {
        IPerplExchange(PERPL_EXCHANGE).withdrawCollateral(amountCNS);
    }

    /// @notice The agent places a Perpl order through the mandate. Leverage is hard-capped on-chain:
    /// the contract reverts if it exceeds the owner's terms, so a compromised agent cannot over-lever.
    /// The mandate is the Perpl account holder, so the position is custodied here, not in any EOA.
    function execPerplOrder(
        uint8 orderType,
        uint256 perpId,
        uint256 pricePNS,
        uint256 lotLNS,
        uint256 leverageHdths,
        uint256 maxNegPnlCollatBPS
    ) external onlyAgent nonReentrant returns (uint256 seq) {
        uint256 leverageBps = leverageHdths * 100; // leverageHdths is x100; terms.maxLeverageBps is x10_000
        if (leverageBps > terms.maxLeverageBps) revert LeverageExceeded(leverageBps, terms.maxLeverageBps);

        PerplOrder memory order = PerplOrder({
            orderDescId: block.timestamp * 1000,
            perpId: perpId,
            orderType: orderType,
            orderId: 0,
            pricePNS: pricePNS,
            lotLNS: lotLNS,
            expiryBlock: 0,
            postOnly: false,
            fillOrKill: false,
            immediateOrCancel: true,
            maxMatches: 0,
            leverageHdths: leverageHdths,
            lastExecutionBlock: 0,
            amountCNS: 0,
            maxNegPnlCollatBPS: maxNegPnlCollatBPS
        });
        IPerplExchange(PERPL_EXCHANGE).execOrder(order);

        seq = ++decisionCount;
        emit Decision(seq, Action.Rebalance, PERPL_EXCHANGE, true, leverageBps, maxNegPnlCollatBPS, "");
        emit PerplOrderPlaced(seq, orderType, perpId, lotLNS, leverageBps);
    }

    function balanceOfToken(IERC20 token) external view returns (uint256) {
        return token.balanceOf(address(this));
    }

    function hedgeRequired(uint256 drawdownBps) external view returns (bool) {
        return drawdownBps >= terms.drawdownTriggerBps;
    }
}
