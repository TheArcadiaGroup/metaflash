// SPDX-License-Identifier: GPL-3.0-or-later
// Derived from https://docs.aave.com/developers/guides/flash-loans
pragma solidity 0.6.4;
pragma experimental ABIEncoderV2;

import "./interfaces/IERC20.sol";
import "./libraries/SafeMath.sol";
import "erc3156/contracts/interfaces/IERC3156FlashBorrower.sol";
import "erc3156/contracts/interfaces/IERC3156FlashLender.sol";
import "./interfaces/IFlashLoanReceiver.sol";
import "./interfaces/IBank.sol";
import "./interfaces/IBankController.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract FortubeERC3156 is IERC3156FlashLender, IFlashLoanReceiver, Ownable {
    using SafeMath for uint256;

    bytes32 public constant CALLBACK_SUCCESS =
        keccak256("ERC3156FlashBorrower.onFlashLoan");
    IBank public bank;
    IBankController public bankcontroller;

    constructor(address _bank, address _bankcontroller) public {
        bank = IBank(_bank);
        bankcontroller = IBankController(_bankcontroller);
        require(
            address(bank) != address(0),
            "FortubeERC3156: bank address is zero address!"
        );
        require(
            address(bankcontroller) != address(0),
            "FortubeERC3156: bankcontroller address is zero address!"
        );
    }

    function maxFlashLoan(address _token)
        external
        view
        override
        returns (uint256)
    {
        return IERC20(_token).balanceOf(address(bankcontroller));
    }

    function flashFee(address _token, uint256 _amount)
        public
        view
        override
        returns (uint256)
    {
        return _amount.mul(bankcontroller.flashloanFeeBips()).div(10000);
    }

    function flashLoan(
        IERC3156FlashBorrower _receiver,
        address _token,
        uint256 _amount,
        bytes calldata _userData
    ) external override returns (bool) {
        bytes memory data = abi.encode(msg.sender, _receiver, _userData);
        bank.flashloan(
            address(this),
            _token,
            _amount,
            data
        );
        return true;
    }

    function executeOperation(
        address _token,
        uint256 _amount,
        uint256 _fee,
        bytes calldata _data
    ) external override {
        require(
            msg.sender == address(bank),
            "FortubeERC3156: Callbacks only allowed from Lending Pool"
        );

        (
            address origin,
            IERC3156FlashBorrower receiver,
            bytes memory userData
        ) = abi.decode(_data, (address, IERC3156FlashBorrower, bytes));

        // Send the tokens to the original receiver using the ERC-3156 interface
        IERC20(_token).transfer(origin, _amount);
        require(
            receiver.onFlashLoan(origin, _token, _amount, _fee, userData) ==
                CALLBACK_SUCCESS,
            "FortubeERC3156: Callback failed"
        );

        IERC20(_token).transferFrom(origin, address(this), _amount.add(_fee));

        // Approve the LendingPool contract allowance to *pull* the owed amount
        // IERC20(_token).approve(address(bankcontroller), _amount.add(_fee));
         IERC20(_token).transfer(address(bankcontroller), _amount.add(_fee));

        // return true;
    }
}
