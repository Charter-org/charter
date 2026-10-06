// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title Mandate
/// @notice An on-chain risk mandate the managing agent cannot exceed.
///
/// The human (owner) sets the bounds once. The agent may only act *through* this contract, and the
/// contract reverts on any breach — the agent cannot talk its way past it. Every evaluation,
/// including a decision to do nothing, is emitted as a `Decision` row anyone can replay.
///
/// v1 scope: this is the validation + decision-log gate. The custody/execution wiring (funds held
/// by the mandate so the agent has no direct path to a venue, and the on-chain venue call forwarded
/// through here so a revert blocks a *real* trade, not just a log row) is the next increment. On the
/// Perpl leg, orders are relayed gaslessly off an API and cannot be gated by Solidity — that bound
/// is enforced at the collateral level; the Kuru (on-chain) leg is executed through this gate.
contract Mandate {
    /// @dev Basis points. 10_000 = 1.00x / 100%.
    uint256 internal constant BPS = 10_000;

    enum Action {
        Abstain, // evaluated, chose not to act
        Hedge, // open/adjust a protective perp position
        Rebalance // spot rebalance
    }

    struct Terms {
        uint256 maxLeverageBps; // e.g. 20_000 = 2.00x
        uint256 maxSlippageBps; // e.g. 50 = 0.50%
        uint256 drawdownTriggerBps; // e.g. 1_000 = 10% drawdown => hedge required
    }

    address public immutable owner; // the depositor whose capital is under management
    address public agent; // the only address allowed to act under this mandate
    Terms public terms;
    mapping(address => bool) public venueAllowed;
    uint256 public decisionCount;

    event AgentSet(address indexed agent);
    event VenueSet(address indexed venue, bool allowed);
    event TermsSet(uint256 maxLeverageBps, uint256 maxSlippageBps, uint256 drawdownTriggerBps);
    event Decision(
        uint256 indexed seq,
        Action indexed action,
        address indexed venue,
        bool acted,
        uint256 leverageBps,
        uint256 slippageBps,
        string reason
    );

    error NotOwner();
    error NotAgent();
    error VenueNotAllowed(address venue);
    error LeverageExceeded(uint256 requested, uint256 max);
    error SlippageExceeded(uint256 requested, uint256 max);

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier onlyAgent() {
        if (msg.sender != agent) revert NotAgent();
        _;
    }

    constructor(address agent_, Terms memory terms_) {
        owner = msg.sender;
        agent = agent_;
        terms = terms_;
        emit AgentSet(agent_);
        emit TermsSet(terms_.maxLeverageBps, terms_.maxSlippageBps, terms_.drawdownTriggerBps);
    }

    // --- owner controls: the human sets the bounds; the agent never can ---

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

    // --- the gate the agent must pass (the refusal demo lives here) ---

    /// @notice Validate and record an action the agent wants to take. Reverts on any breach of the
    ///         mandate; on success emits a `Decision` row with `acted = true`. The agent cannot
    ///         record an acting decision that violates the bounds.
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

    /// @notice Record a decision to do nothing. Abstentions are first-class rows in the log.
    function abstain(string calldata reason) external onlyAgent returns (uint256 seq) {
        seq = ++decisionCount;
        emit Decision(seq, Action.Abstain, address(0), false, 0, 0, reason);
    }

    // --- views ---

    /// @notice Whether the mandate requires a protective hedge given an observed drawdown.
    /// @param drawdownBps observed drawdown in basis points (e.g. 1_200 = 12%)
    function hedgeRequired(uint256 drawdownBps) external view returns (bool) {
        return drawdownBps >= terms.drawdownTriggerBps;
    }
}
