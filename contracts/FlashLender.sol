// SPDX-License-Identifier: GPL-3.0-or-later
// Derived from https://github.com/Austin-Williams/uniswap-flash-swapper

pragma solidity >=0.5.0;

import "./libraries/SafeMath.sol";
import "./interfaces/IERC20.sol";
import "./interfaces/IERC3156FlashBorrower.sol";
import "./interfaces/IERC3156FlashLender.sol";
import "./interfaces/IFlashLender.sol";

contract FlashLender is IFlashLender, IERC3156FlashBorrower {
    using SafeMath for uint256;

    bytes32 public constant CALLBACK_SUCCESS =
        keccak256("ERC3156FlashBorrower.onFlashLoan");

    address public factory;
    address public FEETO;

    address[] public providers;
    address[] public validProviders;

    struct ProviderInfo {
        address provider;
        uint256 maxloan;
        uint256 fee;
    }

    ProviderInfo[] public sortedValidProviders;
    bool internal called;
    uint256 internal count;

    constructor(address _feeTo) public {
        require(
            address(_feeTo) != address(0),
            "FlashLender: feeTo address is zero address!"
        );
        factory = msg.sender;
        FEETO = _feeTo;
    }

    function setFactory(address _factory) external {
        require(msg.sender == factory, "FlashLender: Not factory");
        factory = _factory;
    }

    function setFeeTo(address _feeTo) public {
        require(msg.sender == factory, "FlashLender: Not factory");
        require(
            address(_feeTo) != address(0),
            "FlashLender: feeTo address is zero address!"
        );
        FEETO = _feeTo;
    }

    function addProviders(address[] memory _providers) public returns (bool) {
        require(msg.sender == factory, "FlashLender: Not factory");
        for (uint256 i = 0; i < _providers.length; i++) {
            require(
                _providers[i] != address(0),
                "FlashLender: provider address is zero address!"
            );
            providers.push(_providers[i]);
        }
        return true;
    }

    function removeProviders(address[] memory _providers)
        public
        returns (bool)
    {
        require(msg.sender == factory, "FlashLender: Not factory");
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

    // sort providers that their maxFlashLoan are more than or equal to _amount by fee
    function _sortProvidersByFee(address _token, uint256 _amount)
        internal
        view
        returns (ProviderInfo[] memory)
    {
        uint256 providerCount = 0;
        for (uint256 i = 0; i < providers.length; i++) {
            uint256 maxloan = IERC3156FlashLender(providers[i]).maxFlashLoan(
                _token,
                _amount
            );
            
            if (maxloan >= _amount) {
                providerCount++;
            }
        }

        require(providerCount > 0, "FlashLender: Found no provider");
        ProviderInfo[] memory providerInfos = new ProviderInfo[](providerCount);

        uint256 count = 0;

        for (uint256 i = 0; i < providers.length; i++) {
            uint256 maxloan = IERC3156FlashLender(providers[i]).maxFlashLoan(
                _token,
                _amount
            );
            if (maxloan >= _amount) {
                uint256 fee = IERC3156FlashLender(providers[i]).flashFee(
                    _token,
                    _amount
                );
                providerInfos[count].provider = providers[i];
                providerInfos[count].maxloan = maxloan;
                providerInfos[count].fee = fee;
                count = count.add(1);
            }
        }

        if (providerInfos.length == 1) {
            return providerInfos;
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
        }

        return providerInfos;
    }

    // sort providers that their maxFlashLoan are more than or equal to _amount by fee
    function _sortProvidersWithManyPairs_OR_ManyPoolsByFee(
        address _token,
        uint256 _amount
    ) internal view returns (ProviderInfo[] memory) {
        uint256 providerCount = 0;
        for (uint256 i = 0; i < providers.length; i++) {
            uint256 maxloan = IERC3156FlashLender(providers[i])
                .maxFlashLoanWithManyPairs_OR_ManyPools(_token);
            if (maxloan > 0) {
                providerCount++;
            }
        }

        require(providerCount > 0, "FlashLender: Found no provider");
        ProviderInfo[] memory providerInfos = new ProviderInfo[](providerCount);

        uint256 count = 0;

        for (uint256 i = 0; i < providers.length; i++) {
            uint256 maxloan = IERC3156FlashLender(providers[i])
                .maxFlashLoanWithManyPairs_OR_ManyPools(_token);
            if (maxloan > 0) {
                uint256 fee = IERC3156FlashLender(providers[i])
                    .flashFeeWithManyPairs_OR_ManyPools(_token, _amount);
                providerInfos[count].provider = providers[i];
                providerInfos[count].maxloan = maxloan;
                providerInfos[count].fee = fee;
                count = count.add(1);
                if (count == providerCount) {
                    break;
                }
            }
        }

        if (providerInfos.length == 1) {
            return providerInfos;
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
                            providerInfos[i].maxloan >
                            providerInfos[j].maxloan
                        ) {
                            ProviderInfo memory x = providerInfos[i];
                            providerInfos[i] = providerInfos[j];
                            providerInfos[j] = x;
                        }
                    }
                }
            }
        }

        return providerInfos;
    }

    // get the cheapest provider with maxFlashLoan >= _amount
    function maxFlashLoanWithCheapestProvider(address _token, uint256 _amount)
        public
        view
        returns (uint256)
    {
        ProviderInfo[] memory sortedTempProviders = _sortProvidersByFee(
            _token,
            _amount
        );

        require(
            sortedTempProviders.length > 0,
            "FlashLender: Found no providers"
        );
        return sortedTempProviders[0].maxloan;
    }

    function maxFlashLoanWithManyProviders(address _token)
        public
        view
        returns (uint256)
    {
        uint256 maxloan = 0;
        ProviderInfo[]
            memory sortedTempProviders = _sortProvidersWithManyPairs_OR_ManyPoolsByFee(
                _token,
                1e18
            );
        
        for (uint256 i = 0; i < sortedTempProviders.length; i++) {
            maxloan = maxloan.add(sortedTempProviders[i].maxloan);
        }

        return maxloan;
    }

    function flashFeeWithCheapestProvider(address _token, uint256 _amount)
        public
        view
        returns (uint256)
    {
        ProviderInfo[] memory sortedTempProviders = _sortProvidersByFee(
            _token,
            _amount
        );

        uint256 providerFee = sortedTempProviders[0].fee;
        uint256 additionalFee = _additionalFee(_amount);
        uint256 totalFee = providerFee.add(additionalFee);

        return totalFee;
    }

    function flashFeeWithManyProviders(address _token, uint256 _amount)
        public
        view
        returns (uint256)
    {
        uint256 fee = 0;
        uint256 totalAmount = _amount;
        uint256 amount = 0;
        uint256 providerCount = 0;

        ProviderInfo[]
            memory sortedTempProviders = _sortProvidersWithManyPairs_OR_ManyPoolsByFee(
                _token,
                1e18
            );

        for (uint256 i = 0; i < sortedTempProviders.length; i++) {
            if (amount.add(sortedTempProviders[i].maxloan) <= totalAmount) {
                uint256 tempFee = IERC3156FlashLender(sortedTempProviders[i].provider)
                        .flashFeeWithManyPairs_OR_ManyPools(
                            _token,
                            sortedTempProviders[i].maxloan
                        );
                fee = fee.add(tempFee);
                amount = amount.add(sortedTempProviders[i].maxloan);
                providerCount++;
                if (amount == totalAmount) {
                    break;
                }
            } else {
                fee = fee.add(
                    IERC3156FlashLender(sortedTempProviders[i].provider)
                        .flashFeeWithManyPairs_OR_ManyPools(
                            _token,
                            totalAmount.sub(amount)
                        )
                );
                providerCount++;
                amount = totalAmount;
                break;
            }
        }

        require(
            amount == totalAmount,
            "FlashLender: Amount is more than maxFlashLoan"
        );

        uint256 additionalFee = _additionalFee(amount);
        uint256 totalFee = fee.add(additionalFee).add(providerCount);

        return totalFee;
    }

    function _additionalFee(uint256 _amount) internal view returns (uint256) {
        return _amount.mul(5).div(1000);
    }

    function flashLoanWithCheapestProvider(
        IERC3156FlashBorrower _receiver,
        address _token,
        uint256 _amount,
        bytes calldata _userData
    ) external returns (bool) {
        uint256 totalAmount = _amount;
        uint256 amount = 0;

        ProviderInfo[] memory sortedTempProviders = _sortProvidersByFee(
            _token,
            _amount
        );

        require(
            sortedTempProviders[0].provider != address(0),
            "FlashLender: Unsupported token"
        );

        bytes memory data = abi.encode(sortedTempProviders[0].provider, msg.sender, _receiver, _userData);

        IERC3156FlashLender(sortedTempProviders[0].provider).flashLoan(
            this,
            _token,
            _amount,
            data
        );

        return true;
    }

    function flashLoanWithManyProviders(
        IERC3156FlashBorrower _receiver,
        address _token,
        uint256 _amount,
        bytes calldata _userData
    ) external returns (bool) {
        uint256 totalAmount = _amount;
        uint256 amount = 0;

        ProviderInfo[]
            memory sortedTempProviders = _sortProvidersWithManyPairs_OR_ManyPoolsByFee(
                _token,
                1e18
            );

        for (uint256 i = 0; i < sortedTempProviders.length; i++) {
            if (amount.add(sortedTempProviders[i].maxloan) <= totalAmount) {
                bytes memory data = abi.encode(sortedTempProviders[i].provider, msg.sender, _receiver, _userData);
                IERC3156FlashLender(sortedTempProviders[i].provider)
                    .flashLoanWithManyPairs_OR_ManyPools(
                        this,
                        _token,
                        sortedTempProviders[i].maxloan,
                        data
                    );
                amount = amount.add(sortedTempProviders[i].maxloan);
                if (amount == totalAmount) {
                    break;
                }
            } else {
                bytes memory data = abi.encode(sortedTempProviders[i].provider, msg.sender, _receiver, _userData);
                IERC3156FlashLender(sortedTempProviders[i].provider)
                    .flashLoanWithManyPairs_OR_ManyPools(
                        this,
                        _token,
                        totalAmount.sub(amount),
                        data
                    );
                amount = totalAmount;
                break;
            }
        }

        return true;
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
            IERC20(_token).transfer(address(receiver), _amount),
            "FlashLender: Transfer failed"
        );
        
        uint256 additionalFee = _additionalFee(_amount);
        uint256 totalFee = _fee.add(additionalFee);

        require(
            receiver.onFlashLoan(origin, _token, _amount, totalFee, userData) ==
                CALLBACK_SUCCESS,
            "FlashLender: Callback failed"
        );
        uint256 payment = _amount.add(totalFee).add(1);
        require(
            IERC20(_token).transferFrom(
                address(receiver),
                address(this),
                payment
            ),
            "FlashLender: Transfer failed"
        );

        IERC20(_token).transfer(FEETO, additionalFee);

        IERC20(_token).approve(msg.sender, payment);

        return CALLBACK_SUCCESS;
    }
}
