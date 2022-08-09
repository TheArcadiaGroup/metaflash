# metaflash

## Execute flashloan

Implement FlashBorrower.sol to execute flashloan

FlashBorrower.sol

    pragma solidity ^0.8.0;

    import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
    import "@openzeppelin/contracts/utils/math/SafeMath.sol";
    import "./interfaces/IFlashLender.sol";

    contract FlashBorrower is IERC3156FlashBorrower {
        using SafeMath for uint256;

        enum Action {
            NORMAL,
            REENTER
        }

        bytes32 public constant CALLBACK_SUCCESS =
            keccak256("ERC3156FlashBorrower.onFlashLoan");

        function onFlashLoan(
            address _sender,
            address _token,
            uint256 _amount,
            uint256 _fee,
            bytes calldata _data
        ) external returns (bytes32) {
            require(
                _sender == address(this),
                "FlashBorrower: sender must be this contract"
            );

            Action action = abi.decode(_data, (Action)); 

            if (action == Action.NORMAL) {
                // ****** IMPLEMENT HERE ******
            }
            return CALLBACK_SUCCESS;
        }

        function flashBorrowWithCheapestProvider(
            IFlashLender _lender,
            address _token,
            uint256 _amount
        ) public {
            uint256 allowance = IERC20(_token).allowance(
                address(this),
                address(_lender)
            );
            uint256 _fee = _lender.flashFeeWithCheapestProvider(_token, _amount);
            uint256 repayment = _amount.add(_fee);
            IERC20(_token).approve(address(_lender), allowance.add(repayment));
            bytes memory data = abi.encode(Action.NORMAL);
            _lender.flashLoanWithCheapestProvider(this, _token, _amount, data);
        }

        function flashBorrowWithManyProviders(
            IFlashLender _lender,
            address _token,
            uint256 _amount,
            uint256 _minAmount
        ) public {
            uint256 allowance = IERC20(_token).allowance(
                address(this),
                address(_lender)
            );
            uint256 fee = _lender.flashFeeWithManyProviders(_token, _amount, _minAmount);
            uint256 repayment = _amount.add(fee);
            IERC20(_token).approve(address(_lender), allowance.add(repayment));
            bytes memory data = abi.encode(Action.NORMAL);
            _lender.flashLoanWithManyProviders(this, _token, _amount, data, _minAmount);
        }
    }

IFlashLender.sol

    pragma solidity ^0.8.0;

    import "./IERC3156FlashBorrower.sol";

    interface IFlashLender {
        function maxFlashLoanWithCheapestProvider(
            address token,
            uint256 minAmount
        ) external view returns (uint256);

        function flashFeeWithCheapestProvider(
            address token,
            uint256 minAmount
        ) external view returns (uint256);

        function flashLoanWithCheapestProvider(
            IERC3156FlashBorrower receiver,
            address token,
            uint256 amount,
            bytes calldata data
        ) external returns (bool);

        function maxFlashLoanWithManyProviders(
            address token,
            uint256 minAmount
        ) external view returns (uint256);

        function flashFeeWithManyProviders(
            address token,
            uint256 amount,
            uint256 minAmount
        ) external view returns (uint256);

        function flashLoanWithManyProviders(
            IERC3156FlashBorrower receiver,
            address token,
            uint256 amount,
            bytes calldata data,
            uint256 minAmount
        ) external returns (bool);
    }

IERC3156FlashBorrower.sol

    pragma solidity ^0.8.0;

    interface IERC3156FlashBorrower {
        function onFlashLoan(
            address initiator,
            address token,
            uint256 amount,
            uint256 fee,
            bytes calldata data
        ) external returns (bytes32);
    }

## Examples for executing FlashLender's functions

1. if you don't know how much maxloan/fee to use flashLoanWithCheapestProvider or  flashLoanWithManyProviders, you should use getFlashLoanInfoListWithCheaperFeePriority to get flashloan information list of providers in #writeContract of etherscan.io.
   
    If you want to get a flashloan information list(maxloan, fee1e18, feemaxloan)(explain in "Explanation of Flashlender's functions") of providers having maxloan of DAI token >= 1000 DAI as below:

        getFlashLoanInfoListWithCheaperFeePriority("0x6b175474e89094c44da98b954eedeac495271d0f", "1000000000000000000000")

        - maxloan[0]: 250000000000000000000000000
        - fee1e18[0]: 5000000000000000
        - feemaxloan[0]: 1250000000000000000000000
  
        - maxloan[1]: 34666573213559721749534644
        - fee1e18[1]: 5000000000000000
        - feemaxloan[1]: 173332866067798608747673
  
        ...

        - maxloan[21]: 205787945408162232501371
        - fee1e18[21]: 8009027081243732
        - feemaxloan[21]: 1648161227767477860103

