// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/interfaces/IERC3156FlashBorrower.sol";
import "@openzeppelin/contracts/interfaces/IERC3156FlashLender.sol";

contract FlashBorrower is IERC3156FlashBorrower, Ownable {
    enum Action {
        NORMAL,
        STEAL,
        REENTER
    }

    bytes32 public constant CALLBACK_SUCCESS = keccak256("ERC3156FlashBorrower.onFlashLoan");

    uint256 public flashBalance;
    address public flashSender;
    address public flashToken;
    uint256 public flashAmount;
    uint256 public flashFee;

    address[] public whitelistedLenders;

    event LenderWhitelisted(address indexed lender);

    /// @dev ERC-3156 Flash loan callback
    function onFlashLoan(
        address sender,
        address token,
        uint256 amount,
        uint256 fee,
        bytes calldata data
    ) external override returns (bytes32) {
        require(sender == address(this), "FlashBorrower: External loan initiator");
        Action action = abi.decode(data, (Action)); // Use this to unpack arbitrary data
        flashSender = sender;
        flashToken = token;
        flashAmount = amount;
        flashFee = fee;
        if (action == Action.NORMAL) {
            flashBalance = IERC20(token).balanceOf(address(this));
        } else if (action == Action.STEAL) {
            // do nothing
        } else if (action == Action.REENTER) {
            flashBorrow(IERC3156FlashLender(msg.sender), token, amount * 2);
        }
        return CALLBACK_SUCCESS;
    }

    function whitelistLender(address lender) external onlyOwner {
        require(lender != address(0), "FlashBorrower: INVALID_LENDER");
        whitelistedLenders.push(lender);
        emit LenderWhitelisted(lender);
    }

    function flashBorrow(address token, uint256 amount) external {
        uint256 index;
        uint256 minimumFee = type(uint256).max;
        for (uint256 i; i < whitelistedLenders.length; i += 1) {
            uint256 fee = IERC3156FlashLender(whitelistedLenders[i]).flashFee(token, amount);
            if (fee < minimumFee) {
                fee = minimumFee;
                index = i;
            }
        }
        flashBorrow(IERC3156FlashLender(whitelistedLenders[index]), token, amount);
    }

    function flashBorrow(
        IERC3156FlashLender lender,
        address token,
        uint256 amount
    ) public {
        // Use this to pack arbitrary data to `onFlashLoan`
        bytes memory data = abi.encode(Action.NORMAL);
        approveRepayment(lender, token, amount);
        lender.flashLoan(this, token, amount, data);
    }

    function flashBorrowAndSteal(
        IERC3156FlashLender lender,
        address token,
        uint256 amount
    ) public {
        // Use this to pack arbitrary data to `onFlashLoan`
        bytes memory data = abi.encode(Action.STEAL);
        lender.flashLoan(this, token, amount, data);
    }

    function flashBorrowAndReenter(
        IERC3156FlashLender lender,
        address token,
        uint256 amount
    ) public {
        // Use this to pack arbitrary data to `onFlashLoan`
        bytes memory data = abi.encode(Action.REENTER);
        approveRepayment(lender, token, amount);
        lender.flashLoan(this, token, amount, data);
    }

    function approveRepayment(
        IERC3156FlashLender lender,
        address token,
        uint256 amount
    ) public {
        uint256 _allowance = IERC20(token).allowance(address(this), address(lender));
        uint256 _fee = lender.flashFee(token, amount);
        uint256 _repayment = amount + _fee;
        IERC20(token).approve(address(lender), _allowance + _repayment);
    }
}
