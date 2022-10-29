pragma solidity ^0.8.0;

import "erc3156/contracts/interfaces/IERC3156FlashBorrower.sol";

interface IFlashLender {
    function maxFlashLoanWithCheapestProvider(
        address token,
        uint256 minAmount
    ) external view returns (uint256);

    function flashFeeWithCheapestProvider(
        address token,
        uint256 minAmount
    ) external view returns (uint256);

    function flashLoanWithCheapestProvider(
        IERC3156FlashBorrower receiver,
        address token,
        uint256 amount,
        bytes calldata data
    ) external returns (bool);

    function maxFlashLoanWithManyProviders(
        address token,
        uint256 minAmount
    ) external view returns (uint256);

    function flashFeeWithManyProviders(
        address token,
        uint256 amount,
        uint256 minAmount
    ) external view returns (uint256);

    function flashLoanWithManyProviders(
        IERC3156FlashBorrower receiver,
        address token,
        uint256 amount,
        bytes calldata data,
        uint256 minAmount
    ) external returns (bool);
}