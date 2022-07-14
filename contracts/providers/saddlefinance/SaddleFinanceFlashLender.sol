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

import "./interfaces/ISaddleFinanceSwapFlashLoan.sol";
import "./interfaces/ISaddleFinanceFlashBorrower.sol";
import "./interfaces/ISaddleFinanceFlashLender.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "hardhat/console.sol";

contract SaddleFinanceFlashLender is
    ISaddleFinanceFlashLender,
    ISaddleFinanceFlashBorrower,
    Ownable
{
    using SafeMath for uint256;
    // ISwapFlashLoan swapflashloan;
    bytes32 public constant CALLBACK_SUCCESS =
        keccak256("ERC3156FlashBorrower.onFlashLoan");
    address public FEETO;
    address[] public pools;
    address permissionedPoolAddress;

    struct PoolInfo {
        address pool;
        uint256 maxloan;
        uint256 fee;
    }

    // --- Init ---
    constructor() public {}

    function addPools(address[] memory _pool) public onlyOwner returns (bool) {
        for (uint256 i = 0; i < _pool.length; i++) {
            require(
                _pool[i] != address(0),
                "SaddleFinanceFlashLender: Unsupported currency"
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

    // function _getBiggestPool(address _token)
    //     internal
    //     view
    //     returns (address, uint256)
    // {
    //     uint256 biggestMaxLoan;
    //     address biggestPool;

    //     for (uint256 i = 0; i < pools.length; i++) {
    //         uint256 balance = IERC20(_token).balanceOf(pools[i]);
    //         if (balance > biggestMaxLoan) {
    //             biggestMaxLoan = balance;
    //             biggestPool = pools[i];
    //         }
    //     }
    //     return (biggestPool, biggestMaxLoan);
    // }

    function _sortPoolsByFee(address _token, uint256 _amount)
        internal
        view
        returns (PoolInfo[] memory)
    {
        uint256 amount = 1e18;
        uint256 count = 0;
        for (uint256 i = 0; i < pools.length; i++) {
            uint256 balance = IERC20(_token).balanceOf(pools[i]);
            if (balance >= _amount) {
                count++;
            }
        }

        if (count == 0) {
            PoolInfo[] memory validPoolInfos = new PoolInfo[](1);
            validPoolInfos[0].pool = address(0);
            validPoolInfos[0].maxloan = uint256(0);
            validPoolInfos[0].fee = uint256(0);

            return validPoolInfos;
        } else {
            PoolInfo[] memory validPoolInfos = new PoolInfo[](count);

            uint256 validCount = 0;

            for (uint256 i = 0; i < pools.length; i++) {
                uint256 balance = IERC20(_token).balanceOf(pools[i]);
                if (balance >= _amount) {
                    uint256 fee = amount
                        .mul(
                            ISaddleFinanceSwapFlashLoan(pools[i])
                                .flashLoanFeeBPS()
                        )
                        .div(10000);
                    validPoolInfos[validCount].pool = pools[i];
                    validPoolInfos[validCount].maxloan = balance;
                    validPoolInfos[validCount].fee = fee;
                    validCount = validCount.add(1);
                    if (validCount == count) {
                        break;
                    }
                }
            }

            if (validPoolInfos.length == 1) {
                return validPoolInfos;
            } else {
                // sort by fee
                for (uint256 i = 1; i < validPoolInfos.length; i++) {
                    for (uint256 j = 0; j < i; j++) {
                        if (validPoolInfos[i].fee < validPoolInfos[j].fee) {
                            PoolInfo memory x = validPoolInfos[i];
                            validPoolInfos[i] = validPoolInfos[j];
                            validPoolInfos[j] = x;
                        }
                    }
                }
                // sort by maxloan
                for (uint256 i = 1; i < validPoolInfos.length; i++) {
                    for (uint256 j = 0; j < i; j++) {
                        if (validPoolInfos[i].fee == validPoolInfos[j].fee) {
                            if(validPoolInfos[i].maxloan > validPoolInfos[j].maxloan){
                                PoolInfo memory x = validPoolInfos[i];
                                validPoolInfos[i] = validPoolInfos[j];
                                validPoolInfos[j] = x;
                            }

                        }
                    }
                }
            }

            return validPoolInfos;
        }
    }

    function maxFlashLoan(address _token, uint256 _amount)
        external
        view
        override
        returns (uint256)
    {
        PoolInfo[] memory validPoolInfos = _sortPoolsByFee(_token, _amount);

        return validPoolInfos[0].maxloan;
    }

    function maxFlashLoanWithManyPairs_OR_ManyPools(address _token)
        external
        view
        override
        returns (uint256)
    {
        uint256 totalMaxLoan;

        PoolInfo[] memory validPoolInfos = _sortPoolsByFee(_token, 1);

        if (validPoolInfos[0].maxloan > 0) {
            for (uint256 i = 0; i < validPoolInfos.length; i++) {
                totalMaxLoan = totalMaxLoan.add(validPoolInfos[i].maxloan);
            }
            return totalMaxLoan;
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
        PoolInfo[] memory validPoolInfos = _sortPoolsByFee(_token, _amount);

        if (validPoolInfos[0].maxloan > 0) {
            return _flashFee(validPoolInfos[0].pool, _token, _amount);
        } else {
            return 0;
        }
    }

    function flashFeeWithManyPairs_OR_ManyPools(address _token, uint256 _amount)
        public
        view
        override
        returns (uint256)
    {
        uint256 fee = 0;
        uint256 totalAmount = _amount;
        uint256 amount = 0;
        PoolInfo[] memory validPoolInfos = _sortPoolsByFee(_token, 1);

        if (validPoolInfos[0].maxloan > 0) {
            for (uint256 i = 0; i < validPoolInfos.length; i++) {
                if (amount.add(validPoolInfos[i].maxloan) <= totalAmount) {
                    fee = fee.add(
                        _flashFee(
                            validPoolInfos[i].pool,
                            _token,
                            validPoolInfos[i].maxloan
                        )
                    );
                    amount = amount.add(validPoolInfos[i].maxloan);
                    if (amount == totalAmount) {
                        break;
                    }
                } else {
                    fee = fee.add(
                        _flashFee(
                            validPoolInfos[i].pool,
                            _token,
                            totalAmount.sub(amount)
                        )
                    );
                    amount = totalAmount;
                    break;
                }
            }
            return fee;
        } else {
            return 0;
        }
    }

    function _flashFee(
        address _pool,
        address _token,
        uint256 _amount
    ) internal view returns (uint256) {
        return
            _amount
                .mul(ISaddleFinanceSwapFlashLoan(_pool).flashLoanFeeBPS())
                .div(10000);
    }

    function flashLoan(
        IERC3156FlashBorrower _receiver,
        address _token,
        uint256 _amount,
        bytes calldata _data
    ) external override returns (bool) {
        PoolInfo[] memory validPoolInfos = _sortPoolsByFee(_token, _amount);

        require(
            validPoolInfos[0].pool != address(0),
            "SaddleFinanceFlashLender: Unsupported currency"
        );

        _flashLoan(_receiver, validPoolInfos[0].pool, _token, _amount, _data);

        return true;
    }

    function flashLoanWithManyPairs_OR_ManyPools(
        IERC3156FlashBorrower _receiver,
        address _token,
        uint256 _amount,
        bytes calldata _data
    ) external override returns (bool) {
        uint256 totalMaxLoan;
        uint256 totalAmount = _amount;
        PoolInfo[] memory validPoolInfos = _sortPoolsByFee(_token, 1);

        require(
            validPoolInfos[0].pool != address(0),
            "SaddleFinanceFlashLender: Unsupported currency"
        );

        for (uint256 i = 0; i < validPoolInfos.length; i++) {
            totalMaxLoan = totalMaxLoan.add(validPoolInfos[i].maxloan);
        }

        require(
            totalMaxLoan >= totalAmount,
            "SaddleFinanceFlashLender: Amount is more than maxFlashLoan"
        );

        uint256 amount = 0;
        for (uint256 i = 0; i < validPoolInfos.length; i++) {
            if (amount.add(validPoolInfos[i].maxloan) <= totalAmount) {
                _flashLoan(
                    _receiver,
                    validPoolInfos[i].pool,
                    _token,
                    validPoolInfos[i].maxloan,
                    _data
                );
                amount = amount.add(validPoolInfos[i].maxloan);
                if (amount == totalAmount) {
                    break;
                }
            } else {
                _flashLoan(
                    _receiver,
                    validPoolInfos[i].pool,
                    _token,
                    totalAmount.sub(amount),
                    _data
                );
                amount = totalAmount;
                break;
            }
        }
        return true;
    }

    function _flashLoan(
        IERC3156FlashBorrower _receiver,
        address _pool,
        address _token,
        uint256 _amount,
        bytes memory _data
    ) internal {
        ISaddleFinanceSwapFlashLoan pool = ISaddleFinanceSwapFlashLoan(_pool);

        bytes memory data = abi.encode(
            address(this),
            msg.sender,
            _receiver,
            _data
        );
        pool.flashLoan(address(this), IERC20(_token), _amount, data);
    }

    function executeOperation(
        address _pool,
        address _token,
        uint256 _amount,
        uint256 _fee,
        bytes calldata _params
    ) external override {
        require(
            msg.sender == _pool,
            "SaddleFinanceFlashLender: only permissioned pool can call"
        );

        (
            address sender,
            address origin,
            IERC3156FlashBorrower receiver,
            bytes memory userData
        ) = abi.decode(
                _params,
                (address, address, IERC3156FlashBorrower, bytes)
            );

        require(
            sender == address(this),
            "SaddleFinanceFlashLender:  only initiate from this contract"
        );

        // Transfer to `receiver`
        require(
            IERC20(_token).transfer(address(receiver), _amount),
            "SaddleFinanceFlashLender: Transfer failed"
        );

        require(
            receiver.onFlashLoan(origin, _token, _amount, _fee, userData) ==
                CALLBACK_SUCCESS,
            "SaddleFinanceFlashLender: Callback failed"
        );

        require(
            IERC20(_token).transferFrom(
                address(receiver),
                address(this),
                _amount.add(_fee)
            ),
            "SaddleFinanceFlashLender: Transfer failed"
        );

        IERC20(_token).transfer(_pool, _amount.add(_fee));
    }
}
