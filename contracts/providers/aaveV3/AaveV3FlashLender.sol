// SPDX-License-Identifier: GPL-3.0-or-later
// Derived from https://docs.aave.com/developers/guides/flash-loans
pragma solidity 0.8.10;
pragma experimental ABIEncoderV2;

import {IERC20} from "./interfaces/IERC20.sol";
import {SafeMath} from "./libraries/SafeMath.sol";
import {Ownable} from "./libraries/Ownable.sol";
import "./interfaces/IAaveV3FlashBorrower.sol";
import "./interfaces/IAaveV3FlashLender.sol";
import "./interfaces/IAaveV3Pool.sol";
import "./interfaces/IAaveV3PoolAddressesProvider.sol";
import "./libraries/DataTypes.sol";

contract AaveV3FlashLender is
    IAaveV3FlashLender,
    IAaveV3FlashBorrower,
    Ownable
{
    using SafeMath for uint256;

    bytes32 public constant CALLBACK_SUCCESS =
        keccak256("ERC3156FlashBorrower.onFlashLoan");
    IAaveV3Pool public pool;

    constructor(IAaveV3PoolAddressesProvider _provider) {
        pool = IAaveV3Pool(_provider.getPool());
        require(
            address(pool) != address(0),
            "AaveV3FlashLender: pool address is zero address!"
        );
    }

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
        DataTypes.ReserveData memory reserveData = pool.getReserveData(_token);
        uint256 maxloan = IERC20(_token).balanceOf(reserveData.aTokenAddress);

        if (reserveData.aTokenAddress != address(0) && maxloan >= _amount) {
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
        DataTypes.ReserveData memory reserveData = pool.getReserveData(_token);
        uint256 maxloan = IERC20(_token).balanceOf(reserveData.aTokenAddress);

        if (reserveData.aTokenAddress != address(0) && maxloan >= _amount) {
            return _amount.mul(pool.FLASHLOAN_PREMIUM_TOTAL()).div(10000);
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
        DataTypes.ReserveData memory reserveData = pool.getReserveData(_token);
        uint256 maxloan = IERC20(_token).balanceOf(reserveData.aTokenAddress);

        if (reserveData.aTokenAddress != address(0) && maxloan > 0) {
            return _amount.mul(pool.FLASHLOAN_PREMIUM_TOTAL()).div(10000);
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
        bytes calldata _userData
    ) internal {
        bytes memory data = abi.encode(msg.sender, _receiver, _userData);
        uint16 referralCode = 0;

        pool.flashLoanSimple(
            address(this),
            _token,
            _amount,
            data,
            referralCode
        );
    }

    function executeOperation(
        address _token,
        uint256 _amount,
        uint256 _premium,
        address _sender,
        bytes calldata _data
    ) external returns (bool) {
        require(
            msg.sender == address(pool),
            "AaveV3FlashLender: Callbacks only allowed from Lending Pool"
        );
        require(
            _sender == address(this),
            "AaveV3FlashLender: Callbacks only initiated from this contract"
        );

        (
            address origin,
            IERC3156FlashBorrower receiver,
            bytes memory userData
        ) = abi.decode(_data, (address, IERC3156FlashBorrower, bytes));

        IERC20(_token).transfer(origin, _amount);
        require(
            receiver.onFlashLoan(origin, _token, _amount, _premium, userData) ==
                CALLBACK_SUCCESS,
            "AaveV3FlashLender: Callback failed"
        );
        IERC20(_token).transferFrom(
            origin,
            address(this),
            _amount.add(_premium)
        );

        IERC20(_token).approve(address(pool), _amount.add(_premium));

        return true;
    }
}
