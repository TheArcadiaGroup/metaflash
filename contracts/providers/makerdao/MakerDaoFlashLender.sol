// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity >=0.6.12;

import "erc3156/contracts/interfaces/IERC3156FlashBorrower.sol";
import "./interfaces/IMakerDaoFlashLender.sol";
import "./interfaces/IMakerDaoFlashBorrower.sol";
import "./interfaces/IMakerDaoDssFlash.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";

contract MakerDaoFlashLender is IMakerDaoFlashLender, IERC3156FlashBorrower {
    using SafeMath for uint256;
    IMakerDaoDssFlash dssflash;
    address public operator;
    address public flashloaner;
    bytes32 public constant CALLBACK_SUCCESS =
        keccak256("ERC3156FlashBorrower.onFlashLoan");

    constructor(address _dssflash) public {
        require(
            address(_dssflash) != address(0),
            "MakerDaoFlashLender: _dssflash address is zero address!"
        );
        dssflash = IMakerDaoDssFlash(_dssflash);
        operator = msg.sender;
    }

    modifier onlyOperator() {
        require(msg.sender == operator, "MakerDaoFlashLender: Not operator");
        _;
    }

    modifier onlyFlashLoaner() {
        require(
            msg.sender == flashloaner,
            "MakerDaoFlashLender: Not flashloaner"
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

        uint256 maxloan = dssflash.maxFlashLoan(_token);

        if (maxloan >= _amount) {
            pools[0] = address(0);
            maxloans[0] = maxloan;
            fees[0] = dssflash.flashFee(_token, 1e18);
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
        return dssflash.flashFee(_token, _amount);
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
        bytes calldata _data
    ) internal {
        bytes memory ndata = abi.encode(msg.sender, _receiver, _data);
        dssflash.flashLoan(this, _token, _amount, ndata);
    }

    function onFlashLoan(
        address _sender,
        address _token,
        uint256 _amount,
        uint256 _fee,
        bytes calldata _data
    ) external override returns (bytes32) {
        require(
            msg.sender == address(dssflash),
            "MakerDaoFlashLender: msg.sender must be dssflash"
        );
        require(
            _sender == address(this),
            "MakerDaoFlashLender:_sender must be this contract"
        );

        (
            address origin,
            IERC3156FlashBorrower receiver,
            bytes memory userData
        ) = abi.decode(_data, (address, IERC3156FlashBorrower, bytes));

        // Transfer to `receiver`
        require(
            IERC20(_token).transfer(address(receiver), _amount),
            "MakerDaoFlashLender: Transfer failed"
        );
        require(
            receiver.onFlashLoan(origin, _token, _amount, _fee, userData) ==
                CALLBACK_SUCCESS,
            "MakerDaoFlashLender: Callback failed"
        );
        require(
            IERC20(_token).transferFrom(
                address(receiver),
                address(this),
                _amount.add(_fee)
            ),
            "MakerDaoFlashLender: Transfer failed"
        );

        IERC20(_token).approve(address(dssflash), _amount.add(_fee));

        return CALLBACK_SUCCESS;
    }
}
