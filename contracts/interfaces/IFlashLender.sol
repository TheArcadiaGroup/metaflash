pragma solidity >=0.5.0;

import "./IERC3156FlashBorrower.sol";

interface IFlashLender {
    function maxFlashLoanWithCheapestProvider(
        address token,
        uint256 amount
    ) external view returns (uint256);

    function flashFeeWithCheapestProvider(
        address token,
        uint256 amount
    ) external view returns (uint256);

    function flashLoanWithCheapestProvider(
        IERC3156FlashBorrower receiver,
        address token,
        uint256 amount,
        bytes calldata data
    ) external returns (bool);

    function maxFlashLoanWithManyProviders(
        address token
    ) external view returns (uint256);

    function flashFeeWithManyProviders(
        address token,
        uint256 amount
    ) external view returns (uint256);

    function flashLoanWithManyProviders(
        IERC3156FlashBorrower receiver,
        address token,
        uint256 amount,
        bytes calldata data
    ) external returns (bool);
}