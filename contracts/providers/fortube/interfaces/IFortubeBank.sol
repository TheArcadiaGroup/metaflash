// SPDX-License-Identifier: MIT

pragma solidity 0.6.4;

interface IFortubeBank {
    function flashloan(
        address receiver,
        address token,
        uint256 amount,
        bytes calldata params
    ) external;
}