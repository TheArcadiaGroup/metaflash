// SPDX-License-Identifier: MIT
// Derived from https://github.com/aave/protocol-v2/tree/master/contracts/protocol
pragma solidity ^0.8.4;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "../../mock/MockToken.sol";

contract ATokenMock is MockToken {
    IERC20 public underlying;

    constructor(
        IERC20 underlying_,
        string memory name,
        string memory symbol
    ) MockToken(name, symbol) {
        underlying = underlying_;
    }

    function transferUnderlyingTo(address to, uint256 amount) external {
        underlying.transfer(to, amount); // Remember to mint some tokens for ATokenMock first
    }
}
