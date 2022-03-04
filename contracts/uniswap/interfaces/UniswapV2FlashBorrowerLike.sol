// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

interface UniswapV2FlashBorrowerLike {
    function uniswapV2Call(
        address _sender,
        uint256 _amount0,
        uint256 _amount1,
        bytes calldata _data
    ) external;
}
