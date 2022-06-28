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

contract SaddleFinanceERC3156 is
    IERC3156FlashLender,
    IFlashLoanReceiver,
    Ownable
{
    using SafeMath for uint256;
    // ISwapFlashLoan swapflashloan;
    bytes32 public constant CALLBACK_SUCCESS =
        keccak256("ERC3156FlashBorrower.onFlashLoan");
    address public FEETO;
    address[] public pools;
    address permissionedPoolAddress;

    // --- Init ---
    constructor(address _feeTo) public {
        require(
            address(_feeTo) != address(0),
            "SaddleFinanceERC3156: feeTo address is zero address!"
        );
        FEETO = _feeTo;
    }

    function setFeeTo(address _feeTo) public onlyOwner {
        require(
            address(_feeTo) != address(0),
            "SaddleFinanceERC3156: feeTo address is zero address!"
        );
        FEETO = _feeTo;
    }

    function addPools(address[] memory _pool) public onlyOwner returns (bool) {
        for (uint256 i = 0; i < _pool.length; i++) {
            require(
                _pool[i] != address(0),
                "SaddleFinanceERC3156: Unsupported currency"
            );
            pools.push(_pool[i]);
        }
        return true;
    }

    function removePools(address[] memory _pool)
        public
        onlyOwner
        returns (bool)
    {
        for (uint256 i = 0; i < _pool.length; i++) {
            for (uint256 j = 0; j < pools.length; j++) {
                if (pools[j] == _pool[i]) {
                    pools[j] = pools[pools.length - 1];
                    pools.pop();
                }
            }
        }
        return true;
    }

    function _biggestPool(address _token)
        internal
        view
        returns (address, uint256)
    {
        uint256 maxloan;
        address pool;
        
        for (uint256 i = 0; i < pools.length; i++) {
            uint256 balance = IERC20(_token).balanceOf(pools[i]);
            if (balance > maxloan) {
                maxloan = balance;
                pool = pools[i];
            }
        }
        return (pool, maxloan);
    }

    // --- ERC 3156 Spec ---
    function maxFlashLoan(address _token)
        external
        view
        override
        returns (uint256)
    {
        // return IERC20(_token).balanceOf(address(swapflashloan));
        uint256 maxloan;
        address poolAddress;
        (poolAddress, maxloan) = _biggestPool(_token);
        require(
            poolAddress != address(0),
            "SaddleFinanceERC3156: Unsupported currency"
        );
        return maxloan;
    }

    function flashFee(address _token, uint256 _amount)
        public
        view
        override
        returns (uint256)
    {
        uint256 saddleFee = _saddleFee(_token, _amount);
        uint256 additionalFee = _additionalFee(_amount);
        uint256 totalFee = saddleFee.add(additionalFee);
        return totalFee;
    }

    function _saddleFee(address _token, uint256 _amount)
        internal
        view
        returns (uint256)
    {
        uint256 maxloan;
        address poolAddress;
        (poolAddress, maxloan) = _biggestPool(_token);
        require(
            poolAddress != address(0),
            "SaddleFinanceERC3156: Unsupported currency"
        );
        return _amount.mul(ISwapFlashLoan(poolAddress).flashLoanFeeBPS()).div(10000);
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
        address poolAddress;
        (poolAddress, ) = _biggestPool(_token);
        require(poolAddress != address(0),
            "SaddleFinanceERC3156: Unsupported currency"
        );

        ISwapFlashLoan pool = ISwapFlashLoan(poolAddress);

        if (permissionedPoolAddress != poolAddress)
            permissionedPoolAddress = poolAddress;

        bytes memory data = abi.encode(msg.sender, _receiver, _data);
        pool.flashLoan(address(this), IERC20(_token), _amount, data);
        return true;
    }

    function executeOperation(
        address _pool,
        address _token,
        uint256 _amount,
        uint256 _fee,
        bytes calldata _params
    ) external override {
        require(
            _pool == permissionedPoolAddress,
            "SaddleFinanceERC3156: Callback only from swapflashloan"
        );

        (
            address origin,
            IERC3156FlashBorrower receiver,
            bytes memory userData
        ) = abi.decode(_params, (address, IERC3156FlashBorrower, bytes));
        
        uint256 addtionalFee = _additionalFee(_amount);
        uint256 totalFee = addtionalFee.add(_fee);

        // Transfer to `receiver`
        require(
            IERC20(_token).transfer(address(receiver), _amount),
            "SaddleFinanceERC3156: Transfer failed"
        );
        require(
            receiver.onFlashLoan(origin, _token, _amount, totalFee, userData) ==
                CALLBACK_SUCCESS,
            "SaddleFinanceERC3156: Callback failed"
        );
        require(
            IERC20(_token).transferFrom(
                address(receiver),
                address(this),
                _amount.add(totalFee)
            ),
            "SaddleFinanceERC3156: Transfer failed"
        );

        // uint256 addtionalFee = _additionalFee(_amount);
        IERC20(_token).transfer(FEETO, addtionalFee);

        IERC20(_token).transfer(_pool, _amount.add(_fee));
    }
}
