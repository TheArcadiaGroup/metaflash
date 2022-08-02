// SPDX-License-Identifier: GPL-3.0-or-later
// Derived from https://docs.aave.com/developers/guides/flash-loans
pragma solidity ^0.6.9;
pragma experimental ABIEncoderV2;

import {IERC20} from "./interfaces/IERC20.sol";
import {SafeMath} from "./libraries/SafeMath.sol";
import {Ownable} from "./libraries/Ownable.sol";
import "./interfaces/IDODOFlashLender.sol";
import "./interfaces/IDODOFlashBorrower.sol";
import "./interfaces/IDVM.sol";

contract DODOFlashLender is IDODOFlashLender, IDODOFlashBorrower, Ownable {
    using SafeMath for uint256;

    bytes32 public constant CALLBACK_SUCCESS =
        keccak256("ERC3156FlashBorrower.onFlashLoan");

    struct DVMPool {
        address basetoken;
        address quotetoken;
        address dvmpool;
    }

    struct DVMPoolInfo {
        address dvmpool;
        uint256 maxloan;
        uint256 fee;
    }

    DVMPool[] public dvmpools;

    // --- Init ---
    constructor() public {}

    function addDVMPools(
        address[] memory _basetokens,
        address[] memory _quotetokens,
        address[] memory _dvmpools
    ) public onlyOwner returns (bool) {
        require(
            (_basetokens.length == _quotetokens.length) &&
                (_quotetokens.length == _dvmpools.length),
            "DODOFlashLender: mismatch length of basetoken, quotetoken, dvmpool"
        );
        for (uint256 i = 0; i < _dvmpools.length; i++) {
            require(
                _basetokens[i] != address(0),
                "DODOFlashLender: _basetokens is address(0)"
            );
            require(
                _quotetokens[i] != address(0),
                "DODOFlashLender: _quotetokens is address(0)"
            );
            require(
                _dvmpools[i] != address(0),
                "DODOFlashLender: _dvmpools is address(0)"
            );
            dvmpools.push(
                DVMPool({
                    basetoken: _basetokens[i],
                    quotetoken: _quotetokens[i],
                    dvmpool: _dvmpools[i]
                })
            );
        }
        return true;
    }

    function removeDVMPools(address[] memory _dvmpools)
        public
        onlyOwner
        returns (bool)
    {
        for (uint256 i = 0; i < _dvmpools.length; i++) {
            for (uint256 j = 0; j < dvmpools.length; j++) {
                if (dvmpools[j].dvmpool == _dvmpools[i]) {
                    dvmpools[j].basetoken = dvmpools[dvmpools.length - 1]
                        .basetoken;
                    dvmpools[j].quotetoken = dvmpools[dvmpools.length - 1]
                        .quotetoken;
                    dvmpools[j].dvmpool = dvmpools[dvmpools.length - 1].dvmpool;
                    dvmpools.pop();
                }
            }
        }
        return true;
    }

    function _getValidDVMPools(address _token, uint256 _amount)
        internal
        view
        returns (DVMPoolInfo[] memory)
    {
        uint256 amount = 1e18;
        uint256 count = 0;
        for (uint256 i = 0; i < dvmpools.length; i++) {
            if (
                dvmpools[i].basetoken == _token ||
                dvmpools[i].quotetoken == _token
            ) {
                uint256 balance = IERC20(_token).balanceOf(dvmpools[i].dvmpool);
                if (balance >= _amount.add(1)) {
                    count++;
                }
            }
        }
        if (count == 0) {
            DVMPoolInfo[] memory validDVMPoolInfos = new DVMPoolInfo[](1);
            validDVMPoolInfos[0].dvmpool = address(0);
            validDVMPoolInfos[0].maxloan = uint256(0);
            validDVMPoolInfos[0].fee = uint256(0);

            return validDVMPoolInfos;
        } else {
            DVMPoolInfo[] memory validDVMPoolInfos = new DVMPoolInfo[](count);
            uint256 validCount = 0;

            for (uint256 i = 0; i < dvmpools.length; i++) {
                if (
                    dvmpools[i].basetoken == _token ||
                    dvmpools[i].quotetoken == _token
                ) {
                    uint256 balance = IERC20(_token).balanceOf(
                        dvmpools[i].dvmpool
                    );
                    if (balance >= _amount.add(1)) {
                        uint256 fee = 0;
                        validDVMPoolInfos[validCount].dvmpool = dvmpools[i]
                            .dvmpool;
                        validDVMPoolInfos[validCount].maxloan = balance.sub(1);
                        validDVMPoolInfos[validCount].fee = fee;
                        validCount = validCount.add(1);
                        if (validCount == count) {
                            break;
                        }
                    }
                }
            }

            if (validDVMPoolInfos.length == 1) {
                return validDVMPoolInfos;
            } else {
                // sort by fee
                for (uint256 i = 1; i < validDVMPoolInfos.length; i++) {
                    for (uint256 j = 0; j < i; j++) {
                        if (
                            validDVMPoolInfos[i].fee < validDVMPoolInfos[j].fee
                        ) {
                            DVMPoolInfo memory x = validDVMPoolInfos[i];
                            validDVMPoolInfos[i] = validDVMPoolInfos[j];
                            validDVMPoolInfos[j] = x;
                        }
                    }
                }
                // sort by maxloan
                for (uint256 i = 1; i < validDVMPoolInfos.length; i++) {
                    for (uint256 j = 0; j < i; j++) {
                        if (
                            validDVMPoolInfos[i].fee == validDVMPoolInfos[j].fee
                        ) {
                            if (
                                validDVMPoolInfos[i].maxloan >
                                validDVMPoolInfos[j].maxloan
                            ) {
                                DVMPoolInfo memory x = validDVMPoolInfos[i];
                                validDVMPoolInfos[i] = validDVMPoolInfos[j];
                                validDVMPoolInfos[j] = x;
                            }
                        }
                    }
                }
            }

            return validDVMPoolInfos;
        }
    }

    function maxFlashLoan(address _token, uint256 _amount)
        external
        view
        override
        returns (uint256)
    {
        DVMPoolInfo[] memory validDVMPoolInfos = _getValidDVMPools(
            _token,
            _amount
        );

        return validDVMPoolInfos[0].maxloan;
    }

    function maxFlashLoanWithManyPairs_OR_ManyPools(address _token)
        external
        view
        override
        returns (uint256)
    {
        uint256 totalMaxLoan;

        DVMPoolInfo[] memory validDVMPoolInfos = _getValidDVMPools(_token, 1);

        if (validDVMPoolInfos[0].maxloan > 0) {
            for (uint256 i = 0; i < validDVMPoolInfos.length; i++) {
                totalMaxLoan = totalMaxLoan.add(validDVMPoolInfos[i].maxloan);
            }
            return totalMaxLoan;
        } else {
            return 0;
        }
    }

    function flashFee(address token, uint256 amount)
        public
        view
        override
        returns (uint256)
    {
        return 0;
    }

    function flashFeeWithManyPairs_OR_ManyPools(address _token, uint256 _amount)
        public
        view
        override
        returns (uint256)
    {
        return 0;
    }

    function flashLoan(
        IERC3156FlashBorrower _receiver,
        address _token,
        uint256 _amount,
        bytes memory _userData
    ) external override returns (bool) {
        DVMPoolInfo[] memory validDVMPoolInfos = _getValidDVMPools(
            _token,
            _amount
        );

        require(
            validDVMPoolInfos[0].dvmpool != address(0),
            "DODOFlashLender: Unsupported token"
        );

        _flashloan(
            _receiver,
            validDVMPoolInfos[0].dvmpool,
            _token,
            _amount,
            _userData
        );

        return true;
    }

    function flashLoanWithManyPairs_OR_ManyPools(
        IERC3156FlashBorrower _receiver,
        address _token,
        uint256 _amount,
        bytes memory _userData
    ) external override returns (bool) {
        uint256 totalMaxLoan;
        uint256 totalAmount = _amount;

        DVMPoolInfo[] memory validDVMPoolInfos = _getValidDVMPools(_token, 1);

        require(
            validDVMPoolInfos[0].dvmpool != address(0),
            "DODOFlashLender: Unsupported token"
        );

        for (uint256 i = 0; i < validDVMPoolInfos.length; i++) {
            totalMaxLoan = totalMaxLoan.add(validDVMPoolInfos[i].maxloan);
        }

        require(
            totalMaxLoan >= totalAmount,
            "DODOFlashLender: Amount is more than maxFlashLoan"
        );

        uint256 amount = 0;
        for (uint256 i = 0; i < validDVMPoolInfos.length; i++) {
            if (amount.add(validDVMPoolInfos[i].maxloan) <= totalAmount) {
                _flashloan(
                    _receiver,
                    validDVMPoolInfos[i].dvmpool,
                    _token,
                    validDVMPoolInfos[i].maxloan,
                    _userData
                );
                amount = amount.add(validDVMPoolInfos[i].maxloan);
                if (amount == totalAmount) {
                    break;
                }
            } else {
                _flashloan(
                    _receiver,
                    validDVMPoolInfos[i].dvmpool,
                    _token,
                    totalAmount.sub(amount),
                    _userData
                );
                amount = totalAmount;
                break;
            }
        }
        return true;
    }

    function _flashloan(
        IERC3156FlashBorrower _receiver,
        address _dvmpool,
        address _token,
        uint256 _amount,
        bytes memory _userData
    ) internal {
        IDVM dvmpool = IDVM(_dvmpool);

        address basetoken = address(dvmpool._BASE_TOKEN_());
        address quotetoken = address(dvmpool._QUOTE_TOKEN_());
        uint256 amountbaseOut = _token == basetoken ? _amount : 0;
        uint256 amountquoteOut = _token == quotetoken ? _amount : 0;
        bytes memory data = abi.encode(
            dvmpool,
            msg.sender,
            _receiver,
            _token,
            _userData
        );
        dvmpool.flashLoan(amountbaseOut, amountquoteOut, address(this), data);
    }

    function DVMFlashLoanCall(
        address _sender,
        uint256 _baseAmount,
        uint256 _quoteAmount,
        bytes calldata _data
    ) external override {
        require(
            _sender == address(this),
            "DODOFlashLender: _sender must be this contract"
        );

        (
            address dvmpool,
            address origin,
            IERC3156FlashBorrower receiver,
            address token,
            bytes memory userData
        ) = abi.decode(
                _data,
                (address, address, IERC3156FlashBorrower, address, bytes)
            );

        require(
            msg.sender == dvmpool,
            "DODOFlashLender: msg.sender must be the permissioned pool"
        );

        uint256 amount = _baseAmount > 0 ? _baseAmount : _quoteAmount;
        uint256 fee = flashFee(token, amount);

        IERC20(token).transfer(address(receiver), amount);

        require(
            receiver.onFlashLoan(origin, token, amount, fee, userData) ==
                CALLBACK_SUCCESS,
            "DODOFlashLender: Callback failed"
        );

        IERC20(token).transferFrom(
            address(receiver),
            address(this),
            amount.add(fee)
        );

        IERC20(token).transfer(msg.sender, amount.sub(fee));
    }
}
