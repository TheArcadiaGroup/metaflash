// SPDX-License-Identifier: MIT

pragma solidity 0.8.10;

import {ERC20} from '../dependencies/openzeppelin/contracts/ERC20.sol';
import {Ownable} from '../dependencies/openzeppelin/contracts/Ownable.sol';

/**
 * @title Generic ERC20 token
 * @notice This contract simulates a generic ERC20 token that is mintable and burnable.
 */
contract ERC20MockAAVEV3 is ERC20, Ownable {
    /**
     * @notice Deploy this contract with given name, symbol, and decimals
     * @dev the caller of this constructor will become the owner of this contract
     * @param name_ name of this token
     * @param symbol_ symbol of this token
     */
    constructor(
        string memory name_,
        string memory symbol_
    ) public ERC20(name_, symbol_) {
    }

    /**
     * @notice Mints given amount of tokens to recipient
     * @dev only owner can call this mint function
     * @param recipient address of account to receive the tokens
     * @param amount amount of tokens to mint
     */
    function mint(address recipient, uint256 amount) external {
        require(amount != 0, "amount == 0");
        _mint(recipient, amount);
    }
}
