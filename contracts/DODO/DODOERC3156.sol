// SPDX-License-Identifier: GPL-3.0-or-later
// Derived from https://docs.aave.com/developers/guides/flash-loans
pragma solidity ^0.6.9;
pragma experimental ABIEncoderV2;

import {IERC20} from "./interfaces/IERC20.sol";
import {SafeMath} from "./libraries/SafeMath.sol";
import {Ownable} from "./libraries/Ownable.sol";
import "erc3156/contracts/interfaces/IERC3156FlashBorrower.sol";
import "erc3156/contracts/interfaces/IERC3156FlashLender.sol";
import "./interfaces/IDODOFlashBorrower.sol";
import "./interfaces/IDVM.sol";
import "./mocks/DVMFactory.sol";

contract DODOERC3156 is IERC3156FlashLender, IDODOFlashBorrower, Ownable {
    using SafeMath for uint256;

    bytes32 public constant CALLBACK_SUCCESS =
        keccak256("ERC3156FlashBorrower.onFlashLoan");
    address public FEETO;

    struct DVMPool {
        address basetoken;
        address quotetoken;
        address dvmpool;
    }

    DVMPool[] public dvmpools;
    address permissionedPairAddress;

    // --- Init ---
    constructor(address feeTo) public {
        FEETO = feeTo;
    }
    
    function setFeeTo(address feeTo) public onlyOwner {
        FEETO = feeTo;
    }

    function addDVMPools(
        address[] memory basetoken,
        address[] memory quotetoken,
        address[] memory dvmpool
    ) public onlyOwner returns (bool) {
        require(
            (basetoken.length == quotetoken.length) &&
                (quotetoken.length == dvmpool.length),
            "mismatch length of basetoken, quotetoken, dvmpool"
        );
        for (uint256 i = 0; i < dvmpool.length; i++) {
            require(basetoken[i] != address(0), "Unsupported currency");
            require(quotetoken[i] != address(0), "Unsupported currency");
            require(dvmpool[i] != address(0), "Unsupported currency");
            dvmpools.push(
                DVMPool({
                    basetoken: basetoken[i],
                    quotetoken: quotetoken[i],
                    dvmpool: dvmpool[i]
                })
            );
        }
        return true;
    }

    function removeDVMPools(address[] memory dvmpool)
        public
        onlyOwner
        returns (bool)
    {
        for (uint256 i = 0; i < dvmpool.length; i++) {
            for (uint256 j = 0; j < dvmpools.length; j++) {
                if (dvmpools[j].dvmpool == dvmpool[i]) {
                    dvmpools[j].basetoken = dvmpools[dvmpools.length - 1].basetoken;
                    dvmpools[j].quotetoken = dvmpools[dvmpools.length - 1].quotetoken;
                    dvmpools[j].dvmpool = dvmpools[dvmpools.length - 1].dvmpool;
                    dvmpools.pop();
                }
            }
        }
        return true;
    }

    function _biggestDVMPool(address token)
        private
        view
        returns (address, uint256)
    {
        uint256 maxloan;
        address dvmpool;
        for (uint256 i = 0; i < dvmpools.length; i++) {
            if (dvmpools[i].basetoken == token || dvmpools[i].quotetoken == token) {
                uint256 balance = IERC20(token).balanceOf(dvmpools[i].dvmpool);
                if (balance > maxloan) {
                    maxloan = balance;
                    dvmpool = dvmpools[i].dvmpool;
                }
            }
        }
        return (dvmpool, maxloan);
    }

    function maxFlashLoan(address token)
        external
        view
        override
        returns (uint256)
    {
        uint256 maxloan;
        address dvmpoolAddress;
        (dvmpoolAddress, maxloan) = _biggestDVMPool(token);
        require(dvmpoolAddress != address(0), "Unsupported currency");
        return maxloan;
    }

    function flashFee(address token, uint256 amount)
        public
        view
        override
        returns (uint256)
    {
        uint256 dodoFee = _dodoFee(token, amount);
        uint256 additionalFee = _additionalFee(amount);
        uint256 totalFee = dodoFee.add(additionalFee);
        return totalFee;
    }

    function _dodoFee(address token, uint256 amount)
        internal
        view
        returns (uint256)
    {
        return 0;
    }

    function _additionalFee(uint256 amount) internal view returns (uint256) {
        return amount.mul(5).div(1000);
    }

    function flashLoan(
        IERC3156FlashBorrower receiver,
        address token,
        uint256 amount,
        bytes calldata userData
    ) external override returns (bool) {

        address dvmpooladdress;
        (dvmpooladdress, ) = _biggestDVMPool(token);
        require(dvmpooladdress != address(0), "Unsupported currency");

        IDVM dvmpool = IDVM(dvmpooladdress);

        if (permissionedPairAddress != dvmpooladdress) {
            permissionedPairAddress = dvmpooladdress; // access control
        }

        address basetoken = address(dvmpool._BASE_TOKEN_());
        address quotetoken = address(dvmpool._QUOTE_TOKEN_());
        uint256 amountbaseOut = token == basetoken ? amount : 0;
        uint256 amountquoteOut = token == quotetoken ? amount : 0;
        bytes memory data = abi.encode(msg.sender, receiver, token, userData);
        dvmpool.flashLoan(amountbaseOut, amountquoteOut, address(this), data);

        return true;
    }

    function DVMFlashLoanCall(
        address sender,
        uint256 baseAmount,
        uint256 quoteAmount,
        bytes calldata data
    ) external override {
       
        require(
            msg.sender == permissionedPairAddress,
            "only permissioned DVM pool can call"
        );
        require(sender == address(this), "only this contract may initiate");

        uint256 amount = baseAmount > 0 ? baseAmount : quoteAmount;

        // decode data
        (
            address origin,
            IERC3156FlashBorrower receiver,
            address token,
            bytes memory userData
        ) = abi.decode(data, (address, IERC3156FlashBorrower, address, bytes));

        uint256 totalFee = flashFee(token, amount);

        IERC20(token).transfer(address(receiver), amount);

        require(
            receiver.onFlashLoan(origin, token, amount, totalFee, userData) ==
                CALLBACK_SUCCESS,
            "Callback failed"
        );

        IERC20(token).transferFrom(
            address(receiver),
            address(this),
            amount.add(totalFee)
        );

        uint256 addtionalFee = _additionalFee(amount);
        IERC20(token).transfer(FEETO, addtionalFee);

        uint256 dodoFee = _dodoFee(token, amount);
        IERC20(token).transfer(msg.sender, amount.sub(dodoFee));
    }
}
