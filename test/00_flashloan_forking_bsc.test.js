const { expect } = require('chai');
const { ethers, network } = require('hardhat');
const { BigNumber } = require('ethers');
const config = require('../config/config.json')
const fs = require('fs')

const {
  chainIdByName,
} = require("../js-helpers/deploy");

describe('FlashLoan', () => {
  let user;
  let weth, busd;
  let flashlender, flashborrower, pairPoolDAICount, pairPoolETHCount;
  const chainId = chainIdByName(network.name);
  console.log("chainId", chainId);

  beforeEach(async () => {
    [owner, user, feeTo] = await ethers.getSigners();
    pairPoolDAICount = BigNumber.from(0);
    pairPoolETHCount = BigNumber.from(0);
    await network.provider.request({
      method: "hardhat_reset",
      params: [
        {
          forking: {
            jsonRpcUrl: "https://bsc-dataseed4.binance.org"
          },
        },
      ],
    });

    // token 
    const ERC20_ABI = require('../contracts/providers/aaveV2/abi/IERC20.json');

    busdAddress = "0xe9e7cea3dedca5984780bafc599bd69add087d56";
    busdHolderAddress = "0x8894e0a0c962cb723c1976a4421c95949be2d4e3";
    busd = await ethers.getContractAt(ERC20_ABI, busdAddress);
    await hre.network.provider.request({
      method: 'hardhat_impersonateAccount',
      params: [busdHolderAddress]
    })
    busduser = await hre.ethers.provider.getSigner(busdHolderAddress)

    // wethHolderAddress = "0x1c11ba15939e1c16ec7ca1678df6160ea2063bc5";
    // wethAddress = "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2";
    // weth = await ethers.getContractAt(ERC20_ABI, wethAddress);
    // await hre.network.provider.request({
    //   method: 'hardhat_impersonateAccount',
    //   params: [wethHolderAddress]
    // })
    // wethuser = await hre.ethers.provider.getSigner(wethHolderAddress)

    // fortube
    const FortubeFlashLender = await ethers.getContractFactory("FortubeFlashLender")
    const FortubeFlashLenderInstance = await FortubeFlashLender.deploy(config[chainId].fortube_bsc.Bank, config[chainId].fortube_bsc.BankController);
    let fortubeLender = await FortubeFlashLenderInstance.deployed();

    // multiplier
    const MultiplierFlashLender = await ethers.getContractFactory("MultiplierFlashLender")
    const MultiplierFlashLenderInstance = await MultiplierFlashLender.deploy(config[chainId].multiplier.LendingPool);
    let multiplierLender = await MultiplierFlashLenderInstance.deployed();

    // pancakeswap
    const PancakeswapFlashLender = await ethers.getContractFactory("PancakeswapFlashLender")
    const PancakeswapFlashLenderInstance = await PancakeswapFlashLender.deploy();
    let pancakeswapLender = await PancakeswapFlashLenderInstance.deployed();

    const rawPairsInfo_pancakeswap = fs.readFileSync('./config/pancakeswappair.json');
    const pairsInfo_pancakeswap = JSON.parse(rawPairsInfo_pancakeswap);
    const pairsInfoLength_pancakeswap = Object.keys(pairsInfo_pancakeswap).length;

    let tokens0_pancakeswap = []
    let tokens1_pancakeswap = []
    let pairs_pancakeswap = []

    for (let i = 1; i <= pairsInfoLength_pancakeswap; i++) {
      tokens0_pancakeswap.push(pairsInfo_pancakeswap[i].tokens0);
      tokens1_pancakeswap.push(pairsInfo_pancakeswap[i].tokens1);
      pairs_pancakeswap.push(pairsInfo_pancakeswap[i].pairs);
    }

    await pancakeswapLender.addPairs(tokens0_pancakeswap, tokens1_pancakeswap, pairs_pancakeswap);

    //creamfinance
    const CreamFinanceFlashLender = await ethers.getContractFactory("CreamFinanceFlashLender")
    const CreamFinanceFlashLenderInstance = await CreamFinanceFlashLender.deploy();
    let creamfinanceLender = await CreamFinanceFlashLenderInstance.deployed();

    const rawCtoken_creamfinance = fs.readFileSync('./config/creamfinancectoken.json');
    const ctokenInfo_creamfinance = JSON.parse(rawCtoken_creamfinance);
    const ctokenInfoLength_creamfinance = Object.keys(ctokenInfo_creamfinance).length;

    let ctoken_creamfinance = []
    let underlying_creamfinance = []

    for (let i = 1; i <= ctokenInfoLength_creamfinance; i++) {
      ctoken_creamfinance.push(ctokenInfo_creamfinance[i].ctoken);
      underlying_creamfinance.push(ctokenInfo_creamfinance[i].underlying);
    }

    await creamfinanceLender.addCTokens(ctoken_creamfinance, underlying_creamfinance);

    // FlashLoan
    const FlashLender = await ethers.getContractFactory('FlashLender');
    flashlender = await FlashLender.deploy(feeTo.address);

    await flashlender.addProviders([creamfinanceLender.address]);

    // Borrower
    const FlashBorrower = await ethers.getContractFactory('FlashBorrower');
    flashborrower = await FlashBorrower.deploy();
  });

  it("check factory", async function () {
    expect(await flashlender.factory()).to.equal(owner.address);
    await expect(flashlender.connect(user).setFactory(user.address)).to.revertedWith('FlashLender: Not factory');
    await flashlender.setFactory(user.address);
    expect(await flashlender.factory()).to.equal(user.address);
  });

  it("check feeTo", async function () {
    expect(await flashlender.FEETO()).to.equal(feeTo.address);
    await expect(flashlender.connect(user).setFeeTo(user.address)).to.revertedWith('FlashLender: Not factory');
    await flashlender.setFeeTo(user.address);
    expect(await flashlender.FEETO()).to.equal(user.address);
  });

  it('flash supply', async function () {
    [maxloans, fee1e18s, feeMaxLoans] = await flashlender.getFlashLoanInfoListWithCheaperFeePriority(busd.address, 1, { gasLimit: 30000000 });

    let maxloan = BigNumber.from(0);
    for (let i = 0; i < maxloans.length; i++) {
      console.log("maxloans", maxloans[i].toString());
      console.log("fee1e18s", fee1e18s[i].toString());
      console.log("feeMaxLoans", feeMaxLoans[i].toString());
      maxloan = maxloan.add(maxloans[i]);
    }

    let busdMaxloancheapest = await flashlender.maxFlashLoanWithCheapestProvider(busd.address, 1);
    console.log("daimaxloancheapest", busdMaxloancheapest.toString());
    expect(maxloans[0]).to.equal(busdMaxloancheapest);
    let busdmaxloan = await flashlender.maxFlashLoanWithManyProviders(busd.address, 1);
    console.log("daimaxloan", busdmaxloan.toString());
    expect(maxloan).to.equal(busdmaxloan);
  });

  it('flash fee', async function () {
    [maxloans, fee1e18s, feeMaxLoans] = await flashlender.getFlashLoanInfoListWithCheaperFeePriority(busd.address, 1, { gasLimit: 30000000 });

    let fee = BigNumber.from(0);
    let maxloan = BigNumber.from(0);
    for (let i = 0; i < feeMaxLoans.length; i++) {
      console.log("maxloans", maxloans[i].toString());
      console.log("fee1e18s", fee1e18s[i].toString());
      console.log("feeMaxLoans", feeMaxLoans[i].toString());
      fee = fee.add(feeMaxLoans[i]);
      maxloan = maxloan.add(maxloans[i]);
    }

    let busdFeecheapest = await flashlender.flashFeeWithCheapestProvider(busd.address, maxloans[0]);
    console.log("daifeecheapest", busdFeecheapest.toString());
    expect(feeMaxLoans[0]).to.equal(busdFeecheapest);
    let busdFee = await flashlender.flashFeeWithManyProviders(busd.address, maxloan, 1);
    console.log("daifee", busdFee.toString());
    expect(fee.add(maxloans.length)).to.equal(busdFee);
  });

  it('flashLoanWithCheapestProvider', async () => {
    const maxloanWithCheapestProvider = await flashlender.maxFlashLoanWithCheapestProvider(busd.address, 1, { gasLimit: 30000000 });
    const feeWithCheapestProvider = await flashlender.flashFeeWithCheapestProvider(busd.address, maxloanWithCheapestProvider, { gasLimit: 30000000 });
    const balanceBeforeFeeToWithCheapestProvider = await busd.balanceOf(feeTo.address);
    await busd.connect(busduser).transfer(flashborrower.address, feeWithCheapestProvider, { gasLimit: 30000000 });
    console.log("maxloanWithCheapestProvider", maxloanWithCheapestProvider.toString());
    console.log("feeWithCheapestProvider", feeWithCheapestProvider.toString());
    await flashborrower.connect(user).flashBorrowWithCheapestProvider(flashlender.address, busd.address, maxloanWithCheapestProvider, { gasLimit: 30000000 });
    const totalFlashBalanceWithCheapestProvider = await flashborrower.totalFlashBalance();
    expect(totalFlashBalanceWithCheapestProvider).to.equal(maxloanWithCheapestProvider.add(feeWithCheapestProvider));
    const balanceAfterFeeToWithCheapestProvider = await busd.balanceOf(feeTo.address);
    expect(balanceAfterFeeToWithCheapestProvider.sub(balanceBeforeFeeToWithCheapestProvider)).to.equal(maxloanWithCheapestProvider.mul(5).div(1000));
  });

  it('flashLoanWithManyProviders', async () => {
    [maxloans, fee1e18s, feeMaxLoans] = await flashlender.getFlashLoanInfoListWithCheaperFeePriority(busd.address, 1, { gasLimit: 30000000 });

    let fee = BigNumber.from(0);
    let maxloan = BigNumber.from(0);
    for (let i = 0; i < feeMaxLoans.length; i++) {
      console.log("maxloans", maxloans[i].toString());
      console.log("fee1e18s", fee1e18s[i].toString());
      console.log("feeMaxLoans", feeMaxLoans[i].toString());
      fee = fee.add(feeMaxLoans[i]);
      maxloan = maxloan.add(maxloans[i]);
    }
    const maxloanWithManyProviders = await flashlender.maxFlashLoanWithManyProviders(busd.address, 1, { gasLimit: 30000000 });
    const feeWithManyProviders = await flashlender.flashFeeWithManyProviders(busd.address, maxloanWithManyProviders, 1, { gasLimit: 30000000 });
    const balanceBeforeFeeToWithManyProviders = await busd.balanceOf(feeTo.address);
    console.log("maxloanWithManyProviders", maxloanWithManyProviders.toString());
    console.log("feeWithManyProviders", feeWithManyProviders.toString());
    console.log("maxloans.length", maxloans.length.toString());
    await busd.connect(busduser).transfer(flashborrower.address, feeWithManyProviders, { gasLimit: 30000000 });
    await flashborrower.connect(user).flashBorrowWithManyProviders(flashlender.address, busd.address, maxloanWithManyProviders, 1, { gasLimit: 30000000 });
    const totalFlashBalanceWithManyProviders = await flashborrower.totalFlashBalance();
    console.log("totalFlashBalanceWithManyProviders", totalFlashBalanceWithManyProviders.toString());
    console.log("maxloanWithManyProviders.add(feeWithManyProviders)", maxloanWithManyProviders.add(feeWithManyProviders).toString());
    expect(totalFlashBalanceWithManyProviders).to.lte(maxloanWithManyProviders.add(feeWithManyProviders));
    expect(totalFlashBalanceWithManyProviders).to.gte(maxloanWithManyProviders.add(feeWithManyProviders).sub(maxloans.length).sub(maxloans.length));
    const balanceAfterFeeToWithManyProviders = await busd.balanceOf(feeTo.address);
    expect(balanceAfterFeeToWithManyProviders.sub(balanceBeforeFeeToWithManyProviders)).to.lte(maxloanWithManyProviders.mul(5).div(1000).add(maxloans.length));
    expect(balanceAfterFeeToWithManyProviders.sub(balanceBeforeFeeToWithManyProviders)).to.gte(maxloanWithManyProviders.mul(5).div(1000).sub(maxloans.length));
  });
});