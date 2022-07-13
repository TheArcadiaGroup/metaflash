// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity >=0.6.12;
import "./IERC3156FlashBorrower.sol";
import "./IVatDaiFlashBorrower.sol";

interface IDssFlash {
    function maxFlashLoan(
        address token
    ) external view returns (uint256);

    function flashFee(
        address token,
        uint256 amount
    ) external view returns (uint256);

    function flashLoan(
        IERC3156FlashBorrower receiver,
        address token,
        uint256 amount,
        bytes calldata data
    ) external returns (bool);

    function vatDaiFlashLoan(
        IVatDaiFlashBorrower receiver,          // address of conformant IVatDaiFlashBorrower
        uint256 amount,                         // amount to flash loan [rad]
        bytes calldata data                     // arbitrary data to pass to the receiver
    ) external returns (bool);

    function onFlashLoan(
        address initiator,
        address token,
        uint256 amount,
        uint256 fee,
        bytes calldata data
    ) external returns (bytes32);
}