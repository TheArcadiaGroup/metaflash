// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;
pragma experimental ABIEncoderV2;

import "../libraries/DYDXDataTypes.sol";

interface SoloMarginLike {
    function operate(
        DYDXDataTypes.AccountInfo[] memory accounts,
        DYDXDataTypes.ActionArgs[] memory actions
    ) external;

    function getMarketTokenAddress(uint256 marketId) external view returns (address);
}
