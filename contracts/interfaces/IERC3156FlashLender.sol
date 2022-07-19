pragma solidity >=0.5.0;

import "./IERC3156FlashBorrower.sol";

interface IERC3156FlashLender {
    function maxFlashLoan(
        address token,
        uint256 amount
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

    function maxFlashLoanWithManyPairs_OR_ManyPools(
        address token
    ) external view returns (uint256);

    function flashFeeWithManyPairs_OR_ManyPools(
        address token,
        uint256 amount
    ) external view returns (uint256);

    function flashLoanWithManyPairs_OR_ManyPools(
        IERC3156FlashBorrower receiver,
        address token,
        uint256 amount,
        bytes calldata data
    ) external returns (bool);
}