// SPDX-License-Identifier: GPL-3.0-or-later
// Derived from https://github.com/Austin-Williams/uniswap-flash-swapper

pragma solidity ^0.7.5;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "erc3156/contracts/interfaces/IERC3156FlashBorrower.sol";
import "./interfaces/IUniswapV2Pair.sol";
import "./interfaces/IUniswapV2FlashLender.sol";
import "./interfaces/IUniswapV2FlashBorrower.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "hardhat/console.sol";

contract UniswapV2FlashLender is
    IUniswapV2FlashLender,
    IUniswapV2FlashBorrower,
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
            "UniswapV2FlashLender: mismatch length of token0, token1, pair"
        );
        for (uint256 i = 0; i < _pairs.length; i++) {
            require(
                _tokens0[i] != address(0),
                "UniswapV2FlashLender: Unsupported currency"
            );
            require(
                _tokens1[i] != address(0),
                "UniswapV2FlashLender: Unsupported currency"
            );
            require(
                _pairs[i] != address(0),
                "UniswapV2FlashLender: Unsupported currency"
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

    function _getBiggestPair(address _token)
        internal
        view
        returns (address, uint256)
    {
        uint256 biggestMaxLoan;
        address biggestPair;

        for (uint256 i = 0; i < pairs.length; i++) {
            if (pairs[i].token0 == _token || pairs[i].token1 == _token) {
                uint256 balance = IERC20(_token).balanceOf(pairs[i].pair);
                if ((balance > biggestMaxLoan) && (balance > 1)) {
                    biggestMaxLoan = balance.sub(1);
                    biggestPair = pairs[i].pair;
                }
            }
        }
        return (biggestPair, biggestMaxLoan);
    }

    function _getValidPairs(address _token)
        internal
        view
        returns (address[] memory, uint256[] memory)
    {
        uint256 count = 0;
        for (uint256 i = 0; i < pairs.length; i++) {
            if (pairs[i].token0 == _token || pairs[i].token1 == _token) {
                uint256 balance = IERC20(_token).balanceOf(pairs[i].pair);
                if (balance > 1) {
                    count++;
                }
            }
        }
        if (count == 0) {
            uint256[] memory validMaxLoans = new uint256[](1);
            address[] memory validPairs = new address[](1);
            validMaxLoans[0] = uint256(0);
            validPairs[0] = address(0);

            return (validPairs, validMaxLoans);
        } else {
            uint256[] memory validMaxLoans = new uint256[](count);
            address[] memory validPairs = new address[](count);
            uint256 validCount = 0;

            for (uint256 i = 0; i < pairs.length; i++) {
                if (pairs[i].token0 == _token || pairs[i].token1 == _token) {
                    uint256 balance = IERC20(_token).balanceOf(pairs[i].pair);
                    if (balance > 1) {
                        validMaxLoans[validCount] = balance.sub(1);
                        validPairs[validCount] = pairs[i].pair;
                        validCount = validCount.add(1);
                        if (validCount == count) {
                            break;
                        }
                    }
                }
            }

            return (validPairs, validMaxLoans);
        }
    }

    function maxFlashLoan(address _token)
        external
        view
        override
        returns (uint256)
    {
        (address pair, uint256 maxloan) = _getBiggestPair(_token);

        return maxloan;
    }

    function maxFlashLoanWithManyPairs_OR_ManyPools(address _token)
        external
        view
        override
        returns (uint256)
    {
        uint256 totalMaxLoan;

        (
            address[] memory pairAddress,
            uint256[] memory maxloan
        ) = _getValidPairs(_token);

        if (maxloan[0] > 0) {
            for (uint256 i = 0; i < maxloan.length; i++) {
                totalMaxLoan = totalMaxLoan.add(maxloan[i]);
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
        (address pairAddress, uint256 maxloan) = _getBiggestPair(_token);
        
        if (maxloan > 0) {
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
        (
            address[] memory pairAddress,
            uint256[] memory maxloan
        ) = _getValidPairs(_token);

        if (maxloan[0] > 0) {
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
        (address pair, uint256 maxloan) = _getBiggestPair(_token);
        require(
            pair != address(0),
            "UniswapV2FlashLender: Unsupported currency"
        );
        require(
            maxloan >= _amount,
            "UniswapV2FlashLender: Amount is more than maxFlashLoan"
        );

        _swap(_receiver, pair, _token, _amount, _userData);

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
        (
            address[] memory validPairs,
            uint256[] memory maxloans
        ) = _getValidPairs(_token);

        require(
            validPairs[0] != address(0),
            "UniswapV2FlashLender: Unsupported currency"
        );

        for (uint256 i = 0; i < maxloans.length; i++) {
            totalMaxLoan = totalMaxLoan.add(maxloans[i]);
        }

        require(
            totalMaxLoan >= totalAmount,
            "UniswapV2FlashLender: Amount is more than maxFlashLoan"
        );
        uint256 amount = 0;
        for (uint256 i = 0; i < maxloans.length; i++) {
            if (amount.add(maxloans[i]) <= totalAmount) {
                _swap(_receiver, validPairs[i], _token, maxloans[i], _userData);
                amount = amount.add(maxloans[i]);
            } else {
                _swap(
                    _receiver,
                    validPairs[i],
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

    function _swap(
        IERC3156FlashBorrower _receiver,
        address _pair,
        address _token,
        uint256 _amount,
        bytes memory _userData
    ) internal {
        IUniswapV2Pair pair = IUniswapV2Pair(_pair);

        address token0 = pair.token0();
        address token1 = pair.token1();
        uint256 amount0Out = _token == token0 ? _amount : 0;
        uint256 amount1Out = _token == token1 ? _amount : 0;
        bytes memory data = abi.encode(
            pair,
            msg.sender,
            _receiver,
            _token,
            _userData
        );
        pair.swap(amount0Out, amount1Out, address(this), data);
    }

    function uniswapV2Call(
        address _sender,
        uint256 _amount0,
        uint256 _amount1,
        bytes calldata _data
    ) external override {
        require(
            _sender == address(this),
            "UniswapV2FlashLender: only this contract may initiate"
        );

        (
            address pair,
            address origin,
            IERC3156FlashBorrower receiver,
            address token,
            bytes memory userData
        ) = abi.decode(
                _data,
                (address, address, IERC3156FlashBorrower, address, bytes)
            );

        require(
            msg.sender == pair,
            "UniswapV2FlashLender: only permissioned UniswapV2 pair can call"
        );

        uint256 amount = _amount0 > 0 ? _amount0 : _amount1;
        uint256 fee = _flashFee(token, amount);

        IERC20(token).transfer(address(receiver), amount);

        require(
            receiver.onFlashLoan(origin, token, amount, fee, userData) ==
                CALLBACK_SUCCESS,
            "UniswapV2FlashLender: Callback failed"
        );

        IERC20(token).transferFrom(
            address(receiver),
            address(this),
            amount.add(fee)
        );

        IERC20(token).transfer(msg.sender, amount.add(fee));
    }
}
