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

import "./interfaces/ISwapFlashLoan.sol";
import "./interfaces/IFlashLoanReceiver.sol";
import "erc3156/contracts/interfaces/IERC3156FlashLender.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract SaddleFinanceERC3156 is IERC3156FlashLender, IFlashLoanReceiver, Ownable {
    using SafeMath for uint256;
    ISwapFlashLoan swapflashloan;
    bytes32 public constant CALLBACK_SUCCESS = keccak256("ERC3156FlashBorrower.onFlashLoan");
    address public FEETO;
    // --- Init ---
    constructor(address _swapflashloan, address _feeTo) public {
        swapflashloan = ISwapFlashLoan(_swapflashloan);
        FEETO = _feeTo;
    }

    function setFeeTo(address feeTo) public onlyOwner {
        FEETO = feeTo;
    }

    // --- ERC 3156 Spec ---
    function maxFlashLoan(
        address token
    ) external override view returns (uint256) {
        return IERC20(token).balanceOf(address(swapflashloan));
    }

    function flashFee(
        address token,
        uint256 amount
    ) public override view returns (uint256) {
        uint256 dssflashFee = _saddleFee(token, amount);
        uint256 additionalFee = _additionalFee(amount);
        uint256 totalFee = dssflashFee.add(additionalFee);
        return totalFee;
    }

    function _saddleFee(
        address token,
        uint256 amount
    ) internal view returns (uint256) {
        return amount.mul(swapflashloan.flashLoanFeeBPS()).div(10000);
    }

    function _additionalFee(
        uint256 amount
    ) internal view returns (uint256) {
        return amount.mul(5).div(1000);
    }

    function flashLoan(
        IERC3156FlashBorrower receiver,
        address token,
        uint256 amount,
        bytes calldata data
    ) external override returns (bool) {        
        bytes memory data = abi.encode(msg.sender, receiver, token, amount, data);     
        swapflashloan.flashLoan(address(this), IERC20(token), amount, data);                                                   
        return true;
    }

   function executeOperation(
        address pool,
        address token,
        uint256 amount,
        uint256 fee,
        bytes calldata params
    ) external override {
        require(pool == address(swapflashloan), "Callback only from swapflashloan");
        // require(initiator == address(this), "FlashLoan only from this contract");

        (address origin, IERC3156FlashBorrower receiver, address token, uint256 amount, bytes memory userData) = 
            abi.decode(params, (address, IERC3156FlashBorrower, address, uint256, bytes));

        uint256 totalFee = flashFee(token, amount);
        // Transfer to `receiver`
        require(IERC20(token).transfer(address(receiver), amount), "Transfer failed");
        require(
            receiver.onFlashLoan(origin, token, amount, totalFee, userData) == CALLBACK_SUCCESS,
            "Callback failed"
        );
        require(IERC20(token).transferFrom(address(receiver), address(this), amount.add(totalFee)), "Transfer failed");

        uint256 addtionalFee = _additionalFee(amount);
        IERC20(token).transfer(FEETO, addtionalFee);

        IERC20(token).transfer(pool, amount.add(fee));
    }
}