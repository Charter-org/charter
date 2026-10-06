// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {Mandate} from "../src/Mandate.sol";

contract MandateTest is Test {
    Mandate internal mandate;

    address internal owner = address(0xA11CE);
    address internal agent = address(0xB0B);
    address internal kuru = address(0xC0FFEE);
    address internal notVenue = address(0xDEAD);

    function setUp() public {
        vm.prank(owner);
        mandate = new Mandate(
            agent,
            Mandate.Terms({
                maxLeverageBps: 20_000, // 2.00x
                maxSlippageBps: 50, // 0.50%
                drawdownTriggerBps: 1_000 // 10%
            })
        );
        vm.prank(owner);
        mandate.setVenue(kuru, true);
    }

    function test_actWithinBounds_records() public {
        vm.prank(agent);
        uint256 seq = mandate.act(Mandate.Action.Rebalance, kuru, 15_000, 30);
        assertEq(seq, 1);
        assertEq(mandate.decisionCount(), 1);
    }

    /// THE REFUSAL DEMO: the agent tries to exceed leverage and the contract refuses.
    function test_leverageBreach_reverts() public {
        vm.prank(agent);
        vm.expectRevert(abi.encodeWithSelector(Mandate.LeverageExceeded.selector, 25_000, 20_000));
        mandate.act(Mandate.Action.Hedge, kuru, 25_000, 10);
    }

    function test_slippageBreach_reverts() public {
        vm.prank(agent);
        vm.expectRevert(abi.encodeWithSelector(Mandate.SlippageExceeded.selector, 120, 50));
        mandate.act(Mandate.Action.Rebalance, kuru, 10_000, 120);
    }

    function test_unallowlistedVenue_reverts() public {
        vm.prank(agent);
        vm.expectRevert(abi.encodeWithSelector(Mandate.VenueNotAllowed.selector, notVenue));
        mandate.act(Mandate.Action.Rebalance, notVenue, 10_000, 10);
    }

    function test_nonAgent_reverts() public {
        vm.prank(address(0x1234));
        vm.expectRevert(Mandate.NotAgent.selector);
        mandate.act(Mandate.Action.Rebalance, kuru, 10_000, 10);
    }

    function test_abstain_records() public {
        vm.prank(agent);
        uint256 seq = mandate.abstain("within bounds, no action needed");
        assertEq(seq, 1);
        assertEq(mandate.decisionCount(), 1);
    }

    /// The agent cannot widen its own leash — only the owner sets terms.
    function test_agentCannotChangeTerms() public {
        vm.prank(agent);
        vm.expectRevert(Mandate.NotOwner.selector);
        mandate.setTerms(
            Mandate.Terms({maxLeverageBps: 1_000_000, maxSlippageBps: 10_000, drawdownTriggerBps: 0})
        );
    }

    function test_hedgeRequired() public view {
        assertTrue(mandate.hedgeRequired(1_200));
        assertFalse(mandate.hedgeRequired(500));
    }
}
