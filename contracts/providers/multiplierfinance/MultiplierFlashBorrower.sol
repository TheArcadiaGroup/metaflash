// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.0;

import {IERC20MF} from "./interfaces/IERC20MF.sol";
import "erc3156/contracts/interfaces/IERC3156FlashBorrower.sol";
import "./interfaces/IMultiplierFlashLender.sol";

contract MultiplierFlashBorrower is IERC3156FlashBorrower {
    enum Action {
        NORMAL,
        REENTER
    }

    bytes32 public constant CALLBACK_SUCCESS =
        keccak256("ERC3156FlashBorrower.onFlashLoan");

    uint256 public flashBalance;
    address public flashSender;
    address public flashToken;
    uint256 public flashAmount;
    uint256 public flashFee;

    /// @dev ERC-3156 Flash loan callback
    function onFlashLoan(
        address sender,
        address token,
        uint256 amount,
        uint256 fee,
        bytes calldata data
    ) external override returns (bytes32) {
        require(
            sender == address(this),
            "MultiplierFlashBorrower: sender must be this contract"
        );
        Action action = abi.decode(data, (Action));
        flashSender = sender;
        flashToken = token;
        flashAmount = amount;
        flashFee = fee;
        if (action == Action.NORMAL) {
            flashBalance = IERC20MF(token).balanceOf(address(this));
        } else if (action == Action.REENTER) {
            // do nothing
        }
        return CALLBACK_SUCCESS;
    }

    function flashBorrow(
        address pair,
        IMultiplierFlashLender lender,
        address token,
        uint256 amount
    ) public {
        uint256 _allowance = IERC20MF(token).allowance(
            address(this),
            address(lender)
        );
        uint256 _fee = lender.flashFee(pair, token, amount);
        uint256 _repayment = amount + _fee;
        IERC20MF(token).approve(address(lender), _allowance + _repayment);
        bytes memory data = abi.encode(Action.NORMAL);
        lender.flashLoan(pair, this, token, amount, data);
    }
}
