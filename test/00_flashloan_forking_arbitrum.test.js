const { expect } = require('chai');
const { ethers, network } = require('hardhat');
const helpers = require("@nomicfoundation/hardhat-network-helpers");
const { BigNumber } = require('ethers');
const config = require('../config/config.json')
const fs = require('fs')

const {
  chainIdByName,
} = require("../js-helpers/deploy");

describe('FlashLoan', () => {
  let user, usdcuser;
  let flashlender, flashborrower, pairPoolDAICount;
  const chainId = chainIdByName(network.name);
  console.log("chainId", chainId);
  const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'
  const ONE_ADDRESS = '0x1111111111111111111111111111111111111111'

  beforeEach(async () => {
    [owner, user] = await ethers.getSigners();
    pairPoolDAICount = BigNumber.from(0);
    await network.provider.request({
      method: "hardhat_reset",
      params: [
        {
          forking: {
            jsonRpcUrl: 'https://arbitrum-mainnet.infura.io/v3/51b37822bf064fdb8f0004abcabcfbba',
            ignoreUnknownTxType: true,
          },
        },
      ],
    });

    // token 
    const ERC20_ABI = require('../abi/IERC20.json');

    // wethAddress = "0x82af49447d8a07e3bd95bd0d56f35241523fbab1";
    // wethHolderAddress = "0xb7e50106a5bd3cf21af210a755f9c8740890a8c9"; 

    usdcAddress = "0xff970a61a04b1ca14834a43f5de4533ebddb5cc8";
    usdcHolderAddress = "0x1714400ff23db4af24f9fd64e7039e6597f18c2b"; 
    usdc = await ethers.getContractAt(ERC20_ABI, usdcAddress);
    // await hre.network.provider.request({
    //   method: 'hardhat_impersonateAccount',
    //   params: [wethHolderAddress]
    // })
    await helpers.impersonateAccount(usdcHolderAddress);
    usdcuser = await ethers.getSigner(usdcHolderAddress);
    // wethuser = await hre.ethers.provider.getSigner(wethHolderAddress)
    let lender = []
    // aave3
    if (config[chainId].aavev3_polygon.LendingPoolAddressProvider === ZERO_ADDRESS) {
      console.log('Error: LendingPoolAddressProvider = ', ZERO_ADDRESS)
    } else {
      const AaveV3FlashLender = await ethers.getContractFactory('AaveV3FlashLender');
      const AaveV3FlashLenderInstance = await AaveV3FlashLender.deploy(config[chainId].aavev3_arbitrum.LendingPoolAddressProvider);
      aavev3Lender = await AaveV3FlashLenderInstance.deployed();
      lender.push(aavev3Lender);
    }

    // uniswapv3
    const UniswapV3FlashLender = await ethers.getContractFactory("UniswapV3FlashLender")
    const UniswapV3FlashLenderInstance = await UniswapV3FlashLender.deploy();
    let uniswapv3Lender = await UniswapV3FlashLenderInstance.deployed();

    const rawPairsInfo_uniswapv3 = fs.readFileSync('./config/uniswapv3pair_arbitrum.json');
    const pairsInfo_uniswapv3 = JSON.parse(rawPairsInfo_uniswapv3);
    const pairsInfoLength_uniswapv3 = Object.keys(pairsInfo_uniswapv3).length;

    let tokens0_uniswapv3 = []
    let tokens1_uniswapv3 = []
    let pairs_uniswapv3 = []

    for (let i = 1; i <= pairsInfoLength_uniswapv3; i++) {
      tokens0_uniswapv3.push(pairsInfo_uniswapv3[i].tokens0);
      tokens1_uniswapv3.push(pairsInfo_uniswapv3[i].tokens1);
      pairs_uniswapv3.push(pairsInfo_uniswapv3[i].pairs);
    }

    await uniswapv3Lender.addPairs(tokens0_uniswapv3, tokens1_uniswapv3, pairs_uniswapv3)
    lender.push(uniswapv3Lender);

    // dodo
    const DODOFlashLender = await ethers.getContractFactory("DODOFlashLender")
    const DODOFlashLenderInstance = await DODOFlashLender.deploy();
    let dodoLender = await DODOFlashLenderInstance.deployed();

    const rawPairsInfo_dodo = fs.readFileSync('./config/dodopool_arbitrum.json');
    const pairsInfo_dodo = JSON.parse(rawPairsInfo_dodo);
    const pairsInfoLength_dodo = Object.keys(pairsInfo_dodo).length;

    let basetoken_dodo = []
    let quotetoken_dodo = []
    let pool_dodo = []

    for (let i = 1; i <= pairsInfoLength_dodo; i++) {
      basetoken_dodo.push(pairsInfo_dodo[i].basetoken);
      quotetoken_dodo.push(pairsInfo_dodo[i].quotetoken);
      pool_dodo.push(pairsInfo_dodo[i].pool);
    }

    await dodoLender.addPools(basetoken_dodo, quotetoken_dodo, pool_dodo);
    lender.push(dodoLender);


    // FlashLoan
    const FlashLender = await ethers.getContractFactory('FlashLender');
    flashlender = await FlashLender.deploy();
    for (let i = 0; i < lender.length; i++) {
      await lender[i].setFlashLoaner(flashlender.address);
    }
    lendersAddress = []
    for (let i = 0; i < lender.length; i++) {
      lendersAddress.push(lender[i].address);
    }
    await flashlender.addProviders(lendersAddress);

    // Borrower
    const FlashBorrower = await ethers.getContractFactory('FlashBorrower');
    flashborrower = await FlashBorrower.deploy();

    providerlength = await flashlender.getProviderLength();
    console.log("providerlength", providerlength.toString());
  });

  it("check operator", async function () {
    expect(await flashlender.operator()).to.equal(owner.address);
    await expect(flashlender.connect(user).setOperator(user.address)).to.revertedWith('FlashLender: Not operator');
    await flashlender.setOperator(user.address);
    expect(await flashlender.operator()).to.equal(user.address);
  });

  it("add/removeProviders", async function () {
    //add
    await expect(flashlender.connect(user).addProviders([ONE_ADDRESS])).to.revertedWith('FlashLender: Not operator');
    await expect(flashlender.addProviders([ZERO_ADDRESS])).to.revertedWith('FlashLender: provider address is zero address!');
    await expect(flashlender.connect(user).getProviderLength()).to.revertedWith('FlashLender: Not operator');

    beforeProviderLength = await flashlender.getProviderLength();
    await flashlender.addProviders([ONE_ADDRESS]);
    afterProviderLength = await flashlender.getProviderLength();
    await expect(beforeProviderLength.add(1)).eq(afterProviderLength);

    beforeProviderLength = await flashlender.getProviderLength();
    await flashlender.addProviders([ONE_ADDRESS]);
    afterProviderLength = await flashlender.getProviderLength();
    await expect(beforeProviderLength).eq(afterProviderLength);

    //remove
    await expect(flashlender.connect(user).removeProviders([ONE_ADDRESS])).to.revertedWith('FlashLender: Not operator');

    beforeProviderLength = await flashlender.getProviderLength();
    await flashlender.removeProviders([ONE_ADDRESS]);
    afterProviderLength = await flashlender.getProviderLength();
    await expect(beforeProviderLength).eq(afterProviderLength.add(1));

    beforeProviderLength = await flashlender.getProviderLength();
    await flashlender.removeProviders([ONE_ADDRESS]);
    afterProviderLength = await flashlender.getProviderLength();
    await expect(beforeProviderLength).eq(afterProviderLength);

  });

  it('getFlashLoanInfoListWithCheaperFeePriority', async function () {
    [maxloans, fee1e18s, feeMaxLoans] = await flashlender.getFlashLoanInfoListWithCheaperFeePriority(usdc.address, "1000000000", { gasLimit: 30000000 });
    console.log("maxloans.length", maxloans.length);
    if (maxloans.length > 1) {
      for (let i = 0; i < maxloans.length - 1; i++) {
        expect(fee1e18s[i]).to.lte(fee1e18s[i + 1]);
        if (fee1e18s[i] == fee1e18s[i + 1]) {
          expect(maxloans[i]).to.gte(maxloans[i + 1]);
        }
      }
    }
  });

  it('maxFlashLoan', async function () {
    [maxloans, fee1e18s, feeMaxLoans] = await flashlender.getFlashLoanInfoListWithCheaperFeePriority(usdc.address, 1, { gasLimit: 30000000 });
    console.log("maxloans.length", maxloans.length);
    let maxloan = BigNumber.from(0);
    let max = BigNumber.from(0);
    for (let i = 0; i < maxloans.length; i++) {
      maxloan = maxloan.add(maxloans[i]);
      if (max.lt(maxloans[i])) {
        max = maxloans[i];
      }
    }

    let usdcmaxloancheapest = await flashlender.maxFlashLoanWithCheapestProvider(usdc.address, 1);
    console.log("usdcmaxloancheapest", usdcmaxloancheapest.toString());
    expect(maxloans[0]).to.equal(usdcmaxloancheapest);
    let usdcmaxloan = await flashlender.maxFlashLoanWithManyProviders(usdc.address, 1);
    console.log("usdcmaxloan", usdcmaxloan.toString());
    expect(maxloan).to.equal(usdcmaxloan);

    usdcmaxloancheapest = await flashlender.maxFlashLoanWithCheapestProvider(usdc.address, max);
    console.log("usdcmaxloancheapest", usdcmaxloancheapest.toString());
    expect(max).to.equal(usdcmaxloancheapest);

    let max2 = BigNumber.from(0);
    for (let i = 0; i < maxloans.length; i++) {
      if (max == maxloans[i]) {
        max2 = max2.add(maxloans[i]);
      }
    }
    usdcmaxloan = await flashlender.maxFlashLoanWithManyProviders(usdc.address, max);
    console.log("usdcmaxloan", usdcmaxloan.toString());
    expect(max2).to.equal(usdcmaxloan);

    await expect(flashlender.maxFlashLoanWithCheapestProvider(usdc.address, max.add(1), { gasLimit: 30000000 })).to.revertedWith('FlashLender: Found no provider');
    await expect(flashlender.maxFlashLoanWithManyProviders(usdc.address, max.add(1), { gasLimit: 30000000 })).to.revertedWith('FlashLender: Found no provider');
  });

  it('flashFee', async function () {
    [maxloans, fee1e18s, feeMaxLoans] = await flashlender.getFlashLoanInfoListWithCheaperFeePriority(usdc.address, 1, { gasLimit: 30000000 });

    let fee = BigNumber.from(0);
    let maxloan = BigNumber.from(0);
    let max = BigNumber.from(0);
    for (let i = 0; i < feeMaxLoans.length; i++) {
      fee = fee.add(feeMaxLoans[i]);
      maxloan = maxloan.add(maxloans[i]);
      if (max.lt(maxloans[i])) {
        max = maxloans[i];
      }
    }

    let usdcfeecheapest = await flashlender.flashFeeWithCheapestProvider(usdc.address, maxloans[0]);
    console.log("usdcfeecheapest", usdcfeecheapest.toString());
    expect(feeMaxLoans[0]).to.equal(usdcfeecheapest);
    let usdcfee = await flashlender.flashFeeWithManyProviders(usdc.address, maxloan, 1);
    console.log("usdcfee", usdcfee.toString());
    expect(fee.add(maxloans.length)).to.equal(usdcfee);

    await expect(flashlender.flashFeeWithCheapestProvider(usdc.address, max.add(1), { gasLimit: 30000000 })).to.revertedWith('FlashLender: Found no provider');
    await expect(flashlender.flashFeeWithManyProviders(usdc.address, maxloan, max.add(1), { gasLimit: 30000000 })).to.revertedWith('FlashLender: Found no provider');
    await expect(flashlender.flashFeeWithManyProviders(usdc.address, maxloan.add(1), 1, { gasLimit: 30000000 })).to.revertedWith('FlashLender: Amount is more than maxFlashLoan');
  });

  it('flashLoanWithCheapestProvider', async () => {
    beforeETH = await ethers.provider.getBalance(user.address);

    const maxloanWithCheapestProvider = await flashlender.maxFlashLoanWithCheapestProvider(usdc.address, 1, { gasLimit: 30000000 });
    const feeWithCheapestProvider = await flashlender.flashFeeWithCheapestProvider(usdc.address, maxloanWithCheapestProvider, { gasLimit: 30000000 });
    await usdc.connect(usdcuser).transfer(flashborrower.address, feeWithCheapestProvider, { gasLimit: 30000000 });
    console.log("maxloanWithCheapestProvider", maxloanWithCheapestProvider.toString());
    console.log("feeWithCheapestProvider", feeWithCheapestProvider.toString());
    await flashborrower.connect(user).flashBorrowWithCheapestProvider(flashlender.address, usdc.address, maxloanWithCheapestProvider, { gasLimit: 30000000 });
    const totalFlashBalanceWithCheapestProvider = await flashborrower.totalFlashBalance();
    expect(totalFlashBalanceWithCheapestProvider).to.equal(maxloanWithCheapestProvider.add(feeWithCheapestProvider));

    afterETH = await ethers.provider.getBalance(user.address);
    console.log("afterETH", afterETH.toString());
    let feeETH = ethers.BigNumber.from(beforeETH).sub(afterETH);
    console.log("feeETH", feeETH.toString());
  });

  it('Invalid case - flashLoanWithCheapestProvider', async () => {
    [maxloans, fee1e18s, feeMaxLoans] = await flashlender.getFlashLoanInfoListWithCheaperFeePriority(usdc.address, 1, { gasLimit: 30000000 });

    let maxloan = BigNumber.from(0);
    for (let i = 0; i < feeMaxLoans.length; i++) {
      if (maxloan.lt(maxloans[i])) {
        maxloan = maxloans[i];
      }
    }
    await expect(flashborrower.connect(user).flashBorrowWithCheapestProvider(flashlender.address, usdc.address, maxloan.add(1), { gasLimit: 30000000 })).to.revertedWith('FlashLender: Found no provider');
  });

  it('flashLoanWithManyProviders', async () => {
    beforeETH = await ethers.provider.getBalance(user.address);

    [maxloans, fee1e18s, feeMaxLoans] = await flashlender.getFlashLoanInfoListWithCheaperFeePriority(usdc.address, 1, { gasLimit: 30000000 });

    let maxloan = BigNumber.from(0);
    for (let i = 0; i < feeMaxLoans.length; i++) {
      if (maxloan.lt(maxloans[i])) {
        maxloan = maxloans[i];
      }
    }

    const maxloanWithManyProviders = await flashlender.maxFlashLoanWithManyProviders(usdc.address, 1, { gasLimit: 30000000 });
    const feeWithManyProviders = await flashlender.flashFeeWithManyProviders(usdc.address, maxloanWithManyProviders, 1, { gasLimit: 30000000 });
    console.log("maxloanWithManyProviders", maxloanWithManyProviders.toString());
    console.log("feeWithManyProviders", feeWithManyProviders.toString());
    console.log("maxloans.length", maxloans.length.toString());
    await usdc.connect(usdcuser).transfer(flashborrower.address, feeWithManyProviders, { gasLimit: 30000000 });
    await flashborrower.connect(user).flashBorrowWithManyProviders(flashlender.address, usdc.address, maxloanWithManyProviders, 1, { gasLimit: 30000000 });
    const totalFlashBalanceWithManyProviders = await flashborrower.totalFlashBalance();
    console.log("totalFlashBalanceWithManyProviders", totalFlashBalanceWithManyProviders.toString());
    console.log("maxloanWithManyProviders.add(feeWithManyProviders)", maxloanWithManyProviders.add(feeWithManyProviders).toString());
    expect(totalFlashBalanceWithManyProviders).to.lte(maxloanWithManyProviders.add(feeWithManyProviders));
    expect(totalFlashBalanceWithManyProviders).to.gte(maxloanWithManyProviders.add(feeWithManyProviders).sub(maxloans.length).sub(maxloans.length));

    afterETH = await ethers.provider.getBalance(user.address);
    console.log("afterETH", afterETH.toString());
    let feeETH = ethers.BigNumber.from(beforeETH).sub(afterETH);
    console.log("feeETH", feeETH.toString());
  });

  it('Invalid cases - flashLoanWithManyProviders', async () => {
    [maxloans, fee1e18s, feeMaxLoans] = await flashlender.getFlashLoanInfoListWithCheaperFeePriority(usdc.address, 1, { gasLimit: 30000000 });

    let maxloan = BigNumber.from(0);
    for (let i = 0; i < feeMaxLoans.length; i++) {
      if (maxloan.lt(maxloans[i])) {
        maxloan = maxloans[i];
      }
    }

    const maxloanWithManyProviders = await flashlender.maxFlashLoanWithManyProviders(usdc.address, 1, { gasLimit: 30000000 });

    await expect(flashborrower.connect(user).flashBorrowWithManyProviders(flashlender.address, usdc.address, maxloan.add(1), maxloan.add(1), { gasLimit: 30000000 })).to.revertedWith('FlashLender: Found no provider');

    await expect(flashborrower.connect(user).flashBorrowWithManyProviders(flashlender.address, usdc.address, maxloanWithManyProviders.add(1), 1, { gasLimit: 30000000 })).to.revertedWith('FlashLender: Amount is more than maxFlashLoan');
  });
});