// SPDX-License-Identifier: GPL-3.0-or-later
// Derived from https://github.com/Austin-Williams/uniswap-flash-swapper

pragma solidity ^0.5.16;

import {IERC20CF} from "./interfaces/IERC20CF.sol";
import {SafeMath} from "./libraries/SafeMath.sol";
import "./interfaces/ICreamFinanceFlashLender.sol";
import "./interfaces/ICToken.sol";

contract CreamFinanceFlashLender is
    ICreamFinanceFlashLender,
    IERC3156FlashBorrower
{
    using SafeMath for uint256;

    // CONSTANTS
    bytes32 public constant CALLBACK_SUCCESS =
        keccak256("ERC3156FlashBorrowerInterface.onFlashLoan");

    struct CToken {
        address ctoken;
        address underlying;
    }

    CToken[] public ctokens;
    address public operator;
    address public flashloaner;

    constructor() public {
        operator = msg.sender;
    }

    modifier onlyOperator() {
        require(msg.sender == operator, "CreamFinanceFlashLender: Not operator");
        _;
    }

    modifier onlyFlashLoaner() {
        require(
            msg.sender == flashloaner,
            "CreamFinanceFlashLender: Not flashloaner"
        );
        _;
    }

    function setOperator(address _operator) external onlyOperator {
        require(
            _operator != address(0),
            "CreamFinanceFlashLender: _operator is address(0)"
        );
        operator = _operator;
    }

    function setFlashLoaner(address _flashloaner) external onlyOperator {
        require(
            _flashloaner != address(0),
            "CreamFinanceFlashLender: _flashloaner is address(0)"
        );
        flashloaner = _flashloaner;
    }

    function addCTokens(
        address[] memory _ctokens,
        address[] memory _underlyings
    ) public onlyOperator returns (bool) {
        require(
            (_ctokens.length == _underlyings.length),
            "CreamFinanceFlashLender: mismatch length of _ctoken, _underlying"
        );
        for (uint256 i = 0; i < _ctokens.length; i++) {
            require(
                _ctokens[i] != address(0),
                "CreamFinanceFlashLender: _ctokens address is zero address"
            );
            require(
                _underlyings[i] != address(0),
                "CreamFinanceFlashLender: _underlyings address is zero address"
            );
            bool checkCToken = false;
            for (uint256 j = 0; j < ctokens.length; j++) {
                if (_ctokens[i] == ctokens[j].ctoken) {
                    checkCToken = true;
                }
            }
            if (!checkCToken) {
                ctokens.push(
                    CToken({ctoken: _ctokens[i], underlying: _underlyings[i]})
                );
            }
        }
        return true;
    }

    function removeCTokens(address[] memory _ctokens) public onlyOperator returns (bool) {
        for (uint256 i = 0; i < _ctokens.length; i++) {
            for (uint256 j = 0; j < ctokens.length; j++) {
                if (ctokens[j].ctoken == _ctokens[i]) {
                    ctokens[j].ctoken = ctokens[ctokens.length - 1].ctoken;
                    ctokens[j].underlying = ctokens[ctokens.length - 1]
                        .underlying;
                    ctokens.pop();
                }
            }
        }
        return true;
    }

    function getCTokenLength() public view onlyOperator returns (uint256) {
        return ctokens.length;
    }

    function getFlashLoanInfoListWithCheaperFeePriority(address _token, uint256 _amount)
        external
        view
        onlyFlashLoaner
        returns (address[] memory pools, uint256[] memory maxloans, uint256[] memory fees)
    {
        address[] memory pools = new address[](1);
        uint256[] memory maxloans = new uint256[](1);
        uint256[] memory fees = new uint256[](1);

        address ctoken = _getCtoken(_token);
        uint256 maxloan = ICToken(ctoken).maxFlashLoan(_token);

        if (maxloan >= _amount) {
            pools[0] = address(0);
            maxloans[0] = maxloan;
            fees[0] = ICToken(ctoken).flashFee(_token, 1e18);

            return (pools, maxloans, fees);
        } else {
            pools[0] = address(0);
            maxloans[0] = uint256(0);
            fees[0] = uint256(0);

            return (pools, maxloans, fees);
        }
    }

    function flashFee(address _pair, address _token, uint256 _amount)
        public
        view
        onlyFlashLoaner
        returns (uint256)
    {
        address ctoken = _getCtoken(_token);
        return ICToken(ctoken).flashFee(_token, _amount);
    }

    function _getCtoken(address _token)
        internal
        view
        returns (address)
    {
        address ctoken;
        for (uint256 i = 0; i < ctokens.length; i++) {
            if (ctokens[i].underlying == _token) {
                ctoken = ctokens[i].ctoken;
            }
        }

        return ctoken;
    }

    function flashLoan(
        address _pair,
        IERC3156FlashBorrower _receiver,
        address _token,
        uint256 _amount,
        bytes calldata _data
    ) external onlyFlashLoaner returns (bool) {
        _flashLoan(_receiver, _token, _amount, _data);
        return true;
    }

    function _flashLoan(
        IERC3156FlashBorrower _receiver,
        address _token,
        uint256 _amount,
        bytes memory _data
    ) internal {
        address ctoken = _getCtoken(_token);
        bytes memory data = abi.encode(ctoken, msg.sender, _receiver, _data);

        ICToken(ctoken).flashLoan(this, _token, _amount, data);
    }

    function onFlashLoan(
        address _sender,
        address _token,
        uint256 _amount,
        uint256 _fee,
        bytes calldata _data
    ) external returns (bytes32) {
        require(
            _sender == address(this),
            "CreamFinanceFlashLender: _sender must be this contract"
        );

        (
            address ctoken,
            address origin,
            IERC3156FlashBorrower receiver,
            bytes memory userData
        ) = abi.decode(_data, (address, address, IERC3156FlashBorrower, bytes));

        require(
            msg.sender == ctoken,
            "CreamFinanceFlashLender: msg.sender must be the permissioned ctoken"
        );

        // Transfer to `receiver`
        require(
            IERC20CF(_token).transfer(address(receiver), _amount),
            "CreamFinanceFlashLender: Transfer failed"
        );
        require(
            receiver.onFlashLoan(origin, _token, _amount, _fee, userData) ==
                CALLBACK_SUCCESS,
            "CreamFinanceFlashLender: Callback failed"
        );

        IERC20CF(_token).transferFrom(
            address(receiver),
            address(this),
            _amount.add(_fee)
        );

        IERC20CF(_token).approve(msg.sender, _amount.add(_fee));

        return CALLBACK_SUCCESS;
    }
}
