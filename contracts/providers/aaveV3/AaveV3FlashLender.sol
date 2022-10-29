// SPDX-License-Identifier: GPL-3.0-or-later
// Derived from https://docs.aave.com/developers/guides/flash-loans
pragma solidity 0.8.10;
pragma experimental ABIEncoderV2;

import {IERC20_} from "../../interfaces/IERC20_.sol";
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
    address public operator;
    address public flashloaner;

    constructor(IAaveV3PoolAddressesProvider _provider) {
        pool = IAaveV3Pool(_provider.getPool());
        require(
            address(pool) != address(0),
            "AaveV3FlashLender: pool address is zero address!"
        );
        operator = msg.sender;
    }

    modifier onlyOperator() {
        require(msg.sender == operator, "AaveV3FlashLender: Not operator");
        _;
    }

    modifier onlyFlashLoaner() {
        require(
            msg.sender == flashloaner,
            "AaveV3FlashLender: Not flashloaner"
        );
        _;
    }

    function setOperator(address _operator) external onlyOperator {
        require(
            _operator != address(0),
            "AaveV3FlashLender: _operator is address(0)"
        );
        operator = _operator;
    }

    function setFlashLoaner(address _flashloaner) external onlyOperator {
        require(
            _flashloaner != address(0),
            "AaveV3FlashLender: _flashloaner is address(0)"
        );
        flashloaner = _flashloaner;
    }

    function getFlashLoanInfoListWithCheaperFeePriority(
        address _token,
        uint256 _amount
    )
        external
        view
        override
        onlyFlashLoaner
        returns (
            address[] memory pools,
            uint256[] memory maxloans,
            uint256[] memory fees
        )
    {
        address[] memory pools = new address[](1);
        uint256[] memory maxloans = new uint256[](1);
        uint256[] memory fees = new uint256[](1);

        DataTypes.ReserveData memory reserveData = pool
            .getReserveData(_token);
        uint256 maxloan = IERC20_(_token).balanceOf(reserveData.aTokenAddress);

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

    function flashFee(
        address _pair,
        address _token,
        uint256 _amount
    ) external view override onlyFlashLoaner returns (uint256) {
        return _flashFee(_token, _amount);
    }

    function _flashFee(address _token, uint256 _amount)
        internal
        view
        returns (uint256)
    {
        return _amount.mul(pool.FLASHLOAN_PREMIUM_TOTAL()).div(10000);
    }

    function flashLoan(
        address _pair,
        IERC3156FlashBorrower _receiver,
        address _token,
        uint256 _amount,
        bytes calldata _userData
    ) external override onlyFlashLoaner returns (bool) {
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
            "AaveV3FlashLender: msg.sender must be Lending Pool"
        );
        require(
            _sender == address(this),
            "AaveV3FlashLender: _sender must be this contract"
        );

        (
            address origin,
            IERC3156FlashBorrower receiver,
            bytes memory userData
        ) = abi.decode(_data, (address, IERC3156FlashBorrower, bytes));

        IERC20_(_token).transfer(origin, _amount);
        require(
            receiver.onFlashLoan(origin, _token, _amount, _premium, userData) ==
                CALLBACK_SUCCESS,
            "AaveV3FlashLender: Callback failed"
        );
        IERC20_(_token).transferFrom(
            origin,
            address(this),
            _amount.add(_premium)
        );

        IERC20_(_token).approve(address(pool), _amount.add(_premium));

        return true;
    }
}
