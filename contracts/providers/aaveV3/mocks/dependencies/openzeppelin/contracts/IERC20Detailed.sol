// SPDX-License-Identifier: agpl-3.0
pragma solidity 0.8.10;

import {IERC20Mock} from './IERC20Mock.sol';

interface IERC20Detailed is IERC20Mock {
  function name() external view returns (string memory);

  function symbol() external view returns (string memory);

  function decimals() external view returns (uint8);
}
