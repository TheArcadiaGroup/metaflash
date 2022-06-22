// SPDX-License-Identifier: GPL-3.0-or-later
// Derived from https://docs.aave.com/developers/guides/flash-loans
pragma solidity 0.8.10;
pragma experimental ABIEncoderV2;

import {IERC20} from './dependencies/openzeppelin/contracts/IERC20.sol';
import {SafeMath} from './dependencies/openzeppelin/contracts/SafeMath.sol';
import {Ownable} from './dependencies/openzeppelin/contracts/Ownable.sol';
import "erc3156/contracts/interfaces/IERC3156FlashBorrower.sol";
import "erc3156/contracts/interfaces/IERC3156FlashLender.sol";
import "./interfaces/IFlashLoanSimpleReceiver.sol";
import "./interfaces/IPool.sol";
import "./interfaces/IPoolAddressesProvider.sol";
import "./libraries/types/DataTypes.sol";
import "hardhat/console.sol";

/**
 * @author Alberto Cuesta Cañada
 * @dev ERC-3156 wrapper for Aave flash loans.
 */
contract AaveV3ERC3156 is IERC3156FlashLender, IFlashLoanSimpleReceiver, Ownable {
    using SafeMath for uint256;

    bytes32 public constant CALLBACK_SUCCESS = keccak256("ERC3156FlashBorrower.onFlashLoan");
    IPool public pool;
    address public FEETO;

    constructor(address _pool, address _feeTo) {
        pool = IPool(_pool);
        FEETO = _feeTo;
    }

    function setFeeTo(address feeTo) public onlyOwner {
        FEETO = feeTo;
    }

    /**
     * @dev From ERC-3156. The amount of currency available to be lended.
     * @param token The loan currency.
     * @return The amount of `token` that can be borrowed.
     */
    function maxFlashLoan(address token) external view override returns (uint256) {
        DataTypes.ReserveData memory reserveData = pool.getReserveData(token);
        return reserveData.aTokenAddress != address(0) ? IERC20(token).balanceOf(reserveData.aTokenAddress) : 0;
    }

    function flashFee(address token, uint256 amount)
        public
        view
        override
        returns (uint256)
    {
        uint256 aaveFee = _aaveFee(token, amount);
        uint256 additionalFee = _additionalFee(amount);
        uint256 totalFee = aaveFee.add(additionalFee);
        return totalFee;
    }

    function _aaveFee(address token, uint256 amount)
        internal
        view
        returns (uint256)
    {
        DataTypes.ReserveData memory reserveData = pool.getReserveData(token);
        require(reserveData.aTokenAddress != address(0), "Unsupported currency");
        return amount.mul(pool.FLASHLOAN_PREMIUM_TOTAL()).div(10000);
    }

    function _additionalFee(uint256 amount) internal view returns (uint256) {
        return amount.mul(5).div(1000);
    }

    /**
     * @dev From ERC-3156. Loan `amount` tokens to `receiver`, which needs to return them plus fee to this contract within the same transaction.
     * @param receiver The contract receiving the tokens, needs to implement the `onFlashLoan(address user, uint256 amount, uint256 fee, bytes calldata)` interface.
     * @param token The loan currency.
     * @param amount The amount of tokens lent.
     * @param userData A data parameter to be passed on to the `receiver` for any custom use.
     */
    function flashLoan(IERC3156FlashBorrower receiver, address token, uint256 amount, bytes calldata userData) external override returns(bool) {
        address[] memory tokens = new address[](1);
        tokens[0] = address(token);

        uint256[] memory amounts = new uint256[](1);
        amounts[0] = amount;

        // 0 = no debt, 1 = stable, 2 = variable
        uint256[] memory modes = new uint256[](1);
        modes[0] = 0;

        address onBehalfOf = address(this);
        bytes memory data = abi.encode(msg.sender, receiver, userData);
        uint16 referralCode = 0;

        // pool.flashLoan(
        //     address(this),
        //     tokens,
        //     amounts,
        //     modes,
        //     onBehalfOf,
        //     data,
        //     referralCode
        // );
        // console.log("balance %s", IERC20(token).balanceOf(address(this)));
        pool.flashLoanSimple(
            address(this),
            token,
            amount,
            data,
            referralCode
        );

        return true;
    }


  function executeOperation(
    address token,
    uint256 amount,
    uint256 premium,
    address initiator,
    bytes calldata data
  ) external returns (bool) {
        require(msg.sender == address(pool), "Callbacks only allowed from Lending Pool");
        require(initiator == address(this), "Callbacks only initiated from this contract");

        (address origin, IERC3156FlashBorrower receiver, bytes memory userData) = 
            abi.decode(data, (address, IERC3156FlashBorrower, bytes));

        // address token = tokens[0];
        // uint256 amount = amounts[0];

        uint256 totalFee = flashFee(token, amount);

        // console.log("balance executeOperation %s", IERC20(token).balanceOf(address(this)));
        // console.log("amount %s", amount);
        // Send the tokens to the original receiver using the ERC-3156 interface
        IERC20(token).transfer(origin, amount);
        require(
            receiver.onFlashLoan(origin, token, amount, totalFee, userData) == CALLBACK_SUCCESS,
            "Callback failed"
        );
        IERC20(token).transferFrom(origin, address(this), amount.add(totalFee));

        // uint256 addtionalFee = _additionalFee(amount);
        IERC20(token).transfer(FEETO, _additionalFee(amount));

        // uint256 aaveFee = _aaveFee(token, amount);

        // Approve the LendingPool contract allowance to *pull* the owed amount
        IERC20(token).approve(address(pool), amount.add(_aaveFee(token, amount)));

        return true;
  }


    // /// @dev Aave flash loan callback. It sends the amount borrowed to `receiver`, and takes it back plus a `flashFee` after the ERC3156 callback.
    // function executeOperation(
    //     address[] calldata tokens,
    //     uint256[] calldata amounts,
    //     uint256[] calldata fees,
    //     address sender,
    //     bytes calldata data
    // )
    //     external override returns (bool)
    // {
    //     require(msg.sender == address(pool), "Callbacks only allowed from Lending Pool");
    //     require(sender == address(this), "Callbacks only initiated from this contract");

    //     (address origin, IERC3156FlashBorrower receiver, bytes memory userData) = 
    //         abi.decode(data, (address, IERC3156FlashBorrower, bytes));

    //     address token = tokens[0];
    //     uint256 amount = amounts[0];

    //     uint256 totalFee = flashFee(token, amount);

    //     // Send the tokens to the original receiver using the ERC-3156 interface
    //     IERC20(token).transfer(origin, amount);
    //     require(
    //         receiver.onFlashLoan(origin, token, amount, totalFee, userData) == CALLBACK_SUCCESS,
    //         "Callback failed"
    //     );
    //     IERC20(token).transferFrom(origin, address(this), amount.add(totalFee));

    //     uint256 addtionalFee = _additionalFee(amount);
    //     IERC20(token).transfer(FEETO, addtionalFee);

    //     uint256 aaveFee = _aaveFee(token, amount);

    //     // Approve the LendingPool contract allowance to *pull* the owed amount
    //     IERC20(token).approve(address(pool), amount.add(aaveFee));

    //     return true;
    // }
}