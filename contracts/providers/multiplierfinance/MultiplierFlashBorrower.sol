// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.0;

import {IERC20} from "./interfaces/IERC20.sol";
import "erc3156/contracts/interfaces/IERC3156FlashBorrower.sol";
import "./interfaces/IMultiplierFlashLender.sol";

contract MultiplierFlashBorrower is IERC3156FlashBorrower {
    enum Action {
        NORMAL,
        STEAL,
        REENTER
    }

    bytes32 public constant CALLBACK_SUCCESS =
        keccak256("ERC3156FlashBorrower.onFlashLoan");

    uint256 public flashBalance;
    address public flashSender;
    address public flashToken;
    uint256 public flashAmount;
    uint256 public flashFee;
    uint256 public totalFlashBalance;

    receive() external payable {}

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
            "MultiplierFlashBorrower: External loan initiator"
        );
        Action action = abi.decode(data, (Action)); // Use this to unpack arbitrary data
        flashSender = sender;
        flashToken = token;
        flashAmount = amount;
        flashFee = fee;
        if (action == Action.NORMAL) {
            flashBalance = IERC20(token).balanceOf(address(this));
            totalFlashBalance = totalFlashBalance + amount + fee;
        } else if (action == Action.STEAL) {
            // do nothing
        } else if (action == Action.REENTER) {
            // flashBorrow(IERC3156FlashLender(msg.sender), token, amount * 2);
        }
        return CALLBACK_SUCCESS;
    }

    function flashBorrow(
        IMultiplierFlashLender lender,
        address token,
        uint256 amount
    ) public {
        uint256 _allowance = IERC20(token).allowance(
            address(this),
            address(lender)
        );
        uint256 _fee = lender.flashFee(token, amount);
        uint256 _repayment = amount + _fee + 1;
        IERC20(token).approve(address(lender), _allowance + _repayment);
        // Use this to pack arbitrary data to `onFlashLoan`
        bytes memory data = abi.encode(Action.NORMAL);
        lender.flashLoan(this, token, amount, data);
    }

    function flashBorrowWithManyPairs_OR_ManyPools(
        IMultiplierFlashLender lender,
        address token,
        uint256 amount
    ) public {
        uint256 _allowance = IERC20(token).allowance(
            address(this),
            address(lender)
        );
        uint256 _fee = lender.flashFeeWithManyPairs_OR_ManyPools(token, amount);
        uint256 _repayment = amount + _fee + 1;
        IERC20(token).approve(address(lender), _allowance + _repayment);
        // Use this to pack arbitrary data to `onFlashLoan`
        bytes memory data = abi.encode(Action.NORMAL);

        lender.flashLoanWithManyPairs_OR_ManyPools(this, token, amount, data);
    }
}
