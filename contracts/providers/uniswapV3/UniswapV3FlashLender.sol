// SPDX-License-Identifier: GPL-3.0-or-later
// Derived from https://github.com/Austin-Williams/uniswap-flash-swapper

pragma solidity ^0.7.5;
pragma experimental ABIEncoderV2;
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "erc3156/contracts/interfaces/IERC3156FlashBorrower.sol";
import "./libraries/FullMath.sol";
import "./interfaces/IUniswapV3Pair.sol";
import "./interfaces/IUniswapV3FlashLender.sol";
import "./interfaces/IUniswapV3FlashBorrower.sol";

contract UniswapV3FlashLender is
    IUniswapV3FlashLender,
    IUniswapV3FlashBorrower
{
    using SafeMath for uint256;

    // CONSTANTS
    bytes32 public constant CALLBACK_SUCCESS =
        keccak256("ERC3156FlashBorrower.onFlashLoan");

    struct Pair {
        address token0;
        address token1;
        address pair;
    }

    struct FlashLoanInfo {
        address pool;
        uint256 maxloan;
        uint256 fee;
    }

    Pair[] public pairs;
    address public operator;
    address public flashloaner;

    constructor() {
        operator = msg.sender;
    }

    modifier onlyOperator() {
        require(msg.sender == operator, "UniswapV3FlashLender: Not operator");
        _;
    }

    modifier onlyFlashLoaner() {
        require(
            msg.sender == flashloaner,
            "UniswapV3FlashLender: Not flashloaner"
        );
        _;
    }

    function setOperator(address _operator) external onlyOperator {
        require(
            _operator != address(0),
            "UniswapV3FlashLender: _operator is address(0)"
        );
        operator = _operator;
    }

    function setFlashLoaner(address _flashloaner) external onlyOperator {
        require(
            _flashloaner != address(0),
            "UniswapV3FlashLender: _flashloaner is address(0)"
        );
        flashloaner = _flashloaner;
    }

    function addPairs(
        address[] memory _tokens0,
        address[] memory _tokens1,
        address[] memory _pairs
    ) public onlyOperator returns (bool) {
        require(
            (_tokens0.length == _tokens1.length) &&
                (_tokens1.length == _pairs.length),
            "UniswapV3FlashLender: mismatch length of token0, token1, pair"
        );
        for (uint256 i = 0; i < _pairs.length; i++) {
            require(
                _tokens0[i] != address(0),
                "UniswapV3FlashLender: _tokens0 is address(0)"
            );
            require(
                _tokens1[i] != address(0),
                "UniswapV3FlashLender: _tokens1 is address(0)"
            );
            require(
                _pairs[i] != address(0),
                "UniswapV3FlashLender: _pairs is address(0)"
            );

            bool checkPair = false;
            for (uint256 j = 0; j < pairs.length; j++) {
                if (_pairs[i] == pairs[j].pair) {
                    checkPair = true;
                }
            }
            if (!checkPair) {
                pairs.push(
                    Pair({
                        token0: _tokens0[i],
                        token1: _tokens1[i],
                        pair: _pairs[i]
                    })
                );
            }
        }

        return true;
    }

    function removePairs(address[] memory _pairs)
        public
        onlyOperator
        returns (bool)
    {
        for (uint256 i = 0; i < _pairs.length; i++) {
            for (uint256 j = 0; j < pairs.length; j++) {
                if (pairs[j].pair == _pairs[i]) {
                    pairs[j].token0 = pairs[pairs.length - 1].token0;
                    pairs[j].token1 = pairs[pairs.length - 1].token1;
                    pairs[j].pair = pairs[pairs.length - 1].pair;
                    pairs.pop();
                }
            }
        }
        return true;
    }

    function getPairLength() public view onlyOperator returns (uint256) {
        return pairs.length;
    }

    function _getValidPairs(address _token, uint256 _amount)
        internal
        view
        returns (FlashLoanInfo[] memory)
    {
        uint256 amount = 1e18;
        uint256 count = 0;
        for (uint256 i = 0; i < pairs.length; i++) {
            if (pairs[i].token0 == _token || pairs[i].token1 == _token) {
                uint256 balance = IERC20(_token).balanceOf(pairs[i].pair);
                uint128 liquidity = IUniswapV3Pair(pairs[i].pair).liquidity();
                if (balance >= _amount && liquidity > 0) {
                    count++;
                }
            }
        }
        if (count == 0) {
            FlashLoanInfo[] memory validFlashLoanInfos = new FlashLoanInfo[](1);
            validFlashLoanInfos[0].pool = address(0);
            validFlashLoanInfos[0].maxloan = uint256(0);
            validFlashLoanInfos[0].fee = uint256(0);

            return validFlashLoanInfos;
        } else {
            FlashLoanInfo[] memory validFlashLoanInfos = new FlashLoanInfo[](
                count
            );
            uint256 validCount = 0;

            for (uint256 i = 0; i < pairs.length; i++) {
                if (pairs[i].token0 == _token || pairs[i].token1 == _token) {
                    uint256 balance = IERC20(_token).balanceOf(pairs[i].pair);
                    uint128 liquidity = IUniswapV3Pair(pairs[i].pair)
                        .liquidity();
                    if (balance >= _amount && liquidity > 0) {
                        uint256 fee = _flashFee(pairs[i].pair, _token, amount);
                        validFlashLoanInfos[validCount].pool = pairs[i].pair;
                        validFlashLoanInfos[validCount].maxloan = balance;
                        validFlashLoanInfos[validCount].fee = fee;
                        validCount = validCount.add(1);
                        if (validCount == count) {
                            break;
                        }
                    }
                }
            }

            if (validFlashLoanInfos.length == 1) {
                return validFlashLoanInfos;
            } else {
                // sort by fee
                for (uint256 i = 1; i < validFlashLoanInfos.length; i++) {
                    for (uint256 j = 0; j < i; j++) {
                        if (
                            validFlashLoanInfos[i].fee <
                            validFlashLoanInfos[j].fee
                        ) {
                            FlashLoanInfo memory x = validFlashLoanInfos[i];
                            validFlashLoanInfos[i] = validFlashLoanInfos[j];
                            validFlashLoanInfos[j] = x;
                        }
                    }
                }
                // sort by maxloan
                for (uint256 i = 1; i < validFlashLoanInfos.length; i++) {
                    for (uint256 j = 0; j < i; j++) {
                        if (
                            validFlashLoanInfos[i].fee ==
                            validFlashLoanInfos[j].fee
                        ) {
                            if (
                                validFlashLoanInfos[i].maxloan >
                                validFlashLoanInfos[j].maxloan
                            ) {
                                FlashLoanInfo memory x = validFlashLoanInfos[i];
                                validFlashLoanInfos[i] = validFlashLoanInfos[j];
                                validFlashLoanInfos[j] = x;
                            }
                        }
                    }
                }
            }

            return validFlashLoanInfos;
        }
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
        FlashLoanInfo[] memory flashLoanInfos = _getValidPairs(_token, _amount);
        address[] memory pools = new address[](flashLoanInfos.length);
        uint256[] memory maxloans = new uint256[](flashLoanInfos.length);
        uint256[] memory fees = new uint256[](flashLoanInfos.length);
        for (uint256 i = 0; i < flashLoanInfos.length; i++) {
            pools[i] = flashLoanInfos[i].pool;
            maxloans[i] = flashLoanInfos[i].maxloan;
            fees[i] = flashLoanInfos[i].fee;
        }

        return (pools, maxloans, fees);
    }

    function flashFee(
        address _pair,
        address _token,
        uint256 _amount
    ) external view override onlyFlashLoaner returns (uint256) {
        return _flashFee(_pair, _token, _amount);
    }

    function _flashFee(
        address _pair,
        address _token,
        uint256 _amount
    ) internal view returns (uint256) {
        uint24 fee = IUniswapV3Pair(_pair).fee();
        return FullMath.mulDivRoundingUp(_amount, fee, 1e6);
    }

    function flashLoan(
        address _pair,
        IERC3156FlashBorrower _receiver,
        address _token,
        uint256 _amount,
        bytes memory _data
    ) external override onlyFlashLoaner returns (bool) {
        _flash(_pair, _receiver, _token, _amount, _data);
        return true;
    }

    function _flash(
        address _pair,
        IERC3156FlashBorrower _receiver,
        address _token,
        uint256 _amount,
        bytes memory _userData
    ) internal {
        IUniswapV3Pair pair = IUniswapV3Pair(_pair);

        address token0 = pair.token0();
        address token1 = pair.token1();
        uint256 amount0Out = _token == token0 ? _amount : 0;
        uint256 amount1Out = _token == token1 ? _amount : 0;
        bytes memory data = abi.encode(
            address(this),
            pair,
            msg.sender,
            _receiver,
            _token,
            _amount,
            _userData
        );

        pair.flash(address(this), amount0Out, amount1Out, data);
    }

    function uniswapV3FlashCallback(
        uint256 _fee0,
        uint256 _fee1,
        bytes calldata _data
    ) external override {
        (
            address sender,
            address pair,
            address origin,
            IERC3156FlashBorrower receiver,
            address token,
            uint256 amount,
            bytes memory userData
        ) = abi.decode(
                _data,
                (
                    address,
                    address,
                    address,
                    IERC3156FlashBorrower,
                    address,
                    uint256,
                    bytes
                )
            );

        require(
            sender == address(this),
            "UniswapV3FlashLender: sender must be this contract"
        );

        require(
            msg.sender == pair,
            "UniswapV3FlashLender: msg.sender must be the permissioned pair"
        );

        uint256 fee = _fee0 == 0 ? _fee1 : _fee0;

        IERC20(token).transfer(address(receiver), amount);

        require(
            receiver.onFlashLoan(origin, token, amount, fee, userData) ==
                CALLBACK_SUCCESS,
            "UniswapV3FlashLender: Callback failed"
        );

        require(
            IERC20(token).transferFrom(
                address(receiver),
                address(this),
                amount.add(fee)
        ),
            "UniswapV3FlashLender: Transfer failed"
        );

        IERC20(token).transfer(msg.sender, amount.add(fee));
    }
}
