// SPDX-License-Identifier: GPL-3.0-or-later
// Derived from https://docs.aave.com/developers/guides/flash-loans
pragma solidity ^0.7.5;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "erc3156/contracts/interfaces/IERC3156FlashBorrower.sol";
import "./interfaces/IAaveV2FlashLender.sol";
import "./interfaces/IAaveV2FlashBorrower.sol";
import "./interfaces/ILendingPool.sol";
import "./interfaces/ILendingPoolAddressesProvider.sol";
import "./libraries/AaveDataTypes.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract AaveV2FlashLender is
    IAaveV2FlashLender,
    IAaveV2FlashBorrower,
    Ownable
{
    using SafeMath for uint256;

    bytes32 public constant CALLBACK_SUCCESS =
        keccak256("ERC3156FlashBorrower.onFlashLoan");
    ILendingPool public lendingPool;

    constructor(ILendingPoolAddressesProvider _provider) {
        lendingPool = ILendingPool(_provider.getLendingPool());
        require(
            address(lendingPool) != address(0),
            "AaveV2FlashLender: lendingPool address is zero address!"
        );
    }

    function getFlashLoanInfoListWithCheaperFeePriority(address _token, uint256 _amount)
        external
        view
        override
        returns (address[] memory pools, uint256[] memory maxloans, uint256[] memory fees)
    {
        address[] memory pools = new address[](1);
        uint256[] memory maxloans = new uint256[](1);
        uint256[] memory fees = new uint256[](1);

        AaveDataTypes.ReserveData memory reserveData = lendingPool
            .getReserveData(_token);
        uint256 maxloan = IERC20(_token).balanceOf(reserveData.aTokenAddress);

        if (reserveData.aTokenAddress != address(0) && maxloan >= _amount) {
            pools[0] = address(0);
            maxloans[0] = maxloan;
            fees[0] = _flashFee(_token, 1e18);
            return (pools, maxloans, fees);
        } else {
            pools[0] = address(0);
            maxloans[0] = uint256(0);
            fees[0] = uint256(0);
            return (pools, maxloans, fees);
        }
    }

    function flashFee(address _pair, address _token, uint256 _amount)
        external
        view
        override
        returns (uint256)
    {
        return _flashFee(_token, _amount);
    }

   function _flashFee(address _token, uint256 _amount)
        internal
        view
        returns (uint256)
    {
        return _amount.mul(lendingPool.FLASHLOAN_PREMIUM_TOTAL()).div(10000);
    }

    function flashLoan(
        address _pair,
        IERC3156FlashBorrower _receiver,
        address _token,
        uint256 _amount,
        bytes calldata _data
    ) external override returns (bool) {
        _flashLoan(_receiver, _token, _amount, _data);
        return true;
    }

    function _flashLoan(
        IERC3156FlashBorrower _receiver,
        address _token,
        uint256 _amount,
        bytes calldata _data
    ) internal {
        address[] memory tokens = new address[](1);
        tokens[0] = address(_token);

        uint256[] memory amounts = new uint256[](1);
        amounts[0] = _amount;

        // 0 = no debt, 1 = stable, 2 = variable
        uint256[] memory modes = new uint256[](1);
        modes[0] = 0;

        address onBehalfOf = address(this);
        bytes memory data = abi.encode(msg.sender, _receiver, _data);
        uint16 referralCode = 0;

        lendingPool.flashLoan(
            address(this),
            tokens,
            amounts,
            modes,
            onBehalfOf,
            data,
            referralCode
        );
    }

    function executeOperation(
        address[] calldata _tokens,
        uint256[] calldata _amounts,
        uint256[] calldata _fees,
        address _sender,
        bytes calldata _data
    ) external override returns (bool) {
        require(
            msg.sender == address(lendingPool),
            "AaveV2FlashLender: msg.sender must be Lending Pool"
        );
        require(
            _sender == address(this),
            "AaveV2FlashLender: _sender must be this contract"
        );

        (
            address origin,
            IERC3156FlashBorrower receiver,
            bytes memory userData
        ) = abi.decode(_data, (address, IERC3156FlashBorrower, bytes));

        address token = _tokens[0];
        uint256 amount = _amounts[0];
        uint256 fee = _fees[0];

        IERC20(token).transfer(origin, amount);
        require(
            receiver.onFlashLoan(origin, token, amount, fee, userData) ==
                CALLBACK_SUCCESS,
            "AaveV2FlashLender: Callback failed"
        );
        IERC20(token).transferFrom(origin, address(this), amount.add(fee));

        IERC20(token).approve(address(lendingPool), amount.add(fee));

        return true;
    }
}
