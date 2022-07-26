// SPDX-License-Identifier: GPL-3.0-or-later
// Derived from https://github.com/kollateral/kollateral/blob/master/protocol/contracts/liquidity/kollateral/KollateralLiquidityProxy.sol
pragma solidity ^0.7.5;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "erc3156/contracts/interfaces/IERC3156FlashBorrower.sol";
import "./interfaces/IDYDXFlashLender.sol";
import "./interfaces/ISoloMargin.sol";
import "./interfaces/IDYDXFlashBorrower.sol";
import "./libraries/DYDXDataTypes.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract DYDXFlashLender is IDYDXFlashLender, IDYDXFlashBorrower, Ownable {
    using SafeMath for uint256;

    bytes32 public constant CALLBACK_SUCCESS =
        keccak256("ERC3156FlashBorrower.onFlashLoan");
    uint256 internal NULL_ACCOUNT_ID = 0;
    uint256 internal NULL_MARKET_ID = 0;
    DYDXDataTypes.AssetAmount internal NULL_AMOUNT =
        DYDXDataTypes.AssetAmount({
            sign: false,
            denomination: DYDXDataTypes.AssetDenomination.Wei,
            ref: DYDXDataTypes.AssetReference.Delta,
            value: 0
        });
    bytes internal NULL_DATA = "";

    ISoloMargin public soloMargin;
    mapping(address => uint256) public tokenAddressToMarketId;
    mapping(address => bool) public tokensRegistered;

    constructor(ISoloMargin _soloMargin) {
        require(
            address(_soloMargin) != address(0),
            "DYDXFlashLender: _soloMargin address is zero address!"
        );
        soloMargin = _soloMargin;

        for (uint256 marketId = 0; marketId <= 3; marketId++) {
            address token = soloMargin.getMarketTokenAddress(marketId);
            tokenAddressToMarketId[token] = marketId;
            tokensRegistered[token] = true;
        }
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
        uint256 maxloan = tokensRegistered[_token] == true
            ? IERC20(_token).balanceOf(address(soloMargin))
            : 0;
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
        uint256 maxloan = tokensRegistered[_token] == true
            ? IERC20(_token).balanceOf(address(soloMargin))
            : 0;
        if (maxloan >= _amount) {
            return 2;
        } else {
            return 0;
        }
    }

    function flashFeeWithManyPairs_OR_ManyPools(address _token, uint256 _amount)
        public
        view
        override
        returns (uint256, uint256)
    {
        uint256 maxloan = tokensRegistered[_token] == true
            ? IERC20(_token).balanceOf(address(soloMargin))
            : 0;
        if (maxloan > 0) {
            return (2, 1);
        } else {
            return (0, 0);
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
        bytes memory _userData
    ) internal {
        DYDXDataTypes.ActionArgs[]
            memory operations = new DYDXDataTypes.ActionArgs[](3);
        operations[0] = getWithdrawAction(_token, _amount);
        operations[1] = getCallAction(
            abi.encode(msg.sender, _receiver, _token, _amount, _userData)
        );
        operations[2] = getDepositAction(_token, _amount.add(2));
        DYDXDataTypes.AccountInfo[]
            memory accountInfos = new DYDXDataTypes.AccountInfo[](1);
        accountInfos[0] = getAccountInfo();

        soloMargin.operate(accountInfos, operations);
    }

    /// @dev DYDX flash loan callback. It sends the value borrowed to `receiver`, and takes it back plus a `flashFee` after the ERC3156 callback.
    function callFunction(
        address _sender,
        DYDXDataTypes.AccountInfo memory,
        bytes memory _data
    ) public override {
        require(
            msg.sender == address(soloMargin),
            "DYDXFlashLender: Callback only from SoloMargin"
        );
        require(
            _sender == address(this),
            "DYDXFlashLender: FlashLoan only from this contract"
        );

        (
            address origin,
            IERC3156FlashBorrower receiver,
            address token,
            uint256 amount,
            bytes memory userData
        ) = abi.decode(
                _data,
                (address, IERC3156FlashBorrower, address, uint256, bytes)
            );

        uint256 fee = 2;

        // Transfer to `receiver`
        require(
            IERC20(token).transfer(address(receiver), amount),
            "DYDXFlashLender: Transfer failed"
        );
        require(
            receiver.onFlashLoan(origin, token, amount, fee, userData) ==
                CALLBACK_SUCCESS,
            "DYDXFlashLender: Callback failed"
        );
        require(
            IERC20(token).transferFrom(
                address(receiver),
                address(this),
                amount.add(fee)
            ),
            "DYDXFlashLender: Transfer failed"
        );

        // Approve the SoloMargin contract allowance to *pull* the owed amount
        IERC20(token).approve(address(soloMargin), amount.add(fee));
    }

    function getAccountInfo()
        internal
        view
        returns (DYDXDataTypes.AccountInfo memory)
    {
        return DYDXDataTypes.AccountInfo({owner: address(this), number: 1});
    }

    function getWithdrawAction(address _token, uint256 _amount)
        internal
        view
        returns (DYDXDataTypes.ActionArgs memory)
    {
        return
            DYDXDataTypes.ActionArgs({
                actionType: DYDXDataTypes.ActionType.Withdraw,
                accountId: 0,
                amount: DYDXDataTypes.AssetAmount({
                    sign: false,
                    denomination: DYDXDataTypes.AssetDenomination.Wei,
                    ref: DYDXDataTypes.AssetReference.Delta,
                    value: _amount
                }),
                primaryMarketId: tokenAddressToMarketId[_token],
                secondaryMarketId: NULL_MARKET_ID,
                otherAddress: address(this),
                otherAccountId: NULL_ACCOUNT_ID,
                data: NULL_DATA
            });
    }

    function getDepositAction(address _token, uint256 _repaymentAmount)
        internal
        view
        returns (DYDXDataTypes.ActionArgs memory)
    {
        return
            DYDXDataTypes.ActionArgs({
                actionType: DYDXDataTypes.ActionType.Deposit,
                accountId: 0,
                amount: DYDXDataTypes.AssetAmount({
                    sign: true,
                    denomination: DYDXDataTypes.AssetDenomination.Wei,
                    ref: DYDXDataTypes.AssetReference.Delta,
                    value: _repaymentAmount
                }),
                primaryMarketId: tokenAddressToMarketId[_token],
                secondaryMarketId: NULL_MARKET_ID,
                otherAddress: address(this),
                otherAccountId: NULL_ACCOUNT_ID,
                data: NULL_DATA
            });
    }

    function getCallAction(bytes memory _data)
        internal
        view
        returns (DYDXDataTypes.ActionArgs memory)
    {
        return
            DYDXDataTypes.ActionArgs({
                actionType: DYDXDataTypes.ActionType.Call,
                accountId: 0,
                amount: NULL_AMOUNT,
                primaryMarketId: NULL_MARKET_ID,
                secondaryMarketId: NULL_MARKET_ID,
                otherAddress: address(this),
                otherAccountId: NULL_ACCOUNT_ID,
                data: _data
            });
    }
}
