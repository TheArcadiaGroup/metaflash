// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity >=0.6.12;

import "erc3156/contracts/interfaces/IERC3156FlashBorrower.sol";

interface IMakerDaoDssFlash {
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

    function onFlashLoan(
        address initiator,
        address token,
        uint256 amount,
        uint256 fee,
        bytes calldata data
    ) external returns (bytes32);
}