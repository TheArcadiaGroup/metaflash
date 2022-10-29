// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.5.16;

import {IERC20CF} from "./interfaces/IERC20CF.sol";
import "./interfaces/IERC3156FlashBorrower.sol";
import "./interfaces/ICreamFinanceFlashLender.sol";

contract CreamFinanceFlashBorrower is IERC3156FlashBorrower {
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
    ) external returns (bytes32) {
        require(
            sender == address(this),
            "CreamFinanceFlashBorrower: sender must be this contract"
        );
        Action action = abi.decode(data, (Action));
        flashSender = sender;
        flashToken = token;
        flashAmount = amount;
        flashFee = fee;
        if (action == Action.NORMAL) {
            flashBalance = IERC20CF(token).balanceOf(address(this));
        } else if (action == Action.REENTER) {
            // do nothing
        }
        return CALLBACK_SUCCESS;
    }

    function flashBorrow(
        address pair,
        ICreamFinanceFlashLender lender,
        address token,
        uint256 amount
    ) public {
        uint256 _allowance = IERC20CF(token).allowance(
            address(this),
            address(lender)
        );
        uint256 _fee = lender.flashFee(pair, token, amount);
        uint256 _repayment = amount + _fee;
        IERC20CF(token).approve(address(lender), _allowance + _repayment);
        bytes memory data = abi.encode(Action.NORMAL);
        lender.flashLoan(pair, this, token, amount, data);
    }
}
