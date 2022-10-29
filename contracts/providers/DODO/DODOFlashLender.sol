// SPDX-License-Identifier: GPL-3.0-or-later
// Derived from https://docs.aave.com/developers/guides/flash-loans
pragma solidity ^0.6.9;
pragma experimental ABIEncoderV2;

// import {IERC20} from "./interfaces/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeMath} from "./libraries/SafeMath.sol";
import {Ownable} from "./libraries/Ownable.sol";
import "./interfaces/IDODOFlashLender.sol";
import "./interfaces/IDODOFlashBorrower.sol";
import "./interfaces/IDVM.sol";

contract DODOFlashLender is IDODOFlashLender, IDODOFlashBorrower, Ownable {
    using SafeMath for uint256;

    bytes32 public constant CALLBACK_SUCCESS =
        keccak256("ERC3156FlashBorrower.onFlashLoan");

    struct Pool {
        address basetoken;
        address quotetoken;
        address pool;
    }

    struct FlashLoanInfo {
        address pool;
        uint256 maxloan;
        uint256 fee;
    }

    Pool[] public pools;
    address public operator;
    address public flashloaner;

    // --- Init ---
    constructor() public {
        operator = msg.sender;
    }

    modifier onlyOperator() {
        require(msg.sender == operator, "UniswapV2FlashLender: Not operator");
        _;
    }

    modifier onlyFlashLoaner() {
        require(
            msg.sender == flashloaner,
            "UniswapV2FlashLender: Not flashloaner"
        );
        _;
    }

    function setOperator(address _operator) external onlyOperator {
        require(
            _operator != address(0),
            "UniswapV2FlashLender: _operator is address(0)"
        );
        operator = _operator;
    }

    function setFlashLoaner(address _flashloaner) external onlyOperator {
        require(
            _flashloaner != address(0),
            "UniswapV2FlashLender: _flashloaner is address(0)"
        );
        flashloaner = _flashloaner;
    }

    function addPools(
        address[] memory _basetokens,
        address[] memory _quotetokens,
        address[] memory _pools
    ) public onlyOwner returns (bool) {
        require(
            (_basetokens.length == _quotetokens.length) &&
                (_quotetokens.length == _pools.length),
            "DODOFlashLender: mismatch length of basetoken, quotetoken, pool"
        );
        for (uint256 i = 0; i < _pools.length; i++) {
            require(
                _basetokens[i] != address(0),
                "DODOFlashLender: _basetokens is address(0)"
            );
            require(
                _quotetokens[i] != address(0),
                "DODOFlashLender: _quotetokens is address(0)"
            );
            require(
                _pools[i] != address(0),
                "DODOFlashLender: _pools is address(0)"
            );
            pools.push(
                Pool({
                    basetoken: _basetokens[i],
                    quotetoken: _quotetokens[i],
                    pool: _pools[i]
                })
            );
        }
        return true;
    }

    function removePools(address[] memory _pools)
        public
        onlyOwner
        returns (bool)
    {
        for (uint256 i = 0; i < _pools.length; i++) {
            for (uint256 j = 0; j < pools.length; j++) {
                if (pools[j].pool == _pools[i]) {
                    pools[j].basetoken = pools[pools.length - 1].basetoken;
                    pools[j].quotetoken = pools[pools.length - 1].quotetoken;
                    pools[j].pool = pools[pools.length - 1].pool;
                    pools.pop();
                }
            }
        }
        return true;
    }

    function _getValidPools(address _token, uint256 _amount)
        internal
        view
        returns (FlashLoanInfo[] memory)
    {
        uint256 amount = 1e18;
        uint256 count = 0;

        for (uint256 i = 0; i < pools.length; i++) {
            if (pools[i].basetoken == _token || pools[i].quotetoken == _token) {
                uint256 balance = IERC20(_token).balanceOf(
                    pools[i].pool
                );
                if (balance >= _amount) {
                    count++;
                }
            }
        }
        if (count == 0) {
            FlashLoanInfo[] memory validPoolInfos = new FlashLoanInfo[](1);
            validPoolInfos[0].pool = address(0);
            validPoolInfos[0].maxloan = uint256(0);
            validPoolInfos[0].fee = uint256(0);

            return validPoolInfos;
        } else {
            FlashLoanInfo[] memory validPoolInfos = new FlashLoanInfo[](count);
            uint256 validCount = 0;

            for (uint256 i = 0; i < pools.length; i++) {
                if (
                    pools[i].basetoken == _token ||
                    pools[i].quotetoken == _token
                ) {
                    uint256 balance = IERC20(_token).balanceOf(
                        pools[i].pool
                    );
                    if (balance >= _amount) {
                        uint256 fee = 0;
                        validPoolInfos[validCount].pool = pools[i].pool;
                        validPoolInfos[validCount].maxloan = balance;
                        validPoolInfos[validCount].fee = fee;
                        validCount = validCount.add(1);
                        if (validCount == count) {
                            break;
                        }
                    }
                }
            }

            if (validPoolInfos.length == 1) {
                return validPoolInfos;
            } else {
                // sort by fee
                for (uint256 i = 1; i < validPoolInfos.length; i++) {
                    for (uint256 j = 0; j < i; j++) {
                        if (validPoolInfos[i].fee < validPoolInfos[j].fee) {
                            FlashLoanInfo memory x = validPoolInfos[i];
                            validPoolInfos[i] = validPoolInfos[j];
                            validPoolInfos[j] = x;
                        }
                    }
                }
                // sort by maxloan
                for (uint256 i = 1; i < validPoolInfos.length; i++) {
                    for (uint256 j = 0; j < i; j++) {
                        if (validPoolInfos[i].fee == validPoolInfos[j].fee) {
                            if (
                                validPoolInfos[i].maxloan >
                                validPoolInfos[j].maxloan
                            ) {
                                FlashLoanInfo memory x = validPoolInfos[i];
                                validPoolInfos[i] = validPoolInfos[j];
                                validPoolInfos[j] = x;
                            }
                        }
                    }
                }
            }

            return validPoolInfos;
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
        FlashLoanInfo[] memory flashLoanInfos = _getValidPools(_token, _amount);
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

    function flashFee(address _pool, address _token, uint256 _amount)
        public
        view
        override
        returns (uint256)
    {
        return 0;
    }

    function flashLoan(
        address _pool,
        IERC3156FlashBorrower _receiver,
        address _token,
        uint256 _amount,
        bytes memory _data
    ) external override returns (bool) {
        _flashloan(
            _pool,
            _receiver,
            _token,
            _amount,
            _data
        );

        return true;
    }

    function _flashloan(
        address _pool,
        IERC3156FlashBorrower _receiver,
        address _token,
        uint256 _amount,
        bytes memory _data
    ) internal {
        IDVM pool = IDVM(_pool);

        address basetoken = address(pool._BASE_TOKEN_());
        address quotetoken = address(pool._QUOTE_TOKEN_());
        uint256 amountbaseOut = _token == basetoken ? _amount : 0;
        uint256 amountquoteOut = _token == quotetoken ? _amount : 0;
        bytes memory data = abi.encode(
            pool,
            msg.sender,
            _receiver,
            _token,
            _data
        );
        pool.flashLoan(amountbaseOut, amountquoteOut, address(this), data);
    }

    function DVMFlashLoanCall(
        address _sender,
        uint256 _baseAmount,
        uint256 _quoteAmount,
        bytes calldata _data
    ) external override {
        _flashLoanCall(_sender, _baseAmount, _quoteAmount, _data);
    }

    function DPPFlashLoanCall(
        address _sender,
        uint256 _baseAmount,
        uint256 _quoteAmount,
        bytes calldata _data
    ) external override {
        _flashLoanCall(_sender, _baseAmount, _quoteAmount, _data);
    }

    function DSPFlashLoanCall(
        address _sender,
        uint256 _baseAmount,
        uint256 _quoteAmount,
        bytes calldata _data
    ) external override {
        _flashLoanCall(_sender, _baseAmount, _quoteAmount, _data);
    }

    function _flashLoanCall(
        address _sender,
        uint256 _baseAmount,
        uint256 _quoteAmount,
        bytes calldata _data
    ) internal {
        require(
            _sender == address(this),
            "DODOFlashLender: _sender must be this contract"
        );

        (
            address pool,
            address origin,
            IERC3156FlashBorrower receiver,
            address token,
            bytes memory userData
        ) = abi.decode(
                _data,
                (address, address, IERC3156FlashBorrower, address, bytes)
            );

        require(
            msg.sender == pool,
            "DODOFlashLender: msg.sender must be the permissioned pool"
        );

        uint256 amount = _baseAmount > 0 ? _baseAmount : _quoteAmount;
        uint256 fee = flashFee(pool, token, amount);

        IERC20(token).transfer(address(receiver), amount);

        require(
            receiver.onFlashLoan(origin, token, amount, fee, userData) ==
                CALLBACK_SUCCESS,
            "DODOFlashLender: Callback failed"
        );

        IERC20(token).transferFrom(
            address(receiver),
            address(this),
            amount.add(fee)
        );

        IERC20(token).transfer(msg.sender, amount.sub(fee));
    }
}
