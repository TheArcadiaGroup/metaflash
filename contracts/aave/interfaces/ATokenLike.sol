// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;
pragma experimental ABIEncoderV2;

interface ATokenLike {
    function underlying() external view returns (address);

    function transferUnderlyingTo(address, uint256) external;
}
