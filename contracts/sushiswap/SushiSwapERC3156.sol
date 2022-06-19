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

import "./interfaces/IBentoBox.sol";
import "erc3156/contracts/interfaces/IERC3156FlashLender.sol";
import "erc3156/contracts/interfaces/IERC3156FlashBorrower.sol";
import "./interfaces/IFlashLoan.sol";
import "@boringcrypto/boring-solidity/contracts/libraries/BoringERC20.sol";
import "@boringcrypto/boring-solidity/contracts/libraries/BoringMath.sol";
import "@boringcrypto/boring-solidity/contracts/BoringOwnable.sol";

contract SushiSwapERC3156 is IERC3156FlashLender, IFlashBorrower, BoringOwnable {
    using BoringERC20 for IERC20;
    using BoringMath for uint256;
    address public FEETO;

    IBentoBox bentobox;
    bytes32 public constant CALLBACK_SUCCESS = keccak256("ERC3156FlashBorrower.onFlashLoan");

    // --- Init ---
    constructor(address _bentobox, address _feeTo) public {
        bentobox = IBentoBox(_bentobox);
        FEETO = _feeTo;
    }

    function setFeeTo(address feeTo) public onlyOwner {
        FEETO = feeTo;
    }

    // --- ERC 3156 Spec ---
    function maxFlashLoan(
        address token
    ) external override view returns (uint256) {
        return IERC20(token).balanceOf(address(bentobox));
    }

    function flashFee(address token, uint256 amount)
        public
        view
        override
        returns (uint256)
    {
        uint256 sushiFee = _sushiFee(token, amount);
        uint256 additionalFee = _additionalFee(amount);
        uint256 totalFee = sushiFee.add(additionalFee);
        return totalFee;
    }

    function _sushiFee(address token, uint256 amount)
        internal
        view
        returns (uint256)
    {
        return amount.mul(50)/100000;
    }

    function _additionalFee(uint256 amount) internal view returns (uint256) {
        return amount.mul(5)/(1000);
    }

    function flashLoan(
        IERC3156FlashBorrower receiver,
        address token,
        uint256 amount,
        bytes calldata data
    ) external override returns (bool) {        
        bytes memory data = abi.encode(msg.sender, receiver, amount, data);     
        bentobox.flashLoan(IFlashBorrower(this), address(this), IERC20(token), amount, data);                                                   
        return true;
    }

    function onFlashLoan(
        address sender,
        IERC20 token,
        uint256 amount,
        uint256 fee,
        bytes calldata data
    ) external override {
        require(msg.sender == address(bentobox), "Callback only from swapflashloan");
        require(sender == address(this), "FlashLoan only from this contract");

        (address origin, IERC3156FlashBorrower receiver, uint256 amount, bytes memory userData) = 
            abi.decode(data, (address, IERC3156FlashBorrower, uint256, bytes));

        // Transfer to `receiver`
        token.safeTransfer(address(receiver), amount);

        uint256 totalFee = flashFee(address(token), amount);
        require(
            receiver.onFlashLoan(origin, address(token), amount, totalFee, userData) == CALLBACK_SUCCESS,
            "Callback failed"
        );

        token.safeTransferFrom(address(receiver), address(this), amount.add(totalFee));

        uint256 addtionalFee = _additionalFee(amount);
        IERC20(token).safeTransfer(FEETO, addtionalFee);

        uint256 sushiFee = _sushiFee(address(token), amount);
        token.safeTransfer(address(bentobox), amount.add(sushiFee));
    }
}