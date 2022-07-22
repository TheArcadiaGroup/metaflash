// SPDX-License-Identifier: GPL-3.0-or-later
// Derived from https://github.com/Austin-Williams/uniswap-flash-swapper

pragma solidity ^0.5.16;

import {IERC20} from "./interfaces/IERC20.sol";
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

    address public factory;
    address permissionedCTokenAddress;

    struct CToken {
        address ctoken;
        address underlying;
    }

    struct PairInfo {
        address ctoken;
        uint256 maxloan;
    }

    CToken[] public ctokens;

    constructor(address _factory) public {
        require(
            address(_factory) != address(0),
            "CreamFinanceFlashLender: factory address is zero address!"
        );
        factory = _factory;
    }

    function() external payable {}

    function setFactory(address _factory) external {
        require(msg.sender == factory, "CreamFinanceFlashLender: Not factory");
        factory = _factory;
    }

    function addCTokens(
        address[] memory _ctokens,
        address[] memory _underlyings
    ) public returns (bool) {
        require(msg.sender == factory, "CreamFinanceFlashLender: Not factory");
        require(
            (_ctokens.length == _underlyings.length),
            "CreamFinanceFlashLender: mismatch length of _ctoken, _underlying"
        );
        for (uint256 i = 0; i < _ctokens.length; i++) {
            require(
                _ctokens[i] != address(0),
                "CreamFinanceFlashLender: _ctoken address is zero address"
            );
            require(
                _underlyings[i] != address(0),
                "CreamFinanceFlashLender: _underlying address is zero address"
            );
            ctokens.push(
                CToken({ctoken: _ctokens[i], underlying: _underlyings[i]})
            );
        }
        return true;
    }

    function removeCTokens(address[] memory _ctokens) public returns (bool) {
        require(msg.sender == factory, "CreamFinanceERC3156: Not factory");
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

    function maxFlashLoan(address _token, uint256 _amount)
        external
        view
        returns (uint256)
    {
        return _maxFlashLoan(_token, _amount);
    }

    function maxFlashLoanWithManyPairs_OR_ManyPools(address _token)
        external
        view
        returns (uint256)
    {
        return _maxFlashLoan(_token, 1);
    }

    function _maxFlashLoan(address _token, uint256 _amount)
        internal
        view
        returns (uint256)
    {
        address ctoken;
        for (uint256 i = 0; i < ctokens.length; i++) {
            if (ctokens[i].underlying == _token) {
                ctoken = ctokens[i].ctoken;
            }
        }

        uint256 maxloan = ICToken(ctoken).maxFlashLoan(_token);

        if (maxloan >= _amount) {
            return maxloan;
        } else {
            return 0;
        }
    }

    function flashFee(address _token, uint256 _amount)
        public
        view
        returns (uint256)
    {
        address ctoken;
        for (uint256 i = 0; i < ctokens.length; i++) {
            if (ctokens[i].underlying == _token) {
                ctoken = ctokens[i].ctoken;
            }
        }
        uint256 maxloan = ICToken(ctoken).maxFlashLoan(_token);
        if (maxloan >= _amount) {
            return ICToken(ctoken).flashFee(_token, _amount);
        } else {
            return 0;
        }
    }

    function flashFeeWithManyPairs_OR_ManyPools(address _token, uint256 _amount)
        public
        view
        returns (uint256)
    {
        address ctoken;
        for (uint256 i = 0; i < ctokens.length; i++) {
            if (ctokens[i].underlying == _token) {
                ctoken = ctokens[i].ctoken;
            }
        }
        uint256 maxloan = ICToken(ctoken).maxFlashLoan(_token);
        if (maxloan > 0) {
            return ICToken(ctoken).flashFee(_token, _amount);
        } else {
            return 0;
        }
    }

    function flashLoan(
        IERC3156FlashBorrower _receiver,
        address _token,
        uint256 _amount,
        bytes calldata _userData
    ) external returns (bool) {
        _flashLoan(_receiver, _token, _amount, _userData);
        return true;
    }

    function flashLoanWithManyPairs_OR_ManyPools(
        IERC3156FlashBorrower _receiver,
        address _token,
        uint256 _amount,
        bytes calldata _userData
    ) external returns (bool) {
        _flashLoan(_receiver, _token, _amount, _userData);
        return true;
    }

    function _flashLoan(
        IERC3156FlashBorrower _receiver,
        address _token,
        uint256 _amount,
        bytes memory _data
    ) internal {
        address ctoken;
        for (uint256 i = 0; i < ctokens.length; i++) {
            if (ctokens[i].underlying == _token) {
                ctoken = ctokens[i].ctoken;
            }
        }

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
            "CreamFinanceFlashLender: FlashLoan only from this contract"
        );

        (
            address ctoken,
            address origin,
            IERC3156FlashBorrower receiver,
            bytes memory userData
        ) = abi.decode(_data, (address, address, IERC3156FlashBorrower, bytes));

        require(
            msg.sender == ctoken,
            "CreamFinanceFlashLender: Callback only from permissioned ctoken"
        );

        // Transfer to `receiver`
        require(
            IERC20(_token).transfer(address(receiver), _amount),
            "CreamFinanceFlashLender: Transfer failed"
        );
        require(
            receiver.onFlashLoan(origin, _token, _amount, _fee, userData) ==
                CALLBACK_SUCCESS,
            "CreamFinanceFlashLender: Callback failed"
        );

        IERC20(_token).transferFrom(
            address(receiver),
            address(this),
            _amount.add(_fee)
        );

        IERC20(_token).approve(msg.sender, _amount.add(_fee));

        return CALLBACK_SUCCESS;
    }
}
