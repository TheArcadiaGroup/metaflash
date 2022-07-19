// SPDX-License-Identifier: MIT
pragma solidity 0.6.12;
import "../interfaces/IFlashLoan.sol";

interface IBentoBox {
    function flashLoan(
        IFlashBorrower borrower,
        address receiver,
        IERC20 token,
        uint256 amount,
        bytes calldata data
    ) external;
}
