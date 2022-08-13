// SPDX-License-Identifier: AGPL-3.0-or-later

pragma solidity >=0.6.12;

import "./interfaces/IBentoBox.sol";
import "./interfaces/ISushiSwapFlashLender.sol";
import "./interfaces/IFlashLoan.sol";
import "@boringcrypto/boring-solidity/contracts/libraries/BoringERC20.sol";
import "@boringcrypto/boring-solidity/contracts/libraries/BoringMath.sol";
import "@boringcrypto/boring-solidity/contracts/BoringOwnable.sol";

contract SushiSwapFlashLender is
    ISushiSwapFlashLender,
    IFlashBorrower,
    BoringOwnable
{
    using BoringERC20 for IERC20;
    using BoringMath for uint256;

    IBentoBox bentobox;
    bytes32 public constant CALLBACK_SUCCESS =
        keccak256("ERC3156FlashBorrower.onFlashLoan");

    // --- Init ---
    constructor(address _bentobox) public {
        require(
            address(_bentobox) != address(0),
            "SushiSwapFlashLender: bentobox address is zero address!"
        );
        bentobox = IBentoBox(_bentobox);
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
        uint256 maxloan = IERC20(_token).balanceOf(address(bentobox));
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
        uint256 maxloan = IERC20(_token).balanceOf(address(bentobox));
        if (maxloan >= _amount) {
            return _amount.mul(50) / 100000;
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
        uint256 maxloan = IERC20(_token).balanceOf(address(bentobox));
        if (maxloan > 0) {
            return _amount.mul(50) / 100000;
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
        bytes memory data = abi.encode(msg.sender, _receiver, _userData);
        bentobox.flashLoan(
            IFlashBorrower(this),
            address(this),
            IERC20(_token),
            _amount,
            data
        );
    }

    function onFlashLoan(
        address _sender,
        IERC20 _token,
        uint256 _amount,
        uint256 _fee,
        bytes calldata _data
    ) external override {
        require(
            msg.sender == address(bentobox),
            "SushiSwapFlashLender: msg.sender must be bentobox"
        );
        require(
            _sender == address(this),
            "SushiSwapFlashLender: _sender must be this contract"
        );

        (
            address origin,
            IERC3156FlashBorrower receiver,
            bytes memory userData
        ) = abi.decode(_data, (address, IERC3156FlashBorrower, bytes));

        _token.safeTransfer(address(receiver), _amount);

        require(
            receiver.onFlashLoan(
                origin,
                address(_token),
                _amount,
                _fee,
                userData
            ) == CALLBACK_SUCCESS,
            "SushiSwapERC3156: Callback failed"
        );

        _token.safeTransferFrom(
            address(receiver),
            address(this),
            _amount.add(_fee)
        );

        _token.safeTransfer(address(bentobox), _amount.add(_fee));
    }
}