2. If you want to borrow on the cheapest provider:
   
    2.a Get maxloan of the cheapest provider which has maxloan >= 1000 DAI

        maxFlashLoanWithCheapestProvider("0x6b175474e89094c44da98b954eedeac495271d0f", "1000000000000000000000")
        --> return: 250000000.000000000000000000 DAI
    
    2.b Get the cheapest fee of 250000000 DAI

        flashFeeWithCheapestProvider("0x6b175474e89094c44da98b954eedeac495271d0f", "250000000000000000000000000")
        --> return: 1250000.000000000000000000 DAI

    2.c Borrow 250000000 DAI on the cheapest provider

        flashLoanWithCheapestProvider(FlashLender.address, "0x6b175474e89094c44da98b954eedeac495271d0f", "250000000000000000000000000")

3. If you want to borrow on many providers:
   
    3.a Get maxloan of many providers which have maxloan >= 1000 DAI

        maxFlashLoanWithCheapestProvider("0x6b175474e89094c44da98b954eedeac495271d0f", "1000000000000000000000")
        --> return: 1561640514.396367875356244897 DAI
    
    3.b Get the cheapest fee of 1561640514.396367875356244897 DAI

        flashFeeWithCheapestProvider("0x6b175474e89094c44da98b954eedeac495271d0f", "1561640514396367875356244897")
        --> return: 8694933.980543179519311289 DAI
    
    3.c Borrow 1561640514.396367875356244897 DAI on many providers

        flashLoanWithCheapestProvider(FlashLender.address, "0x6b175474e89094c44da98b954eedeac495271d0f", "1561640514396367875356244897", "1000000000000000000000")

## Explanation of Flashlender's functions

1. getFlashLoanInfoListWithCheaperFeePriority:

	To get a list of liquididity providers which have maxloan >= _minAmount with the following priority: cheaper fee; bigger maxloan in case of the same fee.

	each provider includes:

		- maxloan
		- fee1e18(flashfee per 1e18 tokens(including decimals))
		- feemaxloan(flashfee per maxloan tokens(including decimals))

	- Inputs: 
  
	    address _token          : Borrowing token

	    uint256 _minAmount      : Minimum amount
	- Outputs:
  
		uint256[] maxloans      : Maxloan array

		uint256[] feePer1e18s   : FlashFee per 1e18 token(including decimals) array

		uint256[] feePerMaxLoans: FlashFee per maxloan token(including decimals) array

2. maxFlashLoanWithCheapestProvider:

	To get maxFlashLoan of provider which has maxloan >= _minAmount and the cheapest fee
	- Inputs: 

	    address _token          : Borrowing token

	    uint256 _minAmount      : Minimum amount
	- Outputs:

		uint256[] maxloan       : Maxloan

3. flashFeeWithCheapestProvider:
   
 	To get flashfee of provider which has maxloan >= _amount and the cheapest fee
	- Inputs: 

	    address _token          : Borrowing token

	    uint256 _amount         : Number of tokens to calculate flashfee
	- Outputs:

		uint256                 : Fee

4. flashLoanWithCheapestProvider:

 	To execute flashLoan of provider which has maxloan >= _minAmount and the cheapest fee
	- Inputs: 
  
        address _token          : Borrowing token

        uint256 _amount         : Number of tokens to borrow

        bytes calldata _data    : Refer to FlashBorrower
	- Outputs:

		bool                    : True

5. maxFlashLoanWithManyProviders:

	To get maxFlashLoan of many providers which have maxloan >= _minAmount and cheaper fee
	- Inputs: 
  
	    address _token          : Borrowing token

	    uint256 _minAmount      : Minimum amount
	- Outputs:

		uint256[] maxloan       : Maxloan

6. flashFeeWithManyProviders:

 	To get flashfee of provider which has: maxloan >= _amount and cheaper fee
	- Inputs: 
  
        address _token			: Borrowing token

        uint256 _amount         : Number of tokens to calculate flashfee

        uint256 _minAmount      : Minimum amount to get provider having maxloan >= _minAmount
	- Outputs:

		uint256                 : Fee

7. flashLoanWithManyProviders:

 	To execute flashLoan of many providers which have maxloan >= _minAmount and cheaper fee
	- Inputs: 

        IERC3156FlashBorrower _receiver : FlashBorrower

        address _token                  : Borrowing token

        uint256 _amount                 : Number of tokens to borrow

        bytes calldata _data            : Refer to FlashBorrower

        uint256 _minAmount              : Minimum amount
	- Outputs:
		bool                            : True