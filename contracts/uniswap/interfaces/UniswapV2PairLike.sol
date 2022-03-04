// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

interface UniswapV2PairLike {
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
