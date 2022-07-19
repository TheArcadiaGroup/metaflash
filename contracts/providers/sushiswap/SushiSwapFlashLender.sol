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
// import "erc3156/contracts/interfaces/IERC3156FlashLender.sol";
// import "erc3156/contracts/interfaces/IERC3156FlashBorrower.sol";
import "./interfaces/ISushiSwapFlashLender.sol";
import "./interfaces/IFlashLoan.sol";
import "@boringcrypto/boring-solidity/contracts/libraries/BoringERC20.sol";
import "@boringcrypto/boring-solidity/contracts/libraries/BoringMath.sol";
import "@boringcrypto/boring-solidity/contracts/BoringOwnable.sol";

contract SushiSwapFlashLender is
    ISushiSwapFlashLender,
    IFlashBorrower,
    BoringOwnable
{
    using BoringERC20 for IERC20;
    using BoringMath for uint256;

    IBentoBox bentobox;
    bytes32 public constant CALLBACK_SUCCESS =
        keccak256("ERC3156FlashBorrower.onFlashLoan");

    // --- Init ---
    constructor(address _bentobox) public {
        require(
            address(_bentobox) != address(0),
            "SushiSwapERC3156: bentobox address is zero address!"
        );
        bentobox = IBentoBox(_bentobox);
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
        uint256 maxloan = IERC20(_token).balanceOf(address(bentobox));
        if(maxloan >= _amount){
            return maxloan;
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
        uint256 maxloan = IERC20(_token).balanceOf(address(bentobox));
        if(maxloan >= _amount){
            return _amount.mul(50) / 100000;
        }else{
            return 0;
        }
    }

    function flashFeeWithManyPairs_OR_ManyPools(address _token, uint256 _amount)
        public
        view
        override
        returns (uint256)
    {
        uint256 maxloan = IERC20(_token).balanceOf(address(bentobox));
        if(maxloan > 0){
            return _amount.mul(50) / 100000;
        }else{
            return 0;
        }
    }

    function flashLoan(
        IERC3156FlashBorrower _receiver,
        address _token,
        uint256 _amount,
        bytes calldata _userData
    ) external override returns (bool) {
        _flashLoan(_receiver, _token, _amount, _userData);
    }

    function flashLoanWithManyPairs_OR_ManyPools(
        IERC3156FlashBorrower _receiver,
        address _token,
        uint256 _amount,
        bytes calldata _userData
    ) external override returns (bool) {
        _flashLoan(_receiver, _token, _amount, _userData);
    }

    function _flashLoan(
        IERC3156FlashBorrower _receiver,
        address _token,
        uint256 _amount,
        bytes memory _userData
    ) internal returns (bool) {
        bytes memory data = abi.encode(msg.sender, _receiver, _userData);
        bentobox.flashLoan(
            IFlashBorrower(this),
            address(this),
            IERC20(_token),
            _amount,
            data
        );
        return true;
    }

    function onFlashLoan(
        address _sender,
        IERC20 _token,
        uint256 _amount,
        uint256 _fee,
        bytes calldata _data
    ) external override {
        require(
            msg.sender == address(bentobox),
            "SushiSwapERC3156: Callback only from swapflashloan"
        );
        require(
            _sender == address(this),
            "SushiSwapERC3156: FlashLoan only from this contract"
        );

        (
            address origin,
            IERC3156FlashBorrower receiver,
            bytes memory userData
        ) = abi.decode(_data, (address, IERC3156FlashBorrower, bytes));

        _token.safeTransfer(address(receiver), _amount);

        require(
            receiver.onFlashLoan(
                origin,
                address(_token),
                _amount,
                _fee,
                userData
            ) == CALLBACK_SUCCESS,
            "SushiSwapERC3156: Callback failed"
        );

        _token.safeTransferFrom(
            address(receiver),
            address(this),
            _amount.add(_fee)
        );

        // uint256 sushiFee = _sushiFee(address(token), amount);
        _token.safeTransfer(address(bentobox), _amount.add(_fee));
    }
}
