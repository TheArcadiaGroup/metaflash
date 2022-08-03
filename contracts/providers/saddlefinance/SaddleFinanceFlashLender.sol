pragma solidity >=0.6.12;

import "./interfaces/ISaddleFinanceSwapFlashLoan.sol";
import "./interfaces/ISaddleFinanceFlashBorrower.sol";
import "./interfaces/ISaddleFinanceFlashLender.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "hardhat/console.sol";

contract SaddleFinanceFlashLender is
    ISaddleFinanceFlashLender,
    ISaddleFinanceFlashBorrower,
    Ownable
{
    using SafeMath for uint256;

    bytes32 public constant CALLBACK_SUCCESS =
        keccak256("ERC3156FlashBorrower.onFlashLoan");

    address[] public pools;

    struct FlashLoanInfo {
        address pool;
        uint256 maxloan;
        uint256 fee;
    }

    // --- Init ---
    constructor() public {}

    function addPools(address[] memory _pool) public onlyOwner returns (bool) {
        for (uint256 i = 0; i < _pool.length; i++) {
            require(
                _pool[i] != address(0),
                "SaddleFinanceFlashLender: _pool address is zero address!"
            );
            pools.push(_pool[i]);
        }
        return true;
    }

    function removePools(address[] memory _pool)
        public
        onlyOwner
        returns (bool)
    {
        for (uint256 i = 0; i < _pool.length; i++) {
            for (uint256 j = 0; j < pools.length; j++) {
                if (pools[j] == _pool[i]) {
                    pools[j] = pools[pools.length - 1];
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
            uint256 balance = IERC20(_token).balanceOf(pools[i]);
            if (balance >= _amount) {
                count++;
            }
        }

        if (count == 0) {
            FlashLoanInfo[] memory validFlashLoanInfos = new FlashLoanInfo[](1);
            validFlashLoanInfos[0].pool = address(0);
            validFlashLoanInfos[0].maxloan = uint256(0);
            validFlashLoanInfos[0].fee = uint256(0);

            return validFlashLoanInfos;
        } else {
            FlashLoanInfo[] memory validFlashLoanInfos = new FlashLoanInfo[](count);

            uint256 validCount = 0;

            for (uint256 i = 0; i < pools.length; i++) {
                uint256 balance = IERC20(_token).balanceOf(pools[i]);
                if (balance >= _amount) {
                    uint256 fee = _flashFee(pools[i], _token, amount);
                    validFlashLoanInfos[validCount].pool = pools[i];
                    validFlashLoanInfos[validCount].maxloan = balance;
                    validFlashLoanInfos[validCount].fee = fee;
                    validCount = validCount.add(1);
                    if (validCount == count) {
                        break;
                    }
                }
            }

            if (validFlashLoanInfos.length == 1) {
                return validFlashLoanInfos;
            } else {
                // sort by fee
                for (uint256 i = 1; i < validFlashLoanInfos.length; i++) {
                    for (uint256 j = 0; j < i; j++) {
                        if (validFlashLoanInfos[i].fee < validFlashLoanInfos[j].fee) {
                            FlashLoanInfo memory x = validFlashLoanInfos[i];
                            validFlashLoanInfos[i] = validFlashLoanInfos[j];
                            validFlashLoanInfos[j] = x;
                        }
                    }
                }
                // sort by maxloan
                for (uint256 i = 1; i < validFlashLoanInfos.length; i++) {
                    for (uint256 j = 0; j < i; j++) {
                        if (validFlashLoanInfos[i].fee == validFlashLoanInfos[j].fee) {
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

    function getFlashLoanInfoListWithCheaperFeePriority(address _token, uint256 _amount)
        external
        view
        override
        returns (address[] memory pools, uint256[] memory maxloans, uint256[] memory fees)
    {
        FlashLoanInfo[] memory flashLoanInfos = _getValidPools(_token, _amount);
        address[] memory pools = new address[](flashLoanInfos.length);
        uint256[] memory maxloans = new uint256[](flashLoanInfos.length);
        uint256[] memory fees = new uint256[](flashLoanInfos.length);
        for(uint256 i = 0; i < flashLoanInfos.length; i++){
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
        return _flashFee(_pool, _token, _amount);
    }

    function _flashFee(
        address _pool,
        address _token,
        uint256 _amount
    ) internal view returns (uint256) {
        return
            _amount
                .mul(ISaddleFinanceSwapFlashLoan(_pool).flashLoanFeeBPS())
                .div(10000);
    }

    function flashLoan(
        address _pool,
        IERC3156FlashBorrower _receiver,
        address _token,
        uint256 _amount,
        bytes calldata _data
    ) external override returns (bool) {
        _flashLoan(_pool, _receiver, _token, _amount, _data);
        return true;
    }

    function _flashLoan(
        address _pool,
        IERC3156FlashBorrower _receiver,
        address _token,
        uint256 _amount,
        bytes memory _data
    ) internal {
        ISaddleFinanceSwapFlashLoan pool = ISaddleFinanceSwapFlashLoan(_pool);

        bytes memory data = abi.encode(
            address(this),
            msg.sender,
            _receiver,
            _data
        );
        pool.flashLoan(address(this), IERC20(_token), _amount, data);
    }

    function executeOperation(
        address _pool,
        address _token,
        uint256 _amount,
        uint256 _fee,
        bytes calldata _params
    ) external override {
        require(
            msg.sender == _pool,
            "SaddleFinanceFlashLender: msg.sender must be permissioned pool"
        );

        (
            address sender,
            address origin,
            IERC3156FlashBorrower receiver,
            bytes memory userData
        ) = abi.decode(
                _params,
                (address, address, IERC3156FlashBorrower, bytes)
            );

        require(
            sender == address(this),
            "SaddleFinanceFlashLender:  sender must be this contract"
        );

        // Transfer to `receiver`
        require(
            IERC20(_token).transfer(address(receiver), _amount),
            "SaddleFinanceFlashLender: Transfer failed"
        );

        require(
            receiver.onFlashLoan(origin, _token, _amount, _fee, userData) ==
                CALLBACK_SUCCESS,
            "SaddleFinanceFlashLender: Callback failed"
        );

        require(
            IERC20(_token).transferFrom(
                address(receiver),
                address(this),
                _amount.add(_fee)
            ),
            "SaddleFinanceFlashLender: Transfer failed"
        );

        IERC20(_token).transfer(_pool, _amount.add(_fee));
    }
}
