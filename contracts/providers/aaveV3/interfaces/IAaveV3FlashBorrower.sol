// SPDX-License-Identifier: AGPL-3.0
pragma solidity 0.8.10;

interface IAaveV3FlashBorrower {
  function executeOperation(
    address asset,
    uint256 amount,
    uint256 premium,
    address initiator,
    bytes calldata params
  ) external returns (bool);

}
