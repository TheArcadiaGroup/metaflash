// SPDX-License-Identifier: GPL-3.0-or-later
// Derived from https://github.com/aave/protocol-v2/tree/master/contracts/protocol
pragma solidity ^0.7.5;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";


contract ATokenMock is ERC20 {

    IERC20 public underlying;
    constructor (IERC20 underlying_, string memory name, string memory symbol) ERC20(name, symbol) {
        underlying = underlying_;
    }

    function transferUnderlyingTo(address to, uint256 amount) external {
        underlying.transfer(to, amount); // Remember to mint some tokens for ATokenMock first
    }
}