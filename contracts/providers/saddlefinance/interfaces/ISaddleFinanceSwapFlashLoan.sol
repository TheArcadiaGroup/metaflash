// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface ISaddleFinanceSwapFlashLoan {
    function flashLoanFeeBPS() external view returns (uint256);
    
    function flashLoan(
        address receiver,
        IERC20 token,
        uint256 amount,
        bytes memory params
    ) external;
}
