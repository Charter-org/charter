// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {Mandate} from "../src/Mandate.sol";
import {IERC20} from "../src/interfaces/IERC20.sol";
import {IPriceSource} from "../src/interfaces/IPriceSource.sol";

/// Minimal ERC20 for tests.
contract MockERC20 {
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    function mint(address to, uint256 amt) external {
        balanceOf[to] += amt;
    }

    function approve(address s, uint256 a) external returns (bool) {
        allowance[msg.sender][s] = a;
        return true;
    }

    function transfer(address to, uint256 a) external returns (bool) {
        balanceOf[msg.sender] -= a;
        balanceOf[to] += a;
        return true;
    }

    function transferFrom(address f, address to, uint256 a) external returns (bool) {
        uint256 al = allowance[f][msg.sender];
        require(al >= a, "allowance");
        if (al != type(uint256).max) allowance[f][msg.sender] = al - a;
        balanceOf[f] -= a;
        balanceOf[to] += a;
        return true;
    }
}

/// Mock venue; fillBps < 10_000 simulates a worse fill.
contract MockRouter {
    uint256 public fillBps = 10_000;

    function setFillBps(uint256 b) external {
        fillBps = b;
    }

    function swap(address tokenIn, address tokenOut, uint256 amountIn) external {
        MockERC20(tokenIn).transferFrom(msg.sender, address(this), amountIn);
        MockERC20(tokenOut).mint(msg.sender, amountIn * fillBps / 10_000);
    }
}

contract MockPriceSource {
    function expectedOut(address, address, uint256 amountIn) external pure returns (uint256) {
        return amountIn;
    }
}

contract MandateExecutionTest is Test {
    Mandate internal mandate;
    MockERC20 internal tokenIn;
    MockERC20 internal tokenOut;
    MockRouter internal router;
    MockPriceSource internal price;

    address internal owner = address(0xA11CE);
    address internal agent = address(0xB0B);

    function setUp() public {
        vm.startPrank(owner);
        mandate = new Mandate(
            agent,
            Mandate.Terms({maxLeverageBps: 20_000, maxSlippageBps: 50, drawdownTriggerBps: 1_000})
        );
        tokenIn = new MockERC20();
        tokenOut = new MockERC20();
        router = new MockRouter();
        price = new MockPriceSource();
        mandate.setVenue(address(router), true);
        mandate.setPriceSource(IPriceSource(address(price)));
        // owner funds the mandate with 1,000 tokenIn
        tokenIn.mint(owner, 1_000e18);
        tokenIn.approve(address(mandate), 1_000e18);
        mandate.deposit(IERC20(address(tokenIn)), 1_000e18);
        vm.stopPrank();
    }

    function _swapCalldata(uint256 amountIn) internal view returns (bytes memory) {
        return abi.encodeWithSelector(MockRouter.swap.selector, address(tokenIn), address(tokenOut), amountIn);
    }

    function test_custody_agentCannotWithdraw() public {
        vm.prank(agent);
        vm.expectRevert(Mandate.NotOwner.selector);
        mandate.withdraw(IERC20(address(tokenIn)), 1, agent);
    }

    function test_ownerCanWithdraw() public {
        vm.prank(owner);
        mandate.withdraw(IERC20(address(tokenIn)), 500e18, owner);
        assertEq(tokenIn.balanceOf(owner), 500e18);
        assertEq(tokenIn.balanceOf(address(mandate)), 500e18);
    }

    function test_executeSwap_goodFill_succeeds() public {
        vm.prank(agent);
        uint256 out = mandate.executeSwap(
            address(router), IERC20(address(tokenIn)), IERC20(address(tokenOut)), 100e18, _swapCalldata(100e18)
        );
        assertEq(out, 100e18);
        assertEq(tokenOut.balanceOf(address(mandate)), 100e18);
        assertEq(tokenIn.balanceOf(address(mandate)), 900e18);
        assertEq(mandate.decisionCount(), 1);
    }

    // bad fill (1% vs 0.5% floor) reverts the whole tx; funds untouched
    function test_executeSwap_slippageBreach_revertsAndFundsUntouched() public {
        router.setFillBps(9_900);
        vm.prank(agent);
        vm.expectRevert(); // SlippageFloorBreached
        mandate.executeSwap(
            address(router), IERC20(address(tokenIn)), IERC20(address(tokenOut)), 100e18, _swapCalldata(100e18)
        );
        assertEq(tokenIn.balanceOf(address(mandate)), 1_000e18);
        assertEq(tokenOut.balanceOf(address(mandate)), 0);
        assertEq(mandate.decisionCount(), 0);
    }

    function test_executeSwap_unallowlistedVenue_reverts() public {
        MockRouter rogue = new MockRouter();
        vm.prank(agent);
        vm.expectRevert(abi.encodeWithSelector(Mandate.VenueNotAllowed.selector, address(rogue)));
        mandate.executeSwap(
            address(rogue), IERC20(address(tokenIn)), IERC20(address(tokenOut)), 100e18, _swapCalldata(100e18)
        );
    }

    function test_executeSwap_onlyAgent() public {
        vm.prank(address(0x9999));
        vm.expectRevert(Mandate.NotAgent.selector);
        mandate.executeSwap(
            address(router), IERC20(address(tokenIn)), IERC20(address(tokenOut)), 100e18, _swapCalldata(100e18)
        );
    }
}
