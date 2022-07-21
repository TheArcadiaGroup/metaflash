// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.0;
pragma experimental ABIEncoderV2;


import "erc3156/contracts/interfaces/IERC3156FlashBorrower.sol";
import "./interfaces/IEulerFlashLender.sol";
import "./interfaces/IFLoan.sol";
import {IERC20} from "./interfaces/IERC20.sol";
import {SafeMath} from "./libraries/SafeMath.sol";
import {Ownable} from "./libraries/Ownable.sol";

contract EulerFlashLender is IEulerFlashLender, IERC3156FlashBorrower, Ownable {
    using SafeMath for uint256;

    bytes32 public constant CALLBACK_SUCCESS =
        keccak256("ERC3156FlashBorrower.onFlashLoan");
    IFLoan public flashloan;

    constructor(address _flashloan) {
        require(
            address(_flashloan) != address(0),
            "EulerERC3156: lendingPool address is zero address!"
        );
        flashloan = IFLoan(_flashloan);
    }

    receive() external payable {}

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
        uint256 maxloan = flashloan.maxFlashLoan(_token);
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
        uint256 maxloan = flashloan.maxFlashLoan(_token);
        if (maxloan >= _amount) {
            return flashloan.flashFee(_token, _amount);
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
        uint256 maxloan = flashloan.maxFlashLoan(_token);
        if (maxloan > 0) {
            return flashloan.flashFee(_token, _amount);
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
        bytes calldata _data
    ) internal {
        bytes memory data = abi.encode(msg.sender, _receiver, _data);
        flashloan.flashLoan(this, _token, _amount, data);
    }

    function onFlashLoan(
        address _sender,
        address _token,
        uint256 _amount,
        uint256 _fee,
        bytes calldata _data
    ) external override returns (bytes32) {
        require(
            msg.sender == address(flashloan),
            "EulerERC3156: Callbacks only allowed from Lending Pool"
        );

        require(
            _sender == address(this),
            "EulerERC3156: Callbacks only initiated from this contract"
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
            "EulerERC3156:Callback failed"
        );
 
        IERC20(_token).transferFrom(
            origin,
            address(this),
            _amount.add(_fee)
        );

        // Approve the LendingPool contract allowance to *pull* the owed amount
        IERC20(_token).approve(address(flashloan), _amount.add(_fee));

        return CALLBACK_SUCCESS;
    }
}
