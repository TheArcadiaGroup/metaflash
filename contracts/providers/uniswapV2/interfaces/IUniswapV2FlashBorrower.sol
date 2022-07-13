// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.7.5;

interface IUniswapV2FlashBorrower {
    function uniswapV2Call(
        address _sender,
        uint256 _amount0,
        uint256 _amount1,
        bytes calldata _data
    ) external;
}
