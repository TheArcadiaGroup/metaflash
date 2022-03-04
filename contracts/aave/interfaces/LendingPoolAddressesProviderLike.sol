// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;
pragma experimental ABIEncoderV2;

interface LendingPoolAddressesProviderLike {
    function getLendingPool() external view returns (address);
}
