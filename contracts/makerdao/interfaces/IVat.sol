// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity >=0.6.12;

interface IVat {
    function move(address src, address dst, uint256 rad) external;
}