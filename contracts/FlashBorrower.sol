pragma solidity ^0.8.0;

import "./libraries/SafeMath.sol";
import "./interfaces/IERC20.sol";
import "./interfaces/IFlashLender.sol";
import "hardhat/console.sol";

contract FlashBorrower is IERC3156FlashBorrower {
    using SafeMath for uint256;

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
    uint256 public totalFlashBalance;

    function onFlashLoan(
        address sender,
        address token,
        uint256 amount,
        uint256 fee,
        bytes calldata data
    ) external returns (bytes32) {
        require(
            sender == address(this),
            "FlashBorrower: sender must be this contract"
        );
        Action action = abi.decode(data, (Action)); 
        flashSender = sender;
        flashToken = token;
        flashAmount = amount;
        flashFee = fee;
        if (action == Action.NORMAL) {
            flashBalance = IERC20(token).balanceOf(address(this));
            totalFlashBalance = totalFlashBalance.add(amount).add(fee);
        }
        return CALLBACK_SUCCESS;
    }

    function flashBorrowWithCheapestProvider(
        IFlashLender lender,
        address token,
        uint256 amount
    ) public {
        uint256 _allowance = IERC20(token).allowance(
            address(this),
            address(lender)
        );
        uint256 _fee = lender.flashFeeWithCheapestProvider(token, amount);
        uint256 _repayment = amount.add(_fee);
        IERC20(token).approve(address(lender), _allowance.add(_repayment));
        bytes memory data = abi.encode(Action.NORMAL);
        lender.flashLoanWithCheapestProvider(this, token, amount, data);
    }

    function flashBorrowWithManyProviders(
        IFlashLender lender,
        address token,
        uint256 amount,
        uint256 minAmount
    ) public {
        uint256 _allowance = IERC20(token).allowance(
            address(this),
            address(lender)
        );
        uint256 _fee = lender.flashFeeWithManyProviders(token, amount, minAmount);
        uint256 _repayment = amount.add(_fee);
        IERC20(token).approve(address(lender), _allowance.add(_repayment).add(1));
        bytes memory data = abi.encode(Action.NORMAL);
        lender.flashLoanWithManyProviders(this, token, amount, data, minAmount);
    }
}
