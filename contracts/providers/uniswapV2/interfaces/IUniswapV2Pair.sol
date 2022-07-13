// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.7.5;

interface IUniswapV2Pair {
    function token0() external view returns (address);

    function token1() external view returns (address);

    function swap(
        uint256 amount0Out,
        uint256 amount1Out,
        address to,
        bytes calldata data
    ) external;

    function initialize(address token0, address token1) external;
}
