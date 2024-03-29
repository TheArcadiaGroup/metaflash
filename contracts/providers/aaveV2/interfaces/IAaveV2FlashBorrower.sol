// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.7.5;
pragma experimental ABIEncoderV2;


interface IAaveV2FlashBorrower {
  function executeOperation(
    address[] calldata assets,
    uint256[] calldata amounts,
    uint256[] calldata premiums,
    address initiator,
    bytes calldata params
  ) external returns (bool);
}