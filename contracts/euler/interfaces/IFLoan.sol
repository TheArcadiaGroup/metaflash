// SPDX-License-Identifier: GPL-2.0-or-later

pragma solidity ^0.8.0;
import "erc3156/contracts/interfaces/IERC3156FlashBorrower.sol";

interface IFLoan {
    function maxFlashLoan(address token) external view returns (uint);
    function flashFee(address token, uint) external view returns (uint);
    function flashLoan(IERC3156FlashBorrower receiver, address token, uint256 amount, bytes calldata data) external returns (bool);
}