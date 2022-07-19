// SPDX-License-Identifier: AGPL-3.0
pragma solidity 0.8.10;

import {IAaveV3PoolAddressesProvider} from './IAaveV3PoolAddressesProvider.sol';
import {DataTypes} from '../libraries/DataTypes.sol';

/**
 * @title IPool
 * @author Aave
 * @notice Defines the basic interface for an Aave Pool.
 **/
interface IAaveV3Pool {
  function flashLoanSimple(
    address receiverAddress,
    address asset,
    uint256 amount,
    bytes calldata params,
    uint16 referralCode
  ) external;

  function getReserveData(address asset) external view returns (DataTypes.ReserveData memory);

  function FLASHLOAN_PREMIUM_TOTAL() external view returns (uint128);
}
