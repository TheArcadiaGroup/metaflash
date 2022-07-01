// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.0;
pragma experimental ABIEncoderV2;

// import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
// import "@openzeppelin/contracts/math/SafeMath.sol";
import "erc3156/contracts/interfaces/IERC3156FlashBorrower.sol";
import "erc3156/contracts/interfaces/IERC3156FlashLender.sol";
// import "./interfaces/AaveFlashBorrowerLike.sol";
import "./interfaces/IFLoan.sol";
// import "./interfaces/LendingPoolAddressesProviderLike.sol";
// import "./libraries/AaveDataTypes.sol";
// import "@openzeppelin/contracts/access/Ownable.sol";

import {IERC20} from "./interfaces/IERC20.sol";
import {SafeMath} from "./libraries/SafeMath.sol";
import {Ownable} from "./libraries/Ownable.sol";

contract EulerERC3156 is IERC3156FlashLender, IERC3156FlashBorrower, Ownable {
    using SafeMath for uint256;

    bytes32 public constant CALLBACK_SUCCESS =
        keccak256("ERC3156FlashBorrower.onFlashLoan");
    IFLoan public flashloan;
    address public FEETO;

    constructor(address _flashloan, address _feeTo) {
        require(
            address(_flashloan) != address(0),
            "EulerERC3156: lendingPool address is zero address!"
        );
        require(
            address(_feeTo) != address(0),
            "EulerERC3156: feeTo address is zero address!"
        );
        flashloan = IFLoan(_flashloan);
        FEETO = _feeTo;
    }

    function setFeeTo(address _feeTo) public onlyOwner {
        require(
            address(_feeTo) != address(0),
            "EulerERC3156: feeTo address is zero address!"
        );
        FEETO = _feeTo;
    }

    function maxFlashLoan(address _token)
        external
        view
        override
        returns (uint256)
    {
        return flashloan.maxFlashLoan(_token);
    }

    function flashFee(address _token, uint256 _amount)
        public
        view
        override
        returns (uint256)
    {
        uint256 eulerFee = _eulerFee(_token, _amount);
        uint256 additionalFee = _additionalFee(_amount);
        uint256 totalFee = eulerFee.add(additionalFee);
        return totalFee;
    }

    function _eulerFee(address _token, uint256 _amount)
        internal
        view
        returns (uint256)
    {
        return flashloan.flashFee(_token, _amount);
    }

    function _additionalFee(uint256 _amount) internal view returns (uint256) {
        return _amount.mul(5).div(1000);
    }

    function flashLoan(
        IERC3156FlashBorrower _receiver,
        address _token,
        uint256 _amount,
        bytes calldata _userData
    ) external override returns (bool) {
        bytes memory data = abi.encode(msg.sender, _receiver, _userData);
        flashloan.flashLoan(this, _token, _amount, data);
        return true;
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

        uint256 totalFee = flashFee(_token, _amount);

        // Send the tokens to the original receiver using the ERC-3156 interface
        IERC20(_token).transfer(origin, _amount);
        require(
            receiver.onFlashLoan(origin, _token, _amount, totalFee, userData) ==
                CALLBACK_SUCCESS,
            "EulerERC3156:Callback failed"
        );
        IERC20(_token).transferFrom(
            origin,
            address(this),
            _amount.add(totalFee)
        );

        uint256 addtionalFee = _additionalFee(_amount);
        IERC20(_token).transfer(FEETO, addtionalFee);

        // Approve the LendingPool contract allowance to *pull* the owed amount
        IERC20(_token).approve(address(flashloan), _amount.add(_fee));

        return CALLBACK_SUCCESS;
    }
}
