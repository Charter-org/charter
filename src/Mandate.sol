// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "./interfaces/IERC20.sol";
import {IPriceSource} from "./interfaces/IPriceSource.sol";

/// @title Mandate
/// @notice Risk bounds the agent cannot exceed. The owner sets terms and custodies capital here; the
/// agent can only move it through executeSwap, which reverts if the realized fill breaches the
/// slippage floor. Perpl orders are relayed off-chain, so that leg is logged via `act`, not custodied.
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

    function balanceOfToken(IERC20 token) external view returns (uint256) {
        return token.balanceOf(address(this));
    }

    function hedgeRequired(uint256 drawdownBps) external view returns (bool) {
        return drawdownBps >= terms.drawdownTriggerBps;
    }
}
