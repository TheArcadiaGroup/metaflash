// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.0;

import "./libraries/SafeMath.sol";
import "./interfaces/IERC20_.sol";
import "./interfaces/IProviderLender.sol";
import "./interfaces/IFlashLender.sol";

contract FlashLender is IFlashLender, IERC3156FlashBorrower {
    using SafeMath for uint256;

    bytes32 public constant CALLBACK_SUCCESS =
        keccak256("ERC3156FlashBorrower.onFlashLoan");

    address public operator;

    address[] public providers;

    struct ProviderInfo {
        address provider;
        address pool;
        uint256 maxloan;
        uint256 fee;
    }

    constructor() {
        operator = msg.sender;
    }

    modifier onlyOperator() {
        require(msg.sender == operator, "FlashLender: Not operator");
        _;
    }

    function setOperator(address _operator) public onlyOperator {
        require(
            _operator != address(0),
            "FlashLender: _operator is address(0)"
        );
        operator = _operator;
    }

    function addProviders(address[] memory _providers)
        public
        onlyOperator
        returns (bool)
    {
        for (uint256 i = 0; i < _providers.length; i++) {
            require(
                _providers[i] != address(0),
                "FlashLender: provider address is zero address!"
            );
            bool checkProvider = false;
            for (uint256 j = 0; j < providers.length; j++) {
                if (_providers[i] == providers[j]) {
                    checkProvider = true;
                }
            }
            if (!checkProvider) {
                providers.push(_providers[i]);
            }
        }
        return true;
    }

    function removeProviders(address[] memory _providers)
        public
        onlyOperator
        returns (bool)
    {
        for (uint256 i = 0; i < _providers.length; i++) {
            for (uint256 j = 0; j < providers.length; j++) {
                if (providers[j] == _providers[i]) {
                    providers[j] = providers[providers.length - 1];
                    providers.pop();
                }
            }
        }
        return true;
    }

    function getProviderLength() public view onlyOperator returns (uint256) {
        return providers.length;
    }

    function _getFlashLoanInfoListWithCheaperFeePriority(
        address _token,
        uint256 _amount
    )
        internal
        view
        returns (
            address[] memory,
            address[] memory,
            uint256[] memory,
            uint256[] memory
        )
    {
        uint256 providerCount = 0;
        for (uint256 i = 0; i < providers.length; i++) {
            (
                address[] memory pools,
                uint256[] memory maxloans,
                uint256[] memory fees
            ) = IProviderLender(providers[i])
                    .getFlashLoanInfoListWithCheaperFeePriority(
                        _token,
                        _amount
                    );
            if (maxloans[0] > 0) {
                providerCount = providerCount.add(maxloans.length);
            }
        }
        require(providerCount > 0, "FlashLender: Found no provider");
        ProviderInfo[] memory providerInfos = new ProviderInfo[](providerCount);

        uint256 count = 0;

        for (uint256 i = 0; i < providers.length; i++) {
            (
                address[] memory pools,
                uint256[] memory maxloans,
                uint256[] memory fees
            ) = IProviderLender(providers[i])
                    .getFlashLoanInfoListWithCheaperFeePriority(
                        _token,
                        _amount
                    );

            if (maxloans[0] > 0) {
                for (uint256 j = 0; j < maxloans.length; j++) {
                    providerInfos[count].provider = providers[i];
                    providerInfos[count].pool = pools[j];
                    providerInfos[count].maxloan = maxloans[j];
                    providerInfos[count].fee = fees[j];
                    count = count.add(1);
                    if (count == providerCount) {
                        break;
                    }
                }
            }
        }

        if (providerInfos.length == 1) {
            address[] memory providers = new address[](providerInfos.length);
            address[] memory pools = new address[](providerInfos.length);
            uint256[] memory maxloans = new uint256[](providerInfos.length);
            uint256[] memory fees = new uint256[](providerInfos.length);
            providers[0] = providerInfos[0].provider;
            pools[0] = providerInfos[0].pool;
            maxloans[0] = providerInfos[0].maxloan;
            fees[0] = providerInfos[0].fee;

            return (providers, pools, maxloans, fees);
        } else {
            // sort by fee
            for (uint256 i = 1; i < providerInfos.length; i++) {
                for (uint256 j = 0; j < i; j++) {
                    if (providerInfos[i].fee < providerInfos[j].fee) {
                        ProviderInfo memory x = providerInfos[i];
                        providerInfos[i] = providerInfos[j];
                        providerInfos[j] = x;
                    }
                }
            }

            // sort by maxloan
            for (uint256 i = 1; i < providerInfos.length; i++) {
                for (uint256 j = 0; j < i; j++) {
                    if (providerInfos[i].fee == providerInfos[j].fee) {
                        if (
                            providerInfos[i].maxloan > providerInfos[j].maxloan
                        ) {
                            ProviderInfo memory x = providerInfos[i];
                            providerInfos[i] = providerInfos[j];
                            providerInfos[j] = x;
                        }
                    }
                }
            }
        }

        address[] memory providers = new address[](providerInfos.length);
        address[] memory pools = new address[](providerInfos.length);
        uint256[] memory maxloans = new uint256[](providerInfos.length);
        uint256[] memory fees = new uint256[](providerInfos.length);

        for (uint256 i = 0; i < providerInfos.length; i++) {
            providers[i] = providerInfos[i].provider;
            pools[i] = providerInfos[i].pool;
            maxloans[i] = providerInfos[i].maxloan;
            fees[i] = providerInfos[i].fee;
        }

        return (providers, pools, maxloans, fees);
    }

    function getFlashLoanInfoListWithCheaperFeePriority(
        address _token,
        uint256 _minAmount
    )
        public
        view
        returns (
            uint256[] memory,
            uint256[] memory,
            uint256[] memory
        )
    {
        (
            address[] memory providers,
            address[] memory pools,
            uint256[] memory maxloans,
            uint256[] memory feePer1e18s
        ) = _getFlashLoanInfoListWithCheaperFeePriority(_token, _minAmount);

        uint256[] memory feePerMaxLoans = new uint256[](maxloans.length);
        for (uint256 i = 0; i < maxloans.length; i++) {
            feePerMaxLoans[i] = _fee(
                providers[i],
                pools[i],
                _token,
                maxloans[i]
            );
        }

        return (maxloans, feePer1e18s, feePerMaxLoans);
    }

    // get the cheapest provider with maxFlashLoan >= _amount
    function maxFlashLoanWithCheapestProvider(
        address _token,
        uint256 _minAmount
    ) public view returns (uint256) {
        (
            address[] memory providers,
            address[] memory pools,
            uint256[] memory maxloans,
            uint256[] memory fees
        ) = _getFlashLoanInfoListWithCheaperFeePriority(_token, _minAmount);

        return maxloans[0];
    }

    function maxFlashLoanWithManyProviders(address _token, uint256 _minAmount)
        public
        view
        returns (uint256)
    {
        uint256 maxloan = 0;

        (
            address[] memory providers,
            address[] memory pools,
            uint256[] memory maxloans,
            uint256[] memory fees
        ) = _getFlashLoanInfoListWithCheaperFeePriority(_token, _minAmount);
        for (uint256 i = 0; i < maxloans.length; i++) {
            maxloan = maxloan.add(maxloans[i]);
        }

        return maxloan;
    }

    function flashFeeWithCheapestProvider(address _token, uint256 _amount)
        public
        view
        returns (uint256)
    {
        (
            address[] memory providers,
            address[] memory pools,
            uint256[] memory maxloans,
            uint256[] memory fees
        ) = _getFlashLoanInfoListWithCheaperFeePriority(_token, _amount);

        return _fee(providers[0], pools[0], _token, _amount);
    }

    function flashFeeWithManyProviders(
        address _token,
        uint256 _amount,
        uint256 _minAmount
    ) public view returns (uint256) {
        uint256 maxloan = 0;

        (
            address[] memory providers,
            address[] memory pools,
            uint256[] memory maxloans,
            uint256[] memory fees
        ) = _getFlashLoanInfoListWithCheaperFeePriority(_token, _minAmount);

        for (uint256 i = 0; i < maxloans.length; i++) {
            maxloan = maxloan.add(maxloans[i]);
        }

        require(
            _amount <= maxloan,
            "FlashLender: Amount is more than maxFlashLoan"
        );

        return
            _feeWithManyProvider(providers, pools, maxloans, _token, _amount);
    }

    function _feeWithManyProvider(
        address[] memory _providers,
        address[] memory _pools,
        uint256[] memory _maxloans,
        address _token,
        uint256 _amount
    ) internal view returns (uint256) {
        uint256 amount = 0;
        uint256 providerCount = 0;
        uint256 fee = 0;

        for (uint256 i = 0; i < _providers.length; i++) {
            if (amount.add(_maxloans[i]) <= _amount) {
                fee = fee.add(
                    _fee(_providers[i], _pools[i], _token, _maxloans[i])
                );
                amount = amount.add(_maxloans[i]);
                providerCount++;
                if (amount == _amount) {
                    break;
                }
            } else {
                uint256 tempAmount = _amount.sub(amount);
                fee = fee.add(
                    _fee(providers[i], _pools[i], _token, tempAmount)
                );
                providerCount++;
                amount = _amount;
                break;
            }
        }

        return fee.add(providerCount);
    }

    function _fee(
        address _provider,
        address _pool,
        address _token,
        uint256 _amount
    ) internal view returns (uint256) {
        uint256 fee = IProviderLender(_provider).flashFee(
            _pool,
            _token,
            _amount
        );
        return fee;
    }

    function flashLoanWithCheapestProvider(
        IERC3156FlashBorrower _receiver,
        address _token,
        uint256 _amount,
        bytes calldata _data
    ) external returns (bool) {
        (
            address[] memory providers,
            address[] memory pools,
            uint256[] memory maxloans,
            uint256[] memory fees
        ) = _getFlashLoanInfoListWithCheaperFeePriority(_token, _amount);

        _flashLoan(_receiver, _token, _amount, _data, providers[0], pools[0]);

        return true;
    }

    function flashLoanWithManyProviders(
        IERC3156FlashBorrower _receiver,
        address _token,
        uint256 _amount,
        bytes calldata _data,
        uint256 _minAmount
    ) external returns (bool) {
        uint256 amount = 0;

        (
            address[] memory providers,
            address[] memory pools,
            uint256[] memory maxloans,
            uint256[] memory fees
        ) = _getFlashLoanInfoListWithCheaperFeePriority(_token, _minAmount);

        uint256 maxloan = 0;

        for (uint256 i = 0; i < providers.length; i++) {
            maxloan = maxloan.add(maxloans[i]);
        }

        require(
            _amount <= maxloan,
            "FlashLender: Amount is more than maxFlashLoan"
        );

        for (uint256 i = 0; i < providers.length; i++) {
            if (amount.add(maxloans[i]) <= _amount) {
                _flashLoan(
                    _receiver,
                    _token,
                    maxloans[i],
                    _data,
                    providers[i],
                    pools[i]
                );
                amount = amount.add(maxloans[i]);
                if (amount == _amount) {
                    break;
                }
            } else {
                _flashLoan(
                    _receiver,
                    _token,
                    maxloans[i],
                    _data,
                    providers[i],
                    pools[i]
                );
                amount = _amount;
                break;
            }
        }

        return true;
    }

    function _flashLoan(
        IERC3156FlashBorrower _receiver,
        address _token,
        uint256 _amount,
        bytes calldata _data,
        address provider,
        address pool
    ) internal {
        bytes memory data = abi.encode(provider, msg.sender, _receiver, _data);
        IProviderLender(provider).flashLoan(
            pool,
            this,
            _token,
            _amount,
            data
        );
    }

    function onFlashLoan(
        address _sender,
        address _token,
        uint256 _amount,
        uint256 _fee,
        bytes calldata _data
    ) external returns (bytes32) {
        (
            address provider,
            address origin,
            IERC3156FlashBorrower receiver,
            bytes memory userData
        ) = abi.decode(_data, (address, address, IERC3156FlashBorrower, bytes));

        require(
            _sender == address(this),
            "FlashLender: _sender must be this contract"
        );

        require(
            provider == msg.sender,
            "FlashLender: msg.sender must be the permissioned provider"
        );

        require(
            IERC20_(_token).transfer(address(receiver), _amount),
            "FlashLender: Transfer failed"
        );

        require(
            receiver.onFlashLoan(origin, _token, _amount, _fee, userData) ==
                CALLBACK_SUCCESS,
            "FlashLender: Callback failed"
        );
        uint256 payment = _amount.add(_fee);

        require(
            IERC20_(_token).transferFrom(
                address(receiver),
                address(this),
                payment
            ),
            "FlashLender: Transfer failed"
        );

        IERC20_(_token).approve(msg.sender, payment);

        return CALLBACK_SUCCESS;
    }
}
