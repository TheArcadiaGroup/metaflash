// SPDX-License-Identifier: MIT

pragma solidity 0.6.4;

interface IFortubeBankController {
    function flashloanFeeBips() external view returns (uint256);
}
