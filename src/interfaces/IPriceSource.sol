// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Trusted reference price for the slippage floor. The agent does not supply it — if it
/// could, it could authorize its own bad fills. Production reads the venue's on-chain quote.
interface IPriceSource {
    function expectedOut(address tokenIn, address tokenOut, uint256 amountIn) external view returns (uint256);
}
