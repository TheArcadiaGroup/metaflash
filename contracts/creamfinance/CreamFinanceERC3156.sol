// SPDX-License-Identifier: GPL-3.0-or-later
// Derived from https://github.com/Austin-Williams/uniswap-flash-swapper

pragma solidity ^0.5.16;

import {IERC20} from "./interfaces/IERC20.sol";
import {SafeMath} from "./libraries/SafeMath.sol";
import "./interfaces/IERC3156FlashLender.sol";
import "./interfaces/IERC3156FlashBorrower.sol";
import "./interfaces/ICToken.sol";

contract CreamFinanceERC3156 is
    IERC3156FlashLender,
    IERC3156FlashBorrower
{
    using SafeMath for uint256;

    // CONSTANTS
    bytes32 public constant CALLBACK_SUCCESS =
        keccak256("ERC3156FlashBorrower.onFlashLoan");

    address permissionedPairAddress;
    address public FEETO;
    address public factory;
    address permissionedCTokenAddress;

    struct CToken {
        address ctoken;
        address underlying;
    }

    CToken[] public ctokens;

    constructor(address _factory, address _feeTo) public {
        require(
            address(_factory) != address(0),
            "CreamFinanceERC3156: factory address is zero address!"
        );
        require(
            address(_feeTo) != address(0),
            "CreamFinanceERC3156: feeTo address is zero address!"
        );
        factory = _factory;
        FEETO = _feeTo;
    }

    function setFeeTo(address _feeTo) public {
        require(msg.sender == factory, 'CreamFinanceERC3156: Not factory');
        require(
            address(_feeTo) != address(0),
            "CreamFinanceERC3156: feeTo address is zero address!"
        );
        FEETO = _feeTo;
    }

    function setFactory(address _factory) external {
        require(msg.sender == factory, 'CreamFinanceERC3156: Not factory');
        factory = _factory;
    }

    function addCTokens(
        address[] memory _ctokens,
        address[] memory _underlyings
    ) public returns (bool) {
        require(msg.sender == factory, 'CreamFinanceERC3156: Not factory');
        require(
            (_ctokens.length == _underlyings.length),
            "CreamFinanceERC3156: mismatch length of _ctoken, _underlying"
        );
        for (uint256 i = 0; i < _ctokens.length; i++) {
            require(
                _ctokens[i] != address(0),
                "CreamFinanceERC3156: _ctoken address is zero address"
            );
            require(
                _underlyings[i] != address(0),
                "CreamFinanceERC3156: _underlying address is zero address"
            );
            ctokens.push(
                CToken({ctoken: _ctokens[i], underlying: _underlyings[i]})
            );
        }
        return true;
    }

    function removeCTokens(address[] memory _ctokens)
        public
        returns (bool)
    {
        require(msg.sender == factory, 'CreamFinanceERC3156: Not factory');
        for (uint256 i = 0; i < _ctokens.length; i++) {
            for (uint256 j = 0; j < ctokens.length; j++) {
                if (ctokens[j].ctoken == _ctokens[i]) {
                    ctokens[j].ctoken = ctokens[ctokens.length - 1].ctoken;
                    ctokens[j].underlying = ctokens[ctokens.length - 1].underlying;
                    ctokens.pop();
                }
            }
        }
        return true;
    }

    function maxFlashLoan(address _token)
        external
        view
        returns (uint256)
    {
        address ctoken;
        for (uint256 i = 0; i < ctokens.length; i++) {
            if(ctokens[i].underlying == _token){
                ctoken = ctokens[i].ctoken;
            }
        }
        require(
            ctoken != address(0),
            "CreamFinanceERC3156: Unsupported currency"
        );
        return ICToken(ctoken).maxFlashLoan(_token);
    }

    function flashFee(address _token, uint256 _amount)
        public
        view
        returns (uint256)
    {
        uint256 creamFinanceFee = _creamFinanceFee(_token, _amount);
        uint256 additionalFee = _additionalFee(_amount);
        uint256 totalFee = creamFinanceFee.add(additionalFee);
        return totalFee;
    }

    function _creamFinanceFee(address _token, uint256 _amount)
        internal
        view
        returns (uint256)
    {
        address ctoken;
        for (uint256 i = 0; i < ctokens.length; i++) {
            if(ctokens[i].underlying == _token){
                ctoken = ctokens[i].ctoken;
            }
        }
        require(
            ctoken != address(0),
            "CreamFinanceERC3156: Unsupported currency"
        );
        return ICToken(ctoken).flashFee(_token, _amount);
    }

    function _additionalFee(uint256 _amount) internal view returns (uint256) {
        return _amount.mul(5)/(1000);
    }

    function flashLoan(
        IERC3156FlashBorrower _receiver,
        address _token,
        uint256 _amount,
        bytes calldata _userData
    ) external returns (bool) {
        address ctoken;
        for (uint256 i = 0; i < ctokens.length; i++) {
            if(ctokens[i].underlying == _token){
                ctoken = ctokens[i].ctoken;
            }
        }
        require(
            ctoken != address(0),
            "CreamFinanceERC3156: Unsupported currency"
        );

        if (permissionedCTokenAddress != ctoken)
            permissionedCTokenAddress = ctoken;

        bytes memory data = abi.encode(msg.sender, _receiver, _userData);

        return ICToken(ctoken).flashLoan(_receiver, _token, _amount, data);

        return true;
    }

    function onFlashLoan(
        address _sender,
        address _token,
        uint256 _amount,
        uint256 _fee,
        bytes calldata _data
    ) external returns (bytes32) {
        require(
            msg.sender == permissionedCTokenAddress,
            "CreamFinanceERC3156: only permissioned ctoken can call"
        );
        require(
            _sender == address(this),
            "CreamFinanceERC3156: FlashLoan only from this contract"
        );

        (
            address origin,
            IERC3156FlashBorrower receiver,
            bytes memory userData
        ) = abi.decode(_data, (address, IERC3156FlashBorrower, bytes));

        uint256 totalFee = flashFee(_token, _amount);

        // Transfer to `receiver`
        require(
            IERC20(_token).transfer(address(receiver), _amount),
            "CreamFinanceERC3156: Transfer failed"
        );
        require(
            receiver.onFlashLoan(origin, _token, _amount, totalFee, userData) ==
                CALLBACK_SUCCESS,
            "CreamFinanceERC3156: Callback failed"
        );

        IERC20(_token).transferFrom(address(receiver), address(this), _amount.add(totalFee));

        uint256 addtionalFee = _additionalFee(_amount);
        IERC20(_token).transfer(FEETO, addtionalFee);

        IERC20(_token).approve(address(permissionedCTokenAddress), _amount.add(_fee));

        return CALLBACK_SUCCESS;
    }
}
