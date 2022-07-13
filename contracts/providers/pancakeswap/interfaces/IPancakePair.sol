// SPDX-License-Identifier: GPL-3.0
pragma solidity >=0.5.0;

interface IPancakePair {
    function initialize(address, address) external;
    function token0() external view returns (address);

    function token1() external view returns (address);

    function swap(
        uint256 amount0Out,
        uint256 amount1Out,
        address to,
        bytes calldata data
    ) external;
}
