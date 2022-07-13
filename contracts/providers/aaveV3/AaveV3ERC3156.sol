// SPDX-License-Identifier: GPL-3.0-or-later
// Derived from https://docs.aave.com/developers/guides/flash-loans
pragma solidity 0.8.10;
pragma experimental ABIEncoderV2;

import {IERC20} from "./dependencies/openzeppelin/contracts/IERC20.sol";
import {SafeMath} from "./dependencies/openzeppelin/contracts/SafeMath.sol";
import {Ownable} from "./dependencies/openzeppelin/contracts/Ownable.sol";
import "erc3156/contracts/interfaces/IERC3156FlashBorrower.sol";
import "erc3156/contracts/interfaces/IERC3156FlashLender.sol";
import "./interfaces/IFlashLoanSimpleReceiver.sol";
import "./interfaces/IPool.sol";
import "./interfaces/IPoolAddressesProvider.sol";
import "./libraries/types/DataTypes.sol";

contract AaveV3ERC3156 is
    IERC3156FlashLender,
    IFlashLoanSimpleReceiver,
    Ownable
{
    using SafeMath for uint256;

    bytes32 public constant CALLBACK_SUCCESS =
        keccak256("ERC3156FlashBorrower.onFlashLoan");
    IPool public pool;

    constructor(IPoolAddressesProvider _provider) {
        pool = IPool(_provider.getPool());
        require(
            address(pool) != address(0),
            "AaveV3ERC3156: pool address is zero address!"
        );
    }

    function maxFlashLoan(address _token)
        external
        view
        override
        returns (uint256)
    {
        DataTypes.ReserveData memory reserveData = pool.getReserveData(_token);
        return
            reserveData.aTokenAddress != address(0)
                ? IERC20(_token).balanceOf(reserveData.aTokenAddress)
                : 0;
    }

    function flashFee(address _token, uint256 _amount)
        public
        view
        override
        returns (uint256)
    {
        DataTypes.ReserveData memory reserveData = pool.getReserveData(_token);
        // require(
        //     reserveData.aTokenAddress != address(0),
        //     "AaveV3ERC3156: Unsupported currency"
        // );
        return _amount.mul(pool.FLASHLOAN_PREMIUM_TOTAL()).div(10000);
    }

    function flashLoan(
        IERC3156FlashBorrower _receiver,
        address _token,
        uint256 _amount,
        bytes calldata _userData
    ) external override returns (bool) {
        bytes memory data = abi.encode(msg.sender, _receiver, _userData);
        uint16 referralCode = 0;

        pool.flashLoanSimple(
            address(this),
            _token,
            _amount,
            data,
            referralCode
        );

        return true;
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
            "AaveV3ERC3156: Callbacks only allowed from Lending Pool"
        );
        require(
            _sender == address(this),
            "AaveV3ERC3156: Callbacks only initiated from this contract"
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
            "AaveV3ERC3156: Callback failed"
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
