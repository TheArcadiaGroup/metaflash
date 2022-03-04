// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface IFYDai is IERC20 {
    function isMature() external view returns (bool);

    function maturity() external view returns (uint256);

    function chi0() external view returns (uint256);

    function rate0() external view returns (uint256);

    function chiGrowth() external view returns (uint256);

    function rateGrowth() external view returns (uint256);

    function mature() external;

    function unlocked() external view returns (uint256);

    function mint(address, uint256) external;

    function burn(address, uint256) external;

    function flashMint(uint256, bytes calldata) external;

    function redeem(
        address,
        address,
        uint256
    ) external returns (uint256);
    // function transfer(address, uint) external returns (bool);
    // function transferFrom(address, address, uint) external returns (bool);
    // function approve(address, uint) external returns (bool);
}
