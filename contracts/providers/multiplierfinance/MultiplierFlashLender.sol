// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.0;
pragma experimental ABIEncoderV2;

import "./interfaces/IMultiplierFlashLender.sol";
import "./interfaces/IMultiplierFlashBorrower.sol";
import "./interfaces/ILendingPool.sol";
import {IERC20} from "./interfaces/IERC20.sol";
import {SafeMath} from "./libraries/SafeMath.sol";
import {WadRayMath} from "./libraries/WadRayMath.sol";
import {Ownable} from "./libraries/Ownable.sol";

contract MultiplierFlashLender is
    IMultiplierFlashLender,
    IMultiplierFlashBorrower,
    Ownable
{
    using SafeMath for uint256;
    using WadRayMath for uint256;

    bytes32 public constant CALLBACK_SUCCESS =
        keccak256("ERC3156FlashBorrower.onFlashLoan");

    ILendingPool public lendingpool;
    address public core;
    uint256 public protocolFeeRate;
    address public operator;
    address public flashloaner;

    constructor(address _lendingpool) {
        require(
            address(_lendingpool) != address(0),
            "MultiplierFlashLender: lendingPool address is zero address!"
        );
        lendingpool = ILendingPool(_lendingpool);
        core = lendingpool.core();
        protocolFeeRate = IFeeProvider(lendingpool.feeProvider())
            .getFlashLoanFee();
        operator = msg.sender;
    }

    modifier onlyOperator() {
        require(msg.sender == operator, "MultiplierFlashLender: Not operator");
        _;
    }

    modifier onlyFlashLoaner() {
        require(
            msg.sender == flashloaner,
            "MultiplierFlashLender: Not flashloaner"
        );
        _;
    }

    function setOperator(address _operator) external onlyOperator {
        require(
            _operator != address(0),
            "MultiplierFlashLender: _operator is address(0)"
        );
        operator = _operator;
    }

    function setFlashLoaner(address _flashloaner) external onlyOperator {
        require(
            _flashloaner != address(0),
            "MultiplierFlashLender: _flashloaner is address(0)"
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

        uint256 maxloan = IERC20(_token).balanceOf(core);

        if (maxloan >= _amount) {
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
    ) public view override onlyFlashLoaner returns (uint256) {
        return _flashFee(_token, _amount);
    }

    function _flashFee(address _token, uint256 _amount)
        internal
        view
        returns (uint256)
    {
        return _amount.wadMul(protocolFeeRate);
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
            "MultiplierFlashLender: msg.sender must be Lending Pool"
        );

        (
            address sender,
            address origin,
            IERC3156FlashBorrower receiver,
            bytes memory userData
        ) = abi.decode(_data, (address, address, IERC3156FlashBorrower, bytes));

        require(
            sender == address(this),
            "MultiplierFlashLender: _sender must be this contract"
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
