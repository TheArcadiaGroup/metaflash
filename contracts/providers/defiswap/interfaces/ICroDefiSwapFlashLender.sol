// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.7.5;
import "erc3156/contracts/interfaces/IERC3156FlashBorrower.sol";

interface ICroDefiSwapFlashLender {
    function maxFlashLoan(address token, uint256 _amount) external view returns (uint256);

    function flashFee(address token, uint256 amount)
        external
        view
        returns (uint256);

    function flashLoan(
        IERC3156FlashBorrower receiver,
        address token,
        uint256 amount,
        bytes calldata data
    ) external returns (bool);

    function maxFlashLoanWithManyPairs_OR_ManyPools(address token)
        external
        view
        returns (uint256);

    function flashFeeWithManyPairs_OR_ManyPools(address token, uint256 amount)
        external
        view
        returns (uint256);

    function flashLoanWithManyPairs_OR_ManyPools(
        IERC3156FlashBorrower receiver,
        address token,
        uint256 amount,
        bytes calldata data
    ) external returns (bool);
}
