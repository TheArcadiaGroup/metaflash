// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

interface UniswapV2FactoryLike {
    function getPair(address tokenA, address tokenB) external view returns (address pair);
}
