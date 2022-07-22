// SPDX-License-Identifier: GPL-2.0-or-later

pragma solidity ^0.8.0;
import "erc3156/contracts/interfaces/IERC3156FlashBorrower.sol";

interface ILendingPool {
    function flashLoan(
        address _receiver,
        address _reserve,
        uint256 _amount,
        bytes memory _params) external;

    function core() external view returns (address);

    function feeProvider() external view returns (address);
}

interface IFeeProvider {
    function getFlashLoanFee() external view returns (uint256);
}