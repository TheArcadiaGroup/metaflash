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

import "erc3156/contracts/interfaces/IERC3156FlashBorrower.sol";
import "./interfaces/IMakerDaoFlashLender.sol";
import "./interfaces/IMakerDaoFlashBorrower.sol";
import "./interfaces/IMakerDaoDssFlash.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract MakerDaoFlashLender is
    IMakerDaoFlashLender,
    IERC3156FlashBorrower,
    Ownable
{
    using SafeMath for uint256;
    IMakerDaoDssFlash dssflash;
    bytes32 public constant CALLBACK_SUCCESS =
        keccak256("ERC3156FlashBorrower.onFlashLoan");

    // --- Init ---
    constructor(address _dssflash) public {
        require(
            address(_dssflash) != address(0),
            "MakerDaoFlashLender: _dssflash address is zero address!"
        );
        dssflash = IMakerDaoDssFlash(_dssflash);
    }

    function maxFlashLoan(address _token, uint256 _amount)
        external
        view
        override
        returns (uint256)
    {
        return _maxFlashLoan(_token, _amount);
    }

    function maxFlashLoanWithManyPairs_OR_ManyPools(address _token)
        external
        view
        override
        returns (uint256)
    {
        return _maxFlashLoan(_token, 1);
    }

    function _maxFlashLoan(address _token, uint256 _amount)
        internal
        view
        returns (uint256)
    {
        uint256 maxloan = dssflash.maxFlashLoan(_token);
        if (maxloan >= _amount) {
            return maxloan;
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
        uint256 maxloan = dssflash.maxFlashLoan(_token);
        if (maxloan >= _amount) {
            return dssflash.flashFee(_token, _amount);
        } else {
            return 0;
        }
    }

    function flashFeeWithManyPairs_OR_ManyPools(address _token, uint256 _amount)
        public
        view
        override
        returns (uint256, uint256)
    {
        uint256 maxloan = dssflash.maxFlashLoan(_token);
        if (maxloan > 0) {
            return (dssflash.flashFee(_token, _amount), 1);
        } else {
            return (0, 0);
        }
    }

    function flashLoan(
        IERC3156FlashBorrower _receiver,
        address _token,
        uint256 _amount,
        bytes calldata _userData
    ) external override returns (bool) {
        _flashLoan(_receiver, _token, _amount, _userData);
        return true;
    }

    function flashLoanWithManyPairs_OR_ManyPools(
        IERC3156FlashBorrower _receiver,
        address _token,
        uint256 _amount,
        bytes calldata _userData
    ) external override returns (bool) {
        _flashLoan(_receiver, _token, _amount, _userData);
        return true;
    }

    function _flashLoan(
        IERC3156FlashBorrower _receiver,
        address _token,
        uint256 _amount,
        bytes calldata _data
    ) internal {
        bytes memory ndata = abi.encode(msg.sender, _receiver, _data);
        dssflash.flashLoan(this, _token, _amount, ndata);
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
            "MakerDaoFlashLender: Callback only from dssflash"
        );
        require(
            _sender == address(this),
            "MakerDaoFlashLender: FlashLoan only from this contract"
        );

        (
            address origin,
            IERC3156FlashBorrower receiver,
            bytes memory userData
        ) = abi.decode(_data, (address, IERC3156FlashBorrower, bytes));

        // Transfer to `receiver`
        require(
            IERC20(_token).transfer(address(receiver), _amount),
            "MakerDaoFlashLender: Transfer failed"
        );
        require(
            receiver.onFlashLoan(origin, _token, _amount, _fee, userData) ==
                CALLBACK_SUCCESS,
            "MakerDaoFlashLender: Callback failed"
        );
        require(
            IERC20(_token).transferFrom(
                address(receiver),
                address(this),
                _amount.add(_fee)
            ),
            "MakerDaoFlashLender: Transfer failed"
        );

        IERC20(_token).approve(address(dssflash), _amount.add(_fee));

        return CALLBACK_SUCCESS;
    }
}
