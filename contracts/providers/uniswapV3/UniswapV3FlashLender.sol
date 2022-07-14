// SPDX-License-Identifier: GPL-3.0-or-later
// Derived from https://github.com/Austin-Williams/uniswap-flash-swapper

pragma solidity ^0.7.5;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "erc3156/contracts/interfaces/IERC3156FlashBorrower.sol";
import "./interfaces/IUniswapV3Pair.sol";
import "./interfaces/IUniswapV3FlashLender.sol";
import "./interfaces/IUniswapV3FlashBorrower.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract UniswapV3FlashLender is
    IUniswapV3FlashLender,
    IUniswapV3FlashBorrower,
    Ownable
{
    using SafeMath for uint256;

    // CONSTANTS
    bytes32 public constant CALLBACK_SUCCESS =
        keccak256("ERC3156FlashBorrower.onFlashLoan");

    struct Pair {
        address token0;
        address token1;
        address pair;
    }

    struct PairInfo {
        address pair;
        uint256 maxloan;
    }

    Pair[] public pairs;

    constructor() {}

    function addPairs(
        address[] memory _tokens0,
        address[] memory _tokens1,
        address[] memory _pairs
    ) public onlyOwner returns (bool) {
        require(
            (_tokens0.length == _tokens1.length) &&
                (_tokens1.length == _pairs.length),
            "UniswapV3FlashLender: mismatch length of token0, token1, pair"
        );
        for (uint256 i = 0; i < _pairs.length; i++) {
            require(
                _tokens0[i] != address(0),
                "UniswapV3FlashLender: Unsupported currency"
            );
            require(
                _tokens1[i] != address(0),
                "UniswapV3FlashLender: Unsupported currency"
            );
            require(
                _pairs[i] != address(0),
                "UniswapV3FlashLender: Unsupported currency"
            );
            pairs.push(
                Pair({
                    token0: _tokens0[i],
                    token1: _tokens1[i],
                    pair: _pairs[i]
                })
            );
        }
        return true;
    }

    function removePairs(address[] memory _pairs)
        public
        onlyOwner
        returns (bool)
    {
        for (uint256 i = 0; i < _pairs.length; i++) {
            for (uint256 j = 0; j < pairs.length; j++) {
                if (pairs[j].pair == _pairs[i]) {
                    pairs[j].token0 = pairs[pairs.length - 1].token0;
                    pairs[j].token1 = pairs[pairs.length - 1].token1;
                    pairs[j].pair = pairs[pairs.length - 1].pair;
                    pairs.pop();
                }
            }
        }
        return true;
    }

    // function _getBiggestPair(address _token)
    //     internal
    //     view
    //     returns (address, uint256)
    // {
    //     uint256 biggestMaxLoan;
    //     address biggestPair;

    //     for (uint256 i = 0; i < pairs.length; i++) {
    //         if (pairs[i].token0 == _token || pairs[i].token1 == _token) {
    //             uint256 balance = IERC20(_token).balanceOf(pairs[i].pair);
    //             if (balance > biggestMaxLoan.add(1)) {
    //                 biggestMaxLoan = balance.sub(1);
    //                 biggestPair = pairs[i].pair;
    //             }
    //         }
    //     }

    //     return (biggestPair, biggestMaxLoan);
    // }

    function _getValidPairs(address _token, uint256 _amount)
        internal
        view
        returns (PairInfo[] memory)
    {
        uint256 count = 0;
        for (uint256 i = 0; i < pairs.length; i++) {
            if (pairs[i].token0 == _token || pairs[i].token1 == _token) {
                uint256 balance = IERC20(_token).balanceOf(pairs[i].pair);
                if (balance >= _amount.add(1)) {
                    count++;
                }
            }
        }
        if (count == 0) {
            PairInfo[] memory validPairInfos = new PairInfo[](1);
            validPairInfos[0].pair = address(0);
            validPairInfos[0].maxloan = uint256(0);

            return validPairInfos;
        } else {
            PairInfo[] memory validPairInfos = new PairInfo[](count);
            uint256 validCount = 0;

            for (uint256 i = 0; i < pairs.length; i++) {
                if (pairs[i].token0 == _token || pairs[i].token1 == _token) {
                    uint256 balance = IERC20(_token).balanceOf(pairs[i].pair);
                    if (balance >= _amount.add(1)) {
                        validPairInfos[validCount].pair = pairs[i].pair;
                        validPairInfos[validCount].maxloan = balance.sub(1);
                        validCount = validCount.add(1);
                        if (validCount == count) {
                            break;
                        }
                    }
                }
            }

            if (validPairInfos.length == 1) {
                return validPairInfos;
            } else {
                for (uint256 i = 1; i < validPairInfos.length; i++) {
                    for (uint256 j = 0; j < i; j++) {
                        if (
                            validPairInfos[i].maxloan >
                            validPairInfos[j].maxloan
                        ) {
                            PairInfo memory x = validPairInfos[i];
                            validPairInfos[i] = validPairInfos[j];
                            validPairInfos[j] = x;
                        }
                    }
                }
            }

            return validPairInfos;
        }
    }

    function maxFlashLoan(address _token, uint256 _amount)
        external
        view
        override
        returns (uint256)
    {
        PairInfo[] memory validPairInfos = _getValidPairs(_token, _amount);

        return validPairInfos[0].maxloan;
    }

    function maxFlashLoanWithManyPairs_OR_ManyPools(address _token)
        external
        view
        override
        returns (uint256)
    {
        uint256 totalMaxLoan;

        PairInfo[] memory validPairInfos = _getValidPairs(_token, 1);

        if (validPairInfos[0].maxloan > 0) {
            for (uint256 i = 0; i < validPairInfos.length; i++) {
                totalMaxLoan = totalMaxLoan.add(validPairInfos[i].maxloan);
            }
            return totalMaxLoan;
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
        PairInfo[] memory validPairInfos = _getValidPairs(_token, _amount);
        if (validPairInfos[0].maxloan > 0) {
            return _flashFee(_token, _amount);
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
        PairInfo[] memory validPairInfos = _getValidPairs(_token, 1);

        if (validPairInfos[0].maxloan > 0) {
            return _flashFee(_token, _amount);
        } else {
            return 0;
        }
    }

    function _flashFee(address _token, uint256 _amount)
        internal
        view
        returns (uint256)
    {
        return ((_amount * 3) / 997) + 1;
    }

    function flashLoan(
        IERC3156FlashBorrower _receiver,
        address _token,
        uint256 _amount,
        bytes memory _userData
    ) external override returns (bool) {
        PairInfo[] memory validPairInfos = _getValidPairs(_token, _amount);

        require(
            validPairInfos[0].pair != address(0),
            "UniswapV3FlashLender: Unsupported currency"
        );

        _flash(_receiver, validPairInfos[0].pair, _token, _amount, _userData);

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

        PairInfo[] memory validPairInfos = _getValidPairs(_token, 1);

        require(
            validPairInfos[0].pair != address(0),
            "UniswapV3FlashLender: Unsupported currency"
        );

        for (uint256 i = 0; i < validPairInfos.length; i++) {
            totalMaxLoan = totalMaxLoan.add(validPairInfos[i].maxloan);
        }

        require(
            totalMaxLoan >= totalAmount,
            "UniswapV3FlashLender: Amount is more than maxFlashLoan"
        );
        uint256 amount = 0;
        for (uint256 i = 0; i < validPairInfos.length; i++) {
            if (amount.add(validPairInfos[i].maxloan) <= totalAmount) {
                _flash(
                    _receiver,
                    validPairInfos[i].pair,
                    _token,
                    validPairInfos[i].maxloan,
                    _userData
                );
                amount = amount.add(validPairInfos[i].maxloan);
                if (amount == totalAmount) {
                    break;
                }
            } else {
                _flash(
                    _receiver,
                    validPairInfos[i].pair,
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

    function _flash(
        IERC3156FlashBorrower _receiver,
        address _pair,
        address _token,
        uint256 _amount,
        bytes memory _userData
    ) internal {
        IUniswapV3Pair pair = IUniswapV3Pair(_pair);

        address token0 = pair.token0();
        address token1 = pair.token1();
        uint256 amount0Out = _token == token0 ? _amount : 0;
        uint256 amount1Out = _token == token1 ? _amount : 0;
        bytes memory data = abi.encode(
            pair,
            msg.sender,
            _receiver,
            _token,
            _amount,
            _userData
        );
        pair.flash(address(this), amount0Out, amount1Out, data);
    }

    /// @dev Uniswap flash loan callback. It sends the value borrowed to `receiver`, and takes it back plus a `flashFee` after the ERC3156 callback.
    function uniswapV3FlashCallback(
        uint256 _fee0,
        uint256 _fee1,
        bytes calldata _data
    ) external override {
        (
            address pair,
            address origin,
            IERC3156FlashBorrower receiver,
            address token,
            uint256 amount,
            bytes memory userData
        ) = abi.decode(
                _data,
                (
                    address,
                    address,
                    IERC3156FlashBorrower,
                    address,
                    uint256,
                    bytes
                )
            );

        require(
            msg.sender == pair,
            "UniswapV3FlashLender: only permissioned pair can call"
        );

        uint256 fee = _flashFee(token, amount);

        IERC20(token).transfer(address(receiver), amount);

        require(
            receiver.onFlashLoan(origin, token, amount, fee, userData) ==
                CALLBACK_SUCCESS,
            "UniswapV3FlashLender: Callback failed"
        );

        IERC20(token).transferFrom(
            address(receiver),
            address(this),
            amount.add(fee)
        );

        IERC20(token).transfer(msg.sender, amount.add(fee));
    }
}
