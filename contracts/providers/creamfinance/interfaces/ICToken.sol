// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.5.16;

import "./IERC3156FlashBorrower.sol";

interface ICToken {
    function maxFlashLoan(address token) external view returns (uint256);

    function flashFee(address token, uint256 amount) external view returns (uint256);

    function flashLoan(
        IERC3156FlashBorrower receiver,
        address token,
        uint256 amount,
        bytes calldata data
    ) external returns (bool);
}