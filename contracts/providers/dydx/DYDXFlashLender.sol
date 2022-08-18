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
    address public operator;
    address public flashloaner;

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
        operator = msg.sender;
    }

    modifier onlyOperator() {
        require(msg.sender == operator, "DYDXFlashLender: Not operator");
        _;
    }

    modifier onlyFlashLoaner() {
        require(msg.sender == flashloaner, "DYDXFlashLender: Not flashloaner");
        _;
    }

    function setOperator(address _operator) external onlyOperator {
        require(
            _operator != address(0),
            "DYDXFlashLender: _operator is address(0)"
        );
        operator = _operator;
    }

    function setFlashLoaner(address _flashloaner) external onlyOperator {
        require(
            _flashloaner != address(0),
            "DYDXFlashLender: _flashloaner is address(0)"
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

        uint256 maxloan = tokensRegistered[_token] == true
            ? IERC20(_token).balanceOf(address(soloMargin))
            : 0;

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
    ) external view override onlyFlashLoaner returns (uint256) {
        return _flashFee(_token, _amount);
    }

    function _flashFee(address _token, uint256 _amount)
        internal
        view
        returns (uint256)
    {
        return 2;
    }

    function flashLoan(
        address _pair,
        IERC3156FlashBorrower _receiver,
        address _token,
        uint256 _amount,
        bytes calldata _data
    ) external override onlyFlashLoaner returns (bool) {
        _flashLoan(_receiver, _token, _amount, _data);
        return true;
    }

    function _flashLoan(
        IERC3156FlashBorrower _receiver,
        address _token,
        uint256 _amount,
        bytes memory _data
    ) internal {
        DYDXDataTypes.ActionArgs[]
            memory operations = new DYDXDataTypes.ActionArgs[](3);
        operations[0] = getWithdrawAction(_token, _amount);
        operations[1] = getCallAction(
            abi.encode(msg.sender, _receiver, _token, _amount, _data)
        );
        operations[2] = getDepositAction(_token, _amount.add(2));
        DYDXDataTypes.AccountInfo[]
            memory accountInfos = new DYDXDataTypes.AccountInfo[](1);
        accountInfos[0] = getAccountInfo();

        soloMargin.operate(accountInfos, operations);
    }

    function callFunction(
        address _sender,
        DYDXDataTypes.AccountInfo memory,
        bytes memory _data
    ) public override {
        require(
            msg.sender == address(soloMargin),
            "DYDXFlashLender: msg.sender must be SoloMargin"
        );
        require(
            _sender == address(this),
            "DYDXFlashLender: _sender must be this contract"
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
