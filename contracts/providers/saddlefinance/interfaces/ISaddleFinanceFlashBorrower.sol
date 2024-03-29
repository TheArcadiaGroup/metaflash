// SPDX-License-Identifier: AGPL-3.0-only

pragma solidity 0.6.12;

interface ISaddleFinanceFlashBorrower {
    function executeOperation(
        address pool,
        address token,
        uint256 amount,
        uint256 fee,
        bytes calldata params
    ) external;
}