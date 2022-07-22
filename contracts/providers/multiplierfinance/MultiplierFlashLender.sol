// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.0;
pragma experimental ABIEncoderV2;


import "./interfaces/IMultiplierFlashLender.sol";
import "./interfaces/IMultiplierFlashBorrower.sol";
import "./interfaces/ILendingPool.sol";
import {IERC20} from "./interfaces/IERC20.sol";
import {SafeMath} from "./libraries/SafeMath.sol";
import {Ownable} from "./libraries/Ownable.sol";

contract MultiplierFlashLender is
    IMultiplierFlashLender,
    IMultiplierFlashBorrower,
    Ownable
{
    using SafeMath for uint256;

    bytes32 public constant CALLBACK_SUCCESS =
        keccak256("ERC3156FlashBorrower.onFlashLoan");
    ILendingPool public lendingpool;
    address public core;
    uint256 public protocolFeeRate;

    constructor(address _lendingpool) {
        require(
            address(_lendingpool) != address(0),
            "MultiplierFlashLender: lendingPool address is zero address!"
        );
        lendingpool = ILendingPool(_lendingpool);
        core = lendingpool.core();
        protocolFeeRate = IFeeProvider(lendingpool.feeProvider())
            .getFlashLoanFee();
    }

    receive() external payable {}

    function maxFlashLoan(address _token, uint256 _amount)
        external
        view
        override
        returns (uint256)
    {
        return _maxFlashLoan(_token, _amount);
    }

    function maxFlashLoanWithManyPairs_OR_ManyPools(address _token)
        external
        view
        override
        returns (uint256)
    {
        return _maxFlashLoan(_token, 1);
    }

    function _maxFlashLoan(address _token, uint256 _amount)
        internal
        view
        returns (uint256)
    {
        uint256 maxloan = IERC20(_token).balanceOf(core);
        if (maxloan >= _amount) {
            return maxloan;
        } else {
            return 0;
        }
    }

    function flashFee(address _token, uint256 _amount)
        public
        view
        override
        returns (uint256)
    {
        uint256 maxloan = IERC20(_token).balanceOf(core);
        if (maxloan >= _amount) {
            return _amount.mul(protocolFeeRate).div(1e18);
        } else {
            return 0;
        }
    }

    function flashFeeWithManyPairs_OR_ManyPools(address _token, uint256 _amount)
        public
        view
        override
        returns (uint256)
    {
        uint256 maxloan = IERC20(_token).balanceOf(core);
        if (maxloan > 0) {
            return _amount.mul(protocolFeeRate).div(1e18);
        } else {
            return 0;
        }
    }

    function flashLoan(
        IERC3156FlashBorrower _receiver,
        address _token,
        uint256 _amount,
        bytes calldata _userData
    ) external override returns (bool) {
        _flashLoan(_receiver, _token, _amount, _userData);
        return true;
    }

    function flashLoanWithManyPairs_OR_ManyPools(
        IERC3156FlashBorrower _receiver,
        address _token,
        uint256 _amount,
        bytes calldata _userData
    ) external override returns (bool) {
        _flashLoan(_receiver, _token, _amount, _userData);
        return true;
    }

    function _flashLoan(
        IERC3156FlashBorrower _receiver,
        address _token,
        uint256 _amount,
        bytes calldata _data
    ) internal {
        bytes memory data = abi.encode(
            address(this),
            msg.sender,
            _receiver,
            _data
        );
        lendingpool.flashLoan(address(this), _token, _amount, data);
    }

    function executeOperation(
        address _token,
        uint256 _amount,
        uint256 _fee,
        bytes calldata _data
    ) external override {
        require(
            msg.sender == address(lendingpool),
            "MultiplierFlashLender: Callbacks only allowed from Lending Pool"
        );

        (
            address sender,
            address origin,
            IERC3156FlashBorrower receiver,
            bytes memory userData
        ) = abi.decode(_data, (address, address, IERC3156FlashBorrower, bytes));

        require(
            sender == address(this),
            "MultiplierFlashLender: Callbacks only initiated from this contract"
        );

        IERC20(_token).transfer(origin, _amount);

        require(
            receiver.onFlashLoan(origin, _token, _amount, _fee, userData) ==
                CALLBACK_SUCCESS,
            "MultiplierFlashLender: Callback failed"
        );

        IERC20(_token).transferFrom(origin, address(this), _amount.add(_fee));

        IERC20(_token).transfer(core, _amount.add(_fee));
    }
}
