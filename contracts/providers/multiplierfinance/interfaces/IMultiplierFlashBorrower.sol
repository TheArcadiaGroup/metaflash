pragma solidity ^0.8.0;

interface IMultiplierFlashBorrower {
    function executeOperation(
        address _reserve,
        uint256 _amount,
        uint256 _fee,
        bytes calldata _params
    ) external;
}