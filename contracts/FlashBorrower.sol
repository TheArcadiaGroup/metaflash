// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.0;

import "./libraries/SafeMath.sol";
import "./interfaces/IERC20_.sol";
import "./interfaces/IFlashLender.sol";

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
        address _sender,
        address _token,
        uint256 _amount,
        uint256 _fee,
        bytes calldata _data
    ) external returns (bytes32) {
        require(
            _sender == address(this),
            "FlashBorrower: sender must be this contract"
        );

        Action action = abi.decode(_data, (Action));
        flashSender = _sender;
        flashToken = _token;
        flashAmount = _amount;
        flashFee = _fee;
        if (action == Action.NORMAL) {
            flashBalance = IERC20_(_token).balanceOf(address(this));
            totalFlashBalance = totalFlashBalance.add(_amount).add(_fee);
        }
        return CALLBACK_SUCCESS;
    }

    function flashBorrowWithCheapestProvider(
        IFlashLender _lender,
        address _token,
        uint256 _amount
    ) public {
        uint256 allowance = IERC20_(_token).allowance(
            address(this),
            address(_lender)
        );
        uint256 _fee = _lender.flashFeeWithCheapestProvider(_token, _amount);
        uint256 repayment = _amount.add(_fee);
        IERC20_(_token).approve(address(_lender), allowance.add(repayment));
        bytes memory data = abi.encode(Action.NORMAL);
        _lender.flashLoanWithCheapestProvider(this, _token, _amount, data);
    }

    function flashBorrowWithManyProviders(
        IFlashLender _lender,
        address _token,
        uint256 _amount,
        uint256 _minAmount
    ) public {
        uint256 allowance = IERC20_(_token).allowance(
            address(this),
            address(_lender)
        );
        uint256 fee = _lender.flashFeeWithManyProviders(
            _token,
            _amount,
            _minAmount
        );
        uint256 repayment = _amount.add(fee);
        IERC20_(_token).approve(address(_lender), allowance.add(repayment));
        bytes memory data = abi.encode(Action.NORMAL);
        _lender.flashLoanWithManyProviders(
            this,
            _token,
            _amount,
            data,
            _minAmount
        );
    }
}
