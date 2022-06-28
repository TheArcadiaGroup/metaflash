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

contract DssFlashERC3156 is
    IERC3156FlashLender,
    IERC3156FlashBorrower,
    Ownable
{
    using SafeMath for uint256;
    IDssFlash dssflash;
    bytes32 public constant CALLBACK_SUCCESS =
        keccak256("ERC3156FlashBorrower.onFlashLoan");
    address public FEETO;

    // --- Init ---
    constructor(address _dssflash, address _feeTo) public {
        require(
            address(_dssflash) != address(0),
            "DssFlashERC3156: factory address is zero address!"
        );
        require(
            address(_feeTo) != address(0),
            "DssFlashERC3156: feeTo address is zero address!"
        );
        dssflash = IDssFlash(_dssflash);
        FEETO = _feeTo;
    }

    function setFeeTo(address _feeTo) public onlyOwner {
        require(
            address(_feeTo) != address(0),
            "DssFlashERC3156: feeTo address is zero address!"
        );
        FEETO = _feeTo;
    }

    // --- ERC 3156 Spec ---
    function maxFlashLoan(address _token)
        external
        view
        override
        returns (uint256)
    {
        return dssflash.maxFlashLoan(_token);
    }

    function flashFee(address _token, uint256 _amount)
        public
        view
        override
        returns (uint256)
    {
        uint256 dssflashFee = _dssflashFee(_token, _amount);
        uint256 additionalFee = _additionalFee(_amount);
        uint256 totalFee = dssflashFee.add(additionalFee);
        return totalFee;
    }

    function _dssflashFee(address _token, uint256 _amount)
        internal
        view
        returns (uint256)
    {
        return dssflash.flashFee(_token, _amount);
    }

    function _additionalFee(uint256 _amount) internal view returns (uint256) {
        return _amount.mul(5).div(1000);
    }

    function flashLoan(
        IERC3156FlashBorrower _receiver,
        address _token,
        uint256 _amount,
        bytes calldata _data
    ) external override returns (bool) {
        bytes memory ndata = abi.encode(msg.sender, _receiver, _data);
        dssflash.flashLoan(this, _token, _amount, ndata);
        return true;
    }

    /// @dev flash loan callback. It sends the amount borrowed to `receiver`, and takes it back plus a `flashFee` after the ERC3156 callback.
    function onFlashLoan(
        address _sender,
        address _token,
        uint256 _amount,
        uint256 _fee,
        bytes calldata _data
    ) external override returns (bytes32) {
        require(
            msg.sender == address(dssflash),
            "DssFlashERC3156: Callback only from dssflash"
        );
        require(
            _sender == address(this),
            "DssFlashERC3156: FlashLoan only from this contract"
        );

        (
            address origin,
            IERC3156FlashBorrower receiver,
            bytes memory userData
        ) = abi.decode(_data, (address, IERC3156FlashBorrower, bytes));

        uint256 totalFee = flashFee(_token, _amount);

        // Transfer to `receiver`
        require(
            IERC20(_token).transfer(address(receiver), _amount),
            "DssFlashERC3156: Transfer failed"
        );
        require(
            receiver.onFlashLoan(origin, _token, _amount, totalFee, userData) ==
                CALLBACK_SUCCESS,
            "DssFlashERC3156: Callback failed"
        );
        require(
            IERC20(_token).transferFrom(
                address(receiver),
                address(this),
                _amount.add(totalFee)
            ),
            "DssFlashERC3156: Transfer failed"
        );

        uint256 addtionalFee = _additionalFee(_amount);
        IERC20(_token).transfer(FEETO, addtionalFee);

        IERC20(_token).approve(address(dssflash), _amount.add(_fee));

        return CALLBACK_SUCCESS;
    }
}
