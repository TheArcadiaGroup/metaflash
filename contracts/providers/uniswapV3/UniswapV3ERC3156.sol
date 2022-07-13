// SPDX-License-Identifier: GPL-3.0-or-later
// Derived from https://github.com/Austin-Williams/uniswap-flash-swapper

pragma solidity ^0.7.5;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "erc3156/contracts/interfaces/IERC3156FlashBorrower.sol";
import "erc3156/contracts/interfaces/IERC3156FlashLender.sol";
import "./interfaces/IUniswapV3Pool.sol";
import "./interfaces/callback/IUniswapV3FlashCallback.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract UniswapV3ERC3156 is
    IERC3156FlashLender,
    IUniswapV3FlashCallback,
    Ownable
{
    using SafeMath for uint256;

    // CONSTANTS
    bytes32 public constant CALLBACK_SUCCESS =
        keccak256("ERC3156FlashBorrower.onFlashLoan");

    // ACCESS CONTROL
    // Only the `permissionedPairAddress` may call the `uniswapV2Call` function
    address permissionedPairAddress;

    struct Pair {
        address token0;
        address token1;
        address pair;
    }

    Pair[] public pairs;

    constructor() {
    }

    function addPair(
        address[] memory _token0,
        address[] memory _token1,
        address[] memory _pair
    ) public onlyOwner returns (bool) {
        require(
            (_token0.length == _token1.length) &&
                (_token1.length == _pair.length),
            "UniswapV3ERC3156: mismatch length of token0, token1, pair"
        );
        for (uint256 i = 0; i < _pair.length; i++) {
            require(
                _token0[i] != address(0),
                "UniswapV3ERC3156: Unsupported currency"
            );
            require(
                _token1[i] != address(0),
                "UniswapV3ERC3156: Unsupported currency"
            );
            require(
                _pair[i] != address(0),
                "UniswapV3ERC3156: Unsupported currency"
            );
            pairs.push(
                Pair({token0: _token0[i], token1: _token1[i], pair: _pair[i]})
            );
        }
        return true;
    }

    function removePair(address[] memory _pair)
        public
        onlyOwner
        returns (bool)
    {
        for (uint256 i = 0; i < _pair.length; i++) {
            for (uint256 j = 0; j < pairs.length; j++) {
                if (pairs[j].pair == _pair[i]) {
                    pairs[j].token0 = pairs[pairs.length - 1].token0;
                    pairs[j].token1 = pairs[pairs.length - 1].token1;
                    pairs[j].pair = pairs[pairs.length - 1].pair;
                    pairs.pop();
                }
            }
        }
        return true;
    }

    function _biggestPair(address _token)
        private
        view
        returns (address, uint256)
    {
        uint256 maxloan;
        address pair;
        for (uint256 i = 0; i < pairs.length; i++) {
            if (pairs[i].token0 == _token || pairs[i].token1 == _token) {
                uint256 balance = IERC20(_token).balanceOf(pairs[i].pair);
                if (balance > maxloan) {
                    maxloan = balance;
                    pair = pairs[i].pair;
                }
            }
        }
        return (pair, maxloan);
    }

    function maxFlashLoan(address _token)
        external
        view
        override
        returns (uint256)
    {
        uint256 maxloan;
        address pairAddress;
        (pairAddress, maxloan) = _biggestPair(_token);
        // require(
        //     pairAddress != address(0),
        //     "UniswapV3ERC3156: Unsupported currency"
        // );
        if (maxloan > 0) {
            return maxloan - 1;
        }else{
            return 0;
        }
    }

    function flashFee(address _token, uint256 _amount)
        public
        view
        override
        returns (uint256)
    {
        address pairAddress;
        (pairAddress, ) = _biggestPair(_token);
        if(pairAddress == address(0)){
            return 0;
        }else{
            return ((_amount * 3) / 997) + 1;
        }
    }

    function flashLoan(
        IERC3156FlashBorrower _receiver,
        address _token,
        uint256 _amount,
        bytes memory _userData
    ) external override returns (bool) {
        address pairAddress;
        (pairAddress, ) = _biggestPair(_token);
        require(
            pairAddress != address(0),
            "UniswapV3ERC3156: Unsupported currency"
        );

        IUniswapV3Pool pair = IUniswapV3Pool(pairAddress);

        if (permissionedPairAddress != pairAddress)
            permissionedPairAddress = pairAddress; // access control

        address token0 = pair.token0();
        address token1 = pair.token1();
        uint256 amount0Out = _token == token0 ? _amount : 0;
        uint256 amount1Out = _token == token1 ? _amount : 0;

        bytes memory data = abi.encode(
            msg.sender,
            _receiver,
            _token,
            _amount,
            _userData
        );

        pair.flash(address(this), amount0Out, amount1Out, data);
        return true;
    }

    /// @dev Uniswap flash loan callback. It sends the value borrowed to `receiver`, and takes it back plus a `flashFee` after the ERC3156 callback.
    function uniswapV3FlashCallback(
        uint256 _fee0,
        uint256 _fee1,
        bytes calldata _data
    ) external override {
        // access control
        require(
            msg.sender == permissionedPairAddress,
            "UniswapV3ERC3156: only permissioned UniswapV2 pair can call"
        );

        // decode data
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

        uint256 fee = flashFee(token, amount);

        // send the borrowed amount to the receiver
        IERC20(token).transfer(address(receiver), amount);
        // do whatever the user wants
        require(
            receiver.onFlashLoan(origin, token, amount, fee, userData) ==
                CALLBACK_SUCCESS,
            "UniswapV3ERC3156: Callback failed"
        );
        // retrieve the borrowed amount plus fee from the receiver and send it to the uniswap pair
        IERC20(token).transferFrom(
            address(receiver),
            address(this),
            amount.add(fee)
        );

        IERC20(token).transfer(msg.sender, amount.add(fee));
    }
}
