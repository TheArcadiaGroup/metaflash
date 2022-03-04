// SPDX-License-Identifier: MIT
// Derived from https://github.com/aave/protocol-v2/tree/master/contracts/protocol
pragma solidity ^0.8.4;
pragma experimental ABIEncoderV2;

contract LendingPoolAddressesProviderMock {
    address public getLendingPool;

    constructor(address lendingPool) {
        getLendingPool = lendingPool;
    }
}
