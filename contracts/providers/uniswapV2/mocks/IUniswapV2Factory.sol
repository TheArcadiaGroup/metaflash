// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.7.5;


interface IUniswapV2Factory {
  function getPair(address tokenA, address tokenB) external view returns (address pair);
}