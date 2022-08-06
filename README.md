# metaflash

Explanation of functions:

A. FlashBorrower
1. flashBorrowWithCheapestProvider: 
	To execute flashBorrow on the provider which has maxloan >= _amount and has the cheapest fee
	- Inputs: 
		IFlashLender _lender    : FlashLender
	    address _token          : Borrowing token
	    uint256 _amount         : Number of tokens to borrow

2. flashBorrowWithManyProviders: 
	To execute flashBorrow on many providers which have maxloan >= _minAmount and have cheaper fee.
	When using this function, onFlashLoan function in FlashBorrower will be executed many times beacause of calling many providers. So, only use this function if the onFlashLoan can work independently when calling many times for each flashloan
	- Inputs: 
		IFlashLender _lender    : FlashLender
	    address _token          : Borrowing token
	    uint256 _amount         : Number of tokens to borrow
	    uint256 _minAmount      : Minimum amount


B. Flashlender
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
		uint256[] maxloan       : Maxloan

4. flashLoanWithCheapestProvider:
 	To execute flashLoan of provider which has maxloan >= _minAmount and the cheapest fee
	- Inputs: 
        address _token          : Borrowing token
        uint256 _amount         : Number of tokens to borrow
        bytes calldata _data    : Refer to FlashBorrower
	- Outputs:
		bool

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
		bool                    : True

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