// SPDX-License-Identifier: GPL-3.0-or-later
// Derived from https://docs.aave.com/developers/guides/flash-loans
pragma solidity ^0.7.5;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "erc3156/contracts/interfaces/IERC3156FlashBorrower.sol";
import "erc3156/contracts/interfaces/IERC3156FlashLender.sol";
import "./interfaces/AaveFlashBorrowerLike.sol";
import "./interfaces/LendingPoolLike.sol";
import "./interfaces/LendingPoolAddressesProviderLike.sol";
import "./libraries/AaveDataTypes.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract AaveV2ERC3156 is IERC3156FlashLender, AaveFlashBorrowerLike, Ownable {
    using SafeMath for uint256;

    bytes32 public constant CALLBACK_SUCCESS =
        keccak256("ERC3156FlashBorrower.onFlashLoan");
    LendingPoolLike public lendingPool;
    address public FEETO;

    constructor(LendingPoolAddressesProviderLike _provider, address _feeTo) {
        lendingPool = LendingPoolLike(_provider.getLendingPool());
        require(
            address(lendingPool) != address(0),
            "AavV2ERC3156: lendingPool address is zero address!"
        );
        require(
            address(_feeTo) != address(0),
            "AaveV2ERC3156: feeTo address is zero address!"
        );
        FEETO = _feeTo;
    }

    function setFeeTo(address _feeTo) public onlyOwner {
        require(
            address(_feeTo) != address(0),
            "AaveV2ERC3156: feeTo address is zero address!"
        );
        FEETO = _feeTo;
    }

    function maxFlashLoan(address _token)
        external
        view
        override
        returns (uint256)
    {
        AaveDataTypes.ReserveData memory reserveData = lendingPool
            .getReserveData(_token);
        return
            reserveData.aTokenAddress != address(0)
                ? IERC20(_token).balanceOf(reserveData.aTokenAddress)
                : 0;
    }

    function flashFee(address _token, uint256 _amount)
        public
        view
        override
        returns (uint256)
    {
        uint256 aaveFee = _aaveFee(_token, _amount);
        uint256 additionalFee = _additionalFee(_amount);
        uint256 totalFee = aaveFee.add(additionalFee);
        return totalFee;
    }

    function _aaveFee(address _token, uint256 _amount)
        internal
        view
        returns (uint256)
    {
        AaveDataTypes.ReserveData memory reserveData = lendingPool
            .getReserveData(_token);
        require(
            reserveData.aTokenAddress != address(0),
            "AaveV2ERC3156: Unsupported currency"
        );
        return _amount.mul(lendingPool.FLASHLOAN_PREMIUM_TOTAL()).div(10000);
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
        address[] memory tokens = new address[](1);
        tokens[0] = address(_token);

        uint256[] memory amounts = new uint256[](1);
        amounts[0] = _amount;

        // 0 = no debt, 1 = stable, 2 = variable
        uint256[] memory modes = new uint256[](1);
        modes[0] = 0;

        address onBehalfOf = address(this);
        bytes memory data = abi.encode(msg.sender, _receiver, _userData);
        uint16 referralCode = 0;

        lendingPool.flashLoan(
            address(this),
            tokens,
            amounts,
            modes,
            onBehalfOf,
            data,
            referralCode
        );
        return true;
    }

    function executeOperation(
        address[] calldata _tokens,
        uint256[] calldata _amounts,
        uint256[] calldata _fees,
        address _sender,
        bytes calldata _data
    ) external override returns (bool) {
        require(
            msg.sender == address(lendingPool),
            "AaveV2ERC3156: Callbacks only allowed from Lending Pool"
        );
        require(
            _sender == address(this),
            "AaveV2ERC3156: Callbacks only initiated from this contract"
        );

        (
            address origin,
            IERC3156FlashBorrower receiver,
            bytes memory userData
        ) = abi.decode(_data, (address, IERC3156FlashBorrower, bytes));

        address token = _tokens[0];
        uint256 amount = _amounts[0];
        uint256 fee = _fees[0];

        uint256 totalFee = flashFee(token, amount);

        // Send the tokens to the original receiver using the ERC-3156 interface
        IERC20(token).transfer(origin, amount);
        require(
            receiver.onFlashLoan(origin, token, amount, totalFee, userData) ==
                CALLBACK_SUCCESS,
            "AaveV2ERC3156:Callback failed"
        );
        IERC20(token).transferFrom(origin, address(this), amount.add(totalFee));

        uint256 addtionalFee = _additionalFee(amount);
        IERC20(token).transfer(FEETO, addtionalFee);

        // Approve the LendingPool contract allowance to *pull* the owed amount
        IERC20(token).approve(address(lendingPool), amount.add(fee));

        return true;
    }
}
