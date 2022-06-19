// SPDX-License-Identifier: GPL-3.0-or-later
// Derived from https://github.com/Austin-Williams/uniswap-flash-swapper

pragma solidity ^0.7.5;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "erc3156/contracts/interfaces/IERC3156FlashBorrower.sol";
import "erc3156/contracts/interfaces/IERC3156FlashLender.sol";
import "./interfaces/UniswapV2PairLike.sol";
import "./interfaces/UniswapV2FactoryLike.sol";
import "./interfaces/UniswapV2FlashBorrowerLike.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract UniswapERC3156 is
    IERC3156FlashLender,
    UniswapV2FlashBorrowerLike,
    Ownable
{
    using SafeMath for uint256;

    // CONSTANTS
    bytes32 public constant CALLBACK_SUCCESS =
        keccak256("ERC3156FlashBorrower.onFlashLoan");
    UniswapV2FactoryLike public factory;

    // ACCESS CONTROL
    // Only the `permissionedPairAddress` may call the `uniswapV2Call` function
    address permissionedPairAddress;
    address public FEETO;

    struct Pair {
        address token0;
        address token1;
        address pair;
    }

    Pair[] public pairs;

    /// @param factory_ Uniswap v2 UniswapV2Factory address
    constructor(UniswapV2FactoryLike factory_, address feeTo_) {
        factory = factory_;
        FEETO = feeTo_;
    }

    function setFeeTo(address feeTo) public onlyOwner {
        FEETO = feeTo;
    }

    function addPair(
        address[] memory token0,
        address[] memory token1,
        address[] memory pair
    ) public onlyOwner returns (bool) {
        require(
            (token0.length == token1.length) && (token1.length == pair.length),
            "mismatch length of token0, token1, pair"
        );
        for (uint256 i = 0; i < pair.length; i++) {
            require(token0[i] != address(0), "Unsupported currency");
            require(token1[i] != address(0), "Unsupported currency");
            require(pair[i] != address(0), "Unsupported currency");
            pairs.push(Pair({token0: token0[i], token1: token1[i], pair: pair[i]}));
        }
        return true;
    }

    function removePair(address[] memory pair) public onlyOwner returns (bool) {
        for (uint256 i = 0; i < pair.length; i++) {
            for (uint256 j = 0; j < pairs.length; j++) {
                if (pairs[j].pair == pair[i]) {
                    pairs[j].token0 = pairs[pairs.length - 1].token0;
                    pairs[j].token1 = pairs[pairs.length - 1].token1;
                    pairs[j].pair = pairs[pairs.length - 1].pair;
                    pairs.pop();
                }
            }
        }
        return true;
    }

    function _biggestPair(address token)
        private
        view
        returns (address, uint256)
    {
        uint256 maxloan;
        address pair;
        for (uint256 i = 0; i < pairs.length; i++) {
            if (pairs[i].token0 == token || pairs[i].token1 == token) {
                uint256 balance = IERC20(token).balanceOf(pairs[i].pair);
                if (balance > maxloan) {
                    maxloan = balance;
                    pair = pairs[i].pair;
                }
            }
        }
        return (pair, maxloan);
    }

    /**
     * @dev From ERC-3156. The amount of currency available to be lended.
     * @param token The loan currency.
     * @return The amount of `token` that can be borrowed.
     */
    function maxFlashLoan(address token)
        external
        view
        override
        returns (uint256)
    {
        uint256 maxloan;
        address pairAddress;
        (pairAddress, maxloan) = _biggestPair(token);
        require(pairAddress != address(0), "Unsupported currency");
        if (maxloan > 0) return maxloan - 1;
    }

    function flashFee(address token, uint256 amount)
        public
        view
        override
        returns (uint256)
    {
        uint256 uniswapFee = _uniswapFee(token, amount);
        uint256 additionalFee = _additionalFee(amount);
        uint256 totalFee = uniswapFee.add(additionalFee);
        return totalFee;
    }

    function _uniswapFee(address token, uint256 amount)
        internal
        view
        returns (uint256)
    {
        address pairAddress;
        (pairAddress, ) = _biggestPair(token);
        require(pairAddress != address(0), "Unsupported currency");
        return ((amount * 3) / 997) + 1;
    }

    function _additionalFee(uint256 amount) internal view returns (uint256) {
        return amount.mul(5).div(1000);
    }

    /**
     * @dev From ERC-3156. Loan `amount` tokens to `receiver`, which needs to return them plus fee to this contract within the same transaction.
     * @param receiver The contract receiving the tokens, needs to implement the `onFlashLoan(address user, uint256 amount, uint256 fee, bytes calldata)` interface.
     * @param token The loan currency.
     * @param amount The amount of tokens lent.
     * @param userData A data parameter to be passed on to the `receiver` for any custom use.
     */
    function flashLoan(
        IERC3156FlashBorrower receiver,
        address token,
        uint256 amount,
        bytes memory userData
    ) external override returns (bool) {
        address pairAddress;
        (pairAddress, ) = _biggestPair(token);
        require(pairAddress != address(0), "Unsupported currency");

        UniswapV2PairLike pair = UniswapV2PairLike(pairAddress);

        if (permissionedPairAddress != pairAddress)
            permissionedPairAddress = pairAddress; // access control

        address token0 = pair.token0();
        address token1 = pair.token1();
        uint256 amount0Out = token == token0 ? amount : 0;
        uint256 amount1Out = token == token1 ? amount : 0;
        bytes memory data = abi.encode(msg.sender, receiver, token, userData);
        pair.swap(amount0Out, amount1Out, address(this), data);
        return true;
    }

    /// @dev Uniswap flash loan callback. It sends the value borrowed to `receiver`, and takes it back plus a `flashFee` after the ERC3156 callback.
    function uniswapV2Call(
        address sender,
        uint256 amount0,
        uint256 amount1,
        bytes calldata data
    ) external override {
        // access control
        require(
            msg.sender == permissionedPairAddress,
            "only permissioned UniswapV2 pair can call"
        );
        require(sender == address(this), "only this contract may initiate");

        uint256 amount = amount0 > 0 ? amount0 : amount1;

        // decode data
        (
            address origin,
            IERC3156FlashBorrower receiver,
            address token,
            bytes memory userData
        ) = abi.decode(data, (address, IERC3156FlashBorrower, address, bytes));

        uint256 totalFee = flashFee(token, amount);

        // send the borrowed amount to the receiver
        IERC20(token).transfer(address(receiver), amount);
        // do whatever the user wants
        require(
            receiver.onFlashLoan(origin, token, amount, totalFee, userData) ==
                CALLBACK_SUCCESS,
            "Callback failed"
        );
        // retrieve the borrowed amount plus fee from the receiver and send it to the uniswap pair
        IERC20(token).transferFrom(
            address(receiver),
            address(this),
            amount.add(totalFee)
        );

        uint256 addtionalFee = _additionalFee(amount);
        IERC20(token).transfer(FEETO, addtionalFee);

        uint256 uniswapFee = _uniswapFee(token, amount);
        IERC20(token).transfer(msg.sender, amount.add(uniswapFee));
    }
}
