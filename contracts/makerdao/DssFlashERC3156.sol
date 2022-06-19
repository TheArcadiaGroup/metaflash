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

import "./interfaces/IERC3156FlashLender.sol";
import "./interfaces/IDssFlash.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract DssFlashERC3156 is IERC3156FlashLender, IERC3156FlashBorrower, Ownable {
    using SafeMath for uint256;
    IDssFlash dssflash;
    bytes32 public constant CALLBACK_SUCCESS = keccak256("ERC3156FlashBorrower.onFlashLoan");
    bytes32 public constant CALLBACK_SUCCESS_VAT_DAI = keccak256("VatDaiFlashBorrower.onVatDaiFlashLoan");
    address public FEETO;

    // --- Init ---
    constructor(address _dssflash, address _feeTo) public {
        dssflash = IDssFlash(_dssflash);
        FEETO = _feeTo;
    }

    function setFeeTo(address feeTo) public onlyOwner {
        FEETO = feeTo;
    }

    // --- ERC 3156 Spec ---
    function maxFlashLoan(
        address token
    ) external override view returns (uint256) {
        return dssflash.maxFlashLoan(token);
    }

    function flashFee(
        address token,
        uint256 amount
    ) public override view returns (uint256) {
        uint256 dssflashFee = _dssflashFee(token, amount);
        uint256 additionalFee = _additionalFee(amount);
        uint256 totalFee = dssflashFee.add(additionalFee);
        return totalFee;
    }

    function _dssflashFee(
        address token,
        uint256 amount
    ) internal view returns (uint256) {
        return dssflash.flashFee(token, amount);
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
        bytes memory ndata = abi.encode(
            msg.sender,
            receiver,
            token,
            amount,
            data
        );  
        dssflash.flashLoan(this, token, amount, ndata);                                         
        return true;
    }

    // // --- Vat Dai Flash Loan ---
    // function vatDaiFlashLoan(
    //     IVatDaiFlashBorrower receiver,          // address of conformant IVatDaiFlashBorrower
    //     uint256 amount,                         // amount to flash loan [rad]
    //     bytes calldata data                     // arbitrary data to pass to the receiver
    // ) external override lock returns (bool) {
    //     bytes memory data = abi.encode(
    //         msg.sender,
    //         receiver,
    //         token,
    //         userData
    //     );
    //     dssflash.vatDaiFlashLoan(address(this), amount, _data);
    //     return true;
    // }

    /// @dev flash loan callback. It sends the amount borrowed to `receiver`, and takes it back plus a `flashFee` after the ERC3156 callback.
    function onFlashLoan(
        address initiator,
        address token,
        uint256 amount,
        uint256 fee,
        bytes calldata data
    ) external override returns (bytes32) {
        require(msg.sender == address(dssflash), "Callback only from dssflash");
        require(initiator == address(this), "FlashLoan only from this contract");

        (address origin, IERC3156FlashBorrower receiver, address token, uint256 amount, bytes memory userData) = 
            abi.decode(data, (address, IERC3156FlashBorrower, address, uint256, bytes));

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

        IERC20(token).approve(address(dssflash), amount.add(fee));
        
        return CALLBACK_SUCCESS;
    }

// /// @dev flash loan callback. It sends the amount borrowed to `receiver`, and takes it back plus a `flashFee` after the ERC3156 callback.
//     function onVatDaiFlashLoan(
//         address initiator,
//         address token,
//         uint256 amount,
//         uint256 fee,
//         bytes calldata data
//     ) external override returns (bytes32) {
//         require(msg.sender == address(dssflash), "Callback only from dssflash");
//         require(initiator == address(this), "FlashLoan only from this contract");

//         (address origin, IERC3156FlashBorrower receiver, bytes memory userData) = 
//             abi.decode(data, (address, IERC3156FlashBorrower, bytes));

//         uint256 fee = dssflash.flashFee(token, amount);

//         // Transfer to `receiver`
//         require(IERC20(token).transfer(address(receiver), amount), "Transfer failed");
//         require(
//             receiver.onFlashLoan(origin, token, amount, fee, userData) == CALLBACK_SUCCESS,
//             "Callback failed"
//         );
//         require(IERC20(token).transferFrom(address(receiver), address(this), amount.add(fee)), "Transfer failed");

//         IERC20(token).approve(address(dssflash), amount.add(fee));
        
//         return CALLBACK_SUCCESS
//     }
}