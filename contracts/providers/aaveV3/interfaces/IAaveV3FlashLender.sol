// SPDX-License-Identifier: MIT

pragma solidity 0.8.10;

import "erc3156/contracts/interfaces/IERC3156FlashBorrower.sol";

interface IAaveV3FlashLender {
    function getFlashLoanInfoListWithCheaperFeePriority(address _token, uint256 _amount)
        external
        view
        returns (address[] memory pools, uint256[] memory maxloans, uint256[] memory fees);

    function flashFee(address _pair, address _token, uint256 _amount)
        external
        view
        returns (uint256);
        
    function flashLoan(
        address _pair,
        IERC3156FlashBorrower receiver,
        address token,
        uint256 amount,
        bytes calldata data
    ) external returns (bool);
}