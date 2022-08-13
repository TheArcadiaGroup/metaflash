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

contract FortubeFlashLender is IFortubeFlashLender, IFortubeFlashBorrower {
    using SafeMath for uint256;

    bytes32 public constant CALLBACK_SUCCESS =
        keccak256("ERC3156FlashBorrower.onFlashLoan");
    IFortubeBank public bank;
    IFortubeBankController public bankcontroller;
    address public operator;
    address public flashloaner;

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
        operator = msg.sender;
    }

    modifier onlyOperator() {
        require(msg.sender == operator, "FortubeFlashLender: Not operator");
        _;
    }

    modifier onlyFlashLoaner() {
        require(
            msg.sender == flashloaner,
            "FortubeFlashLender: Not flashloaner"
        );
        _;
    }

    function setOperator(address _operator) external onlyOperator {
        operator = _operator;
    }

    function setFlashLoaner(address _flashloaner) external onlyOperator {
        flashloaner = _flashloaner;
    }

    function getFlashLoanInfoListWithCheaperFeePriority(
        address _token,
        uint256 _amount
    )
        external
        view
        override
        onlyFlashLoaner
        returns (
            address[] memory pools,
            uint256[] memory maxloans,
            uint256[] memory fees
        )
    {
        address[] memory pools = new address[](1);
        uint256[] memory maxloans = new uint256[](1);
        uint256[] memory fees = new uint256[](1);

        uint256 maxloan = IERC20(_token).balanceOf(address(bankcontroller));

        if (maxloan >= _amount) {
            pools[0] = address(0);
            maxloans[0] = maxloan;
            fees[0] = _flashFee(_token, 1e18);
            return (pools, maxloans, fees);
        } else {
            pools[0] = address(0);
            maxloans[0] = uint256(0);
            fees[0] = uint256(0);
            return (pools, maxloans, fees);
        }
    }

    function flashFee(
        address _pair,
        address _token,
        uint256 _amount
    ) public view override onlyFlashLoaner returns (uint256) {
        return _flashFee(_token, _amount);
    }

    function _flashFee(address _token, uint256 _amount)
        internal
        view
        returns (uint256)
    {
        return _amount.mul(bankcontroller.flashloanFeeBips()).div(10000);
    }

    function flashLoan(
        address _pair,
        IERC3156FlashBorrower _receiver,
        address _token,
        uint256 _amount,
        bytes calldata _userData
    ) external override onlyFlashLoaner returns (bool) {
        _flashLoan(_receiver, _token, _amount, _userData);
        return true;
    }

    function _flashLoan(
        IERC3156FlashBorrower _receiver,
        address _token,
        uint256 _amount,
        bytes memory _userData
    ) internal {
        bytes memory data = abi.encode(
            address(this),
            msg.sender,
            _receiver,
            _userData
        );
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
