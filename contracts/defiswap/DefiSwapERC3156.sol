// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2021 Dai Foundation
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program.  If not, see <https://www.gnu.org/licenses/>.

pragma solidity >=0.6.12;

import "./interfaces/IERC20.sol";
import "./interfaces/ICroDefiSwapCallee.sol";
import "./interfaces/ICroDefiSwapPair.sol";
import "erc3156/contracts/interfaces/IERC3156FlashLender.sol";
import "./interfaces/ICroDefiSwapFactory.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract DefiSwapERC3156 is IERC3156FlashLender, ICroDefiSwapCallee, Ownable {
    using SafeMath for uint256;

    bytes32 public constant CALLBACK_SUCCESS = keccak256("ERC3156FlashBorrower.onFlashLoan");
    bytes32 public constant CALLBACK_SUCCESS_VAT_DAI = keccak256("VatDaiFlashBorrower.onVatDaiFlashLoan");

    ICroDefiSwapFactory public factory;
    address permissionedPairAddress;
    address public FEETO;

    struct Pair {
        address token0;
        address token1;
        address pair;
    }

    Pair[] public pairs;

    // --- Init ---
    constructor(address factory_, address feeTo_) {
        factory = ICroDefiSwapFactory(factory_);
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
        uint256 defiswapFee = _defiswapFee(token, amount);
        uint256 additionalFee = _additionalFee(amount);
        uint256 totalFee = defiswapFee.add(additionalFee);
        return totalFee;
    }

    function _defiswapFee(address token, uint256 amount)
        internal
        view
        returns (uint256)
    {
        address pairAddress;
        (pairAddress, ) = _biggestPair(token);
        require(pairAddress != address(0), "Unsupported currency");
        uint magnifier = 10000;
        uint totalFeeBasisPoint = ICroDefiSwapFactory(factory).totalFeeBasisPoint();
        return ((amount * totalFeeBasisPoint) / (magnifier - totalFeeBasisPoint) + 1);
    }

    function _additionalFee(uint256 amount) internal view returns (uint256) {
        return amount.mul(5).div(1000);
    }

    function flashLoan(
        IERC3156FlashBorrower receiver,
        address token,
        uint256 amount,
        bytes calldata data
    ) external override returns (bool) {    
        address pairAddress;
        (pairAddress, ) = _biggestPair(token);
        require(pairAddress != address(0), "Unsupported currency");

        ICroDefiSwapPair pair = ICroDefiSwapPair(pairAddress);

        if (permissionedPairAddress != pairAddress) permissionedPairAddress = pairAddress; // access control

        address token0 = pair.token0();
        address token1 = pair.token1();
        uint amount0Out = token == token0 ? amount : 0;
        uint amount1Out = token == token1 ? amount : 0;
        bytes memory data = abi.encode(
            msg.sender,
            receiver,
            token,
            data
        );
        pair.swap(amount0Out, amount1Out, address(this), data);
        return true;
    }

    /// @dev flash loan callback. It sends the amount borrowed to `receiver`, and takes it back plus a `flashFee` after the ERC3156 callback.
    function croDefiSwapCall(address sender, uint amount0, uint amount1, bytes calldata data) external override {
        require(msg.sender == permissionedPairAddress, "only permissioned UniswapV2 pair can call");
        require(sender == address(this), "only this contract may initiate");

        uint amount = amount0 > 0 ? amount0 : amount1;

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

        uint256 defiswapFee = _defiswapFee(token, amount);
        IERC20(token).transfer(msg.sender, amount.add(defiswapFee));
    }
}