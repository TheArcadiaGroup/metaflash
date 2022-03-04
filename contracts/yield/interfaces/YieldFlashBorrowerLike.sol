// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

interface YieldFlashBorrowerLike {
    function executeOnFlashMint(uint256 fyDaiAmount, bytes memory data) external;
}
