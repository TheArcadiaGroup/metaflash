// SPDX-License-Identifier: GPL-3.0-or-later
// Derived from https://docs.aave.com/developers/guides/flash-loans
pragma solidity 0.6.4;
pragma experimental ABIEncoderV2;

import "./interfaces/IERC20.sol";
import "./libraries/SafeMath.sol";
import "erc3156/contracts/interfaces/IERC3156FlashBorrower.sol";
import "./interfaces/IFortubeFlashLender.sol";
import "./interfaces/IFortubeFlashBorrower.sol";
import "./interfaces/IFortubeBank.sol";
import "./interfaces/IFortubeBankController.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract FortubeFlashLender is
    IFortubeFlashLender,
    IFortubeFlashBorrower,
    Ownable
{
    using SafeMath for uint256;

    bytes32 public constant CALLBACK_SUCCESS =
        keccak256("ERC3156FlashBorrower.onFlashLoan");
    IFortubeBank public bank;
    IFortubeBankController public bankcontroller;

    constructor(address _bank, address _bankcontroller) public {
        bank = IFortubeBank(_bank);
        bankcontroller = IFortubeBankController(_bankcontroller);

        require(
            address(bank) != address(0),
            "FortubeFlashLender: bank address is zero address!"
        );

        require(
            address(bankcontroller) != address(0),
            "FortubeFlashLender: bankcontroller address is zero address!"
        );
    }

    function maxFlashLoan(address _token, uint256 _amount)
        external
        view
        override
        returns (uint256)
    {
        return _maxFlashLoan(_token, _amount);
    }

    function maxFlashLoanWithManyPairs_OR_ManyPools(address _token)
        external
        view
        override
        returns (uint256)
    {
        return _maxFlashLoan(_token, 1);
    }

    function _maxFlashLoan(address _token, uint256 _amount)
        internal
        view
        returns (uint256)
    {
        uint256 maxloan = IERC20(_token).balanceOf(address(bankcontroller));
        if (maxloan >= _amount) {
            return maxloan;
        } else {
            return 0;
        }
    }

    function flashFee(address _token, uint256 _amount)
        public
        view
        override
        returns (uint256)
    {
        uint256 maxloan = IERC20(_token).balanceOf(address(bankcontroller));
        if (maxloan >= _amount) {
            return _amount.mul(bankcontroller.flashloanFeeBips()).div(10000);
        } else {
            return 0;
        }
    }

    function flashFeeWithManyPairs_OR_ManyPools(address _token, uint256 _amount)
        public
        view
        override
        returns (uint256)
    {
        uint256 maxloan = IERC20(_token).balanceOf(address(bankcontroller));
        if (maxloan > 0) {
            return _amount.mul(bankcontroller.flashloanFeeBips()).div(10000);
        } else {
            return 0;
        }
    }

    function flashLoan(
        IERC3156FlashBorrower _receiver,
        address _token,
        uint256 _amount,
        bytes calldata _userData
    ) external override returns (bool) {
        _flashLoan(_receiver, _token, _amount, _userData);
        return true;
    }

    function flashLoanWithManyPairs_OR_ManyPools(
        IERC3156FlashBorrower _receiver,
        address _token,
        uint256 _amount,
        bytes calldata _userData
    ) external override returns (bool) {
        _flashLoan(_receiver, _token, _amount, _userData);
        return true;
    }

    function _flashLoan(
        IERC3156FlashBorrower _receiver,
        address _token,
        uint256 _amount,
        bytes memory _userData
    ) internal {
        bytes memory data = abi.encode(address(this), msg.sender, _receiver, _userData);
        bank.flashloan(address(this), _token, _amount, data);
    }

    function executeOperation(
        address _token,
        uint256 _amount,
        uint256 _fee,
        bytes calldata _data
    ) external override {
        require(
            msg.sender == address(bank),
            "FortubeFlashLender: msg.sender must be bank"
        );

        (
            address sender,
            address origin,
            IERC3156FlashBorrower receiver,
            bytes memory userData
        ) = abi.decode(_data, (address, address, IERC3156FlashBorrower, bytes));

        require(
            sender == address(this),
            "FortubeFlashLender:_sender must be this contract"
        );

        // Send the tokens to the original receiver using the ERC-3156 interface
        IERC20(_token).transfer(origin, _amount);
        require(
            receiver.onFlashLoan(origin, _token, _amount, _fee, userData) ==
                CALLBACK_SUCCESS,
            "FortubeFlashLender: Callback failed"
        );

        IERC20(_token).transferFrom(origin, address(this), _amount.add(_fee));

        IERC20(_token).transfer(address(bankcontroller), _amount.add(_fee));
    }
}
