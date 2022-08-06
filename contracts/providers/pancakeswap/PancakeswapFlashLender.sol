// SPDX-License-Identifier: GPL-3.0-or-later
// Derived from https://github.com/Austin-Williams/uniswap-flash-swapper

pragma solidity >=0.6.12;

import {IERC20} from "./interfaces/IERC20.sol";
import {SafeMath} from "./libraries/SafeMath.sol";
import "erc3156/contracts/interfaces/IERC3156FlashBorrower.sol";
import "./interfaces/IPancakePair.sol";
import "./interfaces/IPancakeswapFlashBorrower.sol";
import "./interfaces/IPancakeswapFlashLender.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract PancakeswapFlashLender is
    IPancakeswapFlashLender,
    IPancakeswapFlashBorrower,
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

    struct FlashLoanInfo {
        address pool;
        uint256 maxloan;
        uint256 fee;
    }

    Pair[] public pairs;

    constructor() public {}

    function addPairs(
        address[] memory _tokens0,
        address[] memory _tokens1,
        address[] memory _pairs
    ) public onlyOwner returns (bool) {
        require(
            (_tokens0.length == _tokens1.length) &&
                (_tokens1.length == _pairs.length),
            "PancakeswapFlashLender: mismatch length of token0, token1, pair"
        );
        for (uint256 i = 0; i < _pairs.length; i++) {
            require(
                _tokens0[i] != address(0),
                "PancakeswapFlashLender: _tokens0 is address(0)"
            );
            require(
                _tokens1[i] != address(0),
                "PancakeswapFlashLender: _tokens1 is address(0)"
            );
            require(
                _pairs[i] != address(0),
                "PancakeswapFlashLender: _pairs is address(0)"
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

    function _getValidPairs(address _token, uint256 _amount)
        internal
        view
        returns (FlashLoanInfo[] memory)
    {
        uint256 amount = 1e18;
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
            FlashLoanInfo[] memory validFlashLoanInfos = new FlashLoanInfo[](1);
            validFlashLoanInfos[0].pool = address(0);
            validFlashLoanInfos[0].maxloan = uint256(0);
            validFlashLoanInfos[0].fee = uint256(0);

            return validFlashLoanInfos;
        } else {
            FlashLoanInfo[] memory validFlashLoanInfos = new FlashLoanInfo[](count);
            uint256 validCount = 0;
            uint256 fee = _flashFee(_token, amount);
            for (uint256 i = 0; i < pairs.length; i++) {
                if (pairs[i].token0 == _token || pairs[i].token1 == _token) {
                    uint256 balance = IERC20(_token).balanceOf(pairs[i].pair);
                    if (balance >= _amount.add(1)) {
                        validFlashLoanInfos[validCount].pool = pairs[i].pair;
                        validFlashLoanInfos[validCount].maxloan = balance.sub(1);
                        validFlashLoanInfos[validCount].fee = fee;
                        validCount = validCount.add(1);
                        if (validCount == count) {
                            break;
                        }
                    }
                }
            }

            if (validFlashLoanInfos.length == 1) {
                return validFlashLoanInfos;
            } else {
                for (uint256 i = 1; i < validFlashLoanInfos.length; i++) {
                    for (uint256 j = 0; j < i; j++) {
                        if (
                            validFlashLoanInfos[i].maxloan >
                            validFlashLoanInfos[j].maxloan
                        ) {
                            FlashLoanInfo memory x = validFlashLoanInfos[i];
                            validFlashLoanInfos[i] = validFlashLoanInfos[j];
                            validFlashLoanInfos[j] = x;
                        }
                    }
                }
            }

            return validFlashLoanInfos;
        }
    }

    function getFlashLoanInfoListWithCheaperFeePriority(address _token, uint256 _amount)
        external
        view
        override
        returns (address[] memory pools, uint256[] memory maxloans, uint256[] memory fees)
    {
        FlashLoanInfo[] memory flashLoanInfos = _getValidPairs(_token, _amount);
        address[] memory pools = new address[](flashLoanInfos.length);
        uint256[] memory maxloans = new uint256[](flashLoanInfos.length);
        uint256[] memory fees = new uint256[](flashLoanInfos.length);
        for(uint256 i = 0; i < flashLoanInfos.length; i++){
            pools[i] = flashLoanInfos[i].pool;
            maxloans[i] = flashLoanInfos[i].maxloan;
            fees[i] = flashLoanInfos[i].fee;
        }

        return (pools, maxloans, fees);
    }

    function flashFee(address _pair, address _token, uint256 _amount)
        public
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
        return ((_amount * 25) / 9975) + 1;
    }

    function flashLoan(
        address _pair,
        IERC3156FlashBorrower _receiver,
        address _token,
        uint256 _amount,
        bytes memory _userData
    ) external override returns (bool) {
        _flashLoan(
            _pair,
            _receiver,
            _token,
            _amount,
            _userData
        );

        return true;
    }

    function _flashLoan(
        address _pair,
        IERC3156FlashBorrower _receiver,
        address _token,
        uint256 _amount,
        bytes memory _data
    ) internal {
        IPancakePair pair = IPancakePair(_pair);

        address token0 = pair.token0();
        address token1 = pair.token1();
        uint256 amount0Out = _token == token0 ? _amount : 0;
        uint256 amount1Out = _token == token1 ? _amount : 0;
        bytes memory data = abi.encode(
            pair,
            msg.sender,
            _receiver,
            _token,
            _data
        );
        pair.swap(amount0Out, amount1Out, address(this), data);
    }

    function pancakeCall(
        address _sender,
        uint256 _amount0,
        uint256 _amount1,
        bytes calldata _data
    ) external override {
        require(
            _sender == address(this),
            "PancakeswapFlashLender: _sender must be this contract"
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
            "PancakeswapFlashLender: msg.sender must be the permissioned pair"
        );

        uint256 amount = _amount0 > 0 ? _amount0 : _amount1;
        uint256 fee = _flashFee(token, amount);

        IERC20(token).transfer(address(receiver), amount);

        require(
            receiver.onFlashLoan(origin, token, amount, fee, userData) ==
                CALLBACK_SUCCESS,
            "PancakeswapFlashLender: Callback failed"
        );

        IERC20(token).transferFrom(
            address(receiver),
            address(this),
            amount.add(fee)
        );

        IERC20(token).transfer(msg.sender, amount.add(fee));
    }
}
