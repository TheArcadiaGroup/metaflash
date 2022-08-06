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
  let weth, dai;
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
            jsonRpcUrl: "https://mainnet.infura.io/v3/51b37822bf064fdb8f0004abcabcfbba"
          },
        },
      ],
    });

    // token 
    const ERC20_ABI = require('../contracts/providers/aaveV2/abi/IERC20.json');

    daiAddress = "0x6b175474e89094c44da98b954eedeac495271d0f";
    daiHolderAddress = "0x075e72a5eDf65F0A5f44699c7654C1a76941Ddc8";
    dai = await ethers.getContractAt(ERC20_ABI, daiAddress);
    await hre.network.provider.request({
      method: 'hardhat_impersonateAccount',
      params: [daiHolderAddress]
    })
    daiuser = await hre.ethers.provider.getSigner(daiHolderAddress)

    wethHolderAddress = "0x1c11ba15939e1c16ec7ca1678df6160ea2063bc5";
    wethAddress = "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2";
    weth = await ethers.getContractAt(ERC20_ABI, wethAddress);
    await hre.network.provider.request({
      method: 'hardhat_impersonateAccount',
      params: [wethHolderAddress]
    })
    wethuser = await hre.ethers.provider.getSigner(wethHolderAddress)

    // aave2
    const AaveV2FlashLender = await ethers.getContractFactory('AaveV2FlashLender');
    const AaveV2FlashLenderInstance = await AaveV2FlashLender.deploy(config[chainId].aavev2.LendingPoolAddressProvider);
    let aavev2Lender = await AaveV2FlashLenderInstance.deployed();


    // dydx
    const DYDXFlashLender = await ethers.getContractFactory("DYDXFlashLender")
    const DYDXFlashLenderInstance = await DYDXFlashLender.deploy(config[chainId].dydx.SoloMargin);
    let dydxLender = await DYDXFlashLenderInstance.deployed();

    // uniswapv2
    const UniswapV2FlashLender = await ethers.getContractFactory("UniswapV2FlashLender")
    const UniswapV2FlashLenderInstance = await UniswapV2FlashLender.deploy();
    let uniswapv2Lender = await UniswapV2FlashLenderInstance.deployed();

    const rawPairsInfo_uniswapv2 = fs.readFileSync('./config/uniswapv2pair.json');
    const pairsInfo_uniswapv2 = JSON.parse(rawPairsInfo_uniswapv2);
    const pairsInfoLength_uniswapv2 = Object.keys(pairsInfo_uniswapv2).length;

    let tokens0_uniswapv2 = []
    let tokens1_uniswapv2 = []
    let pairs_uniswapv2 = []

    for (let i = 1; i <= pairsInfoLength_uniswapv2; i++) {
      tokens0_uniswapv2.push(pairsInfo_uniswapv2[i].tokens0);
      tokens1_uniswapv2.push(pairsInfo_uniswapv2[i].tokens1);
      pairs_uniswapv2.push(pairsInfo_uniswapv2[i].pairs);
    }

    await uniswapv2Lender.addPairs(tokens0_uniswapv2, tokens1_uniswapv2, pairs_uniswapv2);

    // uniswapv3
    const UniswapV3FlashLender = await ethers.getContractFactory("UniswapV3FlashLender")
    const UniswapV3FlashLenderInstance = await UniswapV3FlashLender.deploy();
    let uniswapv3Lender = await UniswapV3FlashLenderInstance.deployed();

    const rawPairsInfo_uniswapv3 = fs.readFileSync('./config/uniswapv3pair.json');
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

    // makerdao
    const MakerDaoFlashLender = await ethers.getContractFactory("MakerDaoFlashLender")
    const MakerDaoFlashLenderInstance = await MakerDaoFlashLender.deploy(config[chainId].makerdao.DssFlash);
    let makerdaoLender = await MakerDaoFlashLenderInstance.deployed();

    // saddlefinance
    const SaddleFinanceFlashLender = await ethers.getContractFactory("SaddleFinanceFlashLender")
    const SaddleFinanceFlashLenderInstance = await SaddleFinanceFlashLender.deploy();
    let saddlefinanceLender = await SaddleFinanceFlashLenderInstance.deployed();

    const rawPoolsInfo_saddlefinance = fs.readFileSync('./config/saddlefinancepool.json');
    const poolsInfo_saddlefinance = JSON.parse(rawPoolsInfo_saddlefinance);
    const poolsInfoLength_saddlefinance = Object.keys(poolsInfo_saddlefinance).length;

    let pools_saddlefinance = []
    for (let i = 1; i <= poolsInfoLength_saddlefinance; i++) {
      pools_saddlefinance.push(poolsInfo_saddlefinance[i].pools);
    }

    await saddlefinanceLender.addPools(pools_saddlefinance);

    // defiswap
    const CroDefiSwapFlashLender = await ethers.getContractFactory("CroDefiSwapFlashLender")
    const CroDefiSwapFlashLenderInstance = await CroDefiSwapFlashLender.deploy(config[chainId].defiswap.Factory);
    let defiswapLender = await CroDefiSwapFlashLenderInstance.deployed()

    const rawPairsInfo_defiswap = fs.readFileSync('./config/defiswappair.json');
    const pairsInfo_defiswap = JSON.parse(rawPairsInfo_defiswap);
    const pairsInfoLength_defiswap = Object.keys(pairsInfo_defiswap).length;

    let tokens0_defiswap = []
    let tokens1_defiswap = []
    let pairs_defiswap = []

    for (let i = 1; i <= pairsInfoLength_defiswap; i++) {
      tokens0_defiswap.push(pairsInfo_defiswap[i].tokens0);
      tokens1_defiswap.push(pairsInfo_defiswap[i].tokens1);
      pairs_defiswap.push(pairsInfo_defiswap[i].pairs);
    }

    await defiswapLender.addPairs(tokens0_defiswap, tokens1_defiswap, pairs_defiswap);

    // fortube
    const FortubeFlashLender = await ethers.getContractFactory("FortubeFlashLender")
    const FortubeFlashLenderInstance = await FortubeFlashLender.deploy(config[chainId].fortube_eth.Bank, config[chainId].fortube_eth.BankController);
    let fortubeLender = await FortubeFlashLenderInstance.deployed();

    // euler
    const EulerFlashLender = await ethers.getContractFactory("EulerFlashLender")
    const EulerFlashLenderInstance = await EulerFlashLender.deploy(config[chainId].euler.FlashLoan);
    let eulerLender = await EulerFlashLenderInstance.deployed();

    // FlashLoan
    const FlashLender = await ethers.getContractFactory('FlashLender');
    flashlender = await FlashLender.deploy(feeTo.address);

    await flashlender.addProviders([aavev2Lender.address, dydxLender.address, uniswapv2Lender.address, uniswapv3Lender.address, makerdaoLender.address, saddlefinanceLender.address, defiswapLender.address, fortubeLender.address, eulerLender.address]);

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
    [maxloans, fee1e18s, feeMaxLoans] = await flashlender.getFlashLoanInfoListWithCheaperFeePriority(dai.address, 1, { gasLimit: 30000000 });

    let maxloan = BigNumber.from(0);
    for (let i = 0; i < maxloans.length; i++) {
      console.log("maxloans", maxloans[i].toString());
      console.log("fee1e18s", fee1e18s[i].toString());
      console.log("feeMaxLoans", feeMaxLoans[i].toString());
      maxloan = maxloan.add(maxloans[i]);
    }

    let daimaxloancheapest = await flashlender.maxFlashLoanWithCheapestProvider(dai.address, 1);
    console.log("daimaxloancheapest", daimaxloancheapest.toString());
    expect(maxloans[0]).to.equal(daimaxloancheapest);
    let daimaxloan = await flashlender.maxFlashLoanWithManyProviders(dai.address, 1);
    console.log("daimaxloan", daimaxloan.toString());
    expect(maxloan).to.equal(daimaxloan);
  });

  it('flash fee', async function () {
    [maxloans, fee1e18s, feeMaxLoans] = await flashlender.getFlashLoanInfoListWithCheaperFeePriority(dai.address, 1, { gasLimit: 30000000 });

    let fee = BigNumber.from(0);
    let maxloan = BigNumber.from(0);
    for (let i = 0; i < feeMaxLoans.length; i++) {
      console.log("maxloans", maxloans[i].toString());
      console.log("fee1e18s", fee1e18s[i].toString());
      console.log("feeMaxLoans", feeMaxLoans[i].toString());
      fee = fee.add(feeMaxLoans[i]);
      maxloan = maxloan.add(maxloans[i]);
    }

    let daifeecheapest = await flashlender.flashFeeWithCheapestProvider(dai.address, maxloans[0]);
    console.log("daifeecheapest", daifeecheapest.toString());
    expect(feeMaxLoans[0]).to.equal(daifeecheapest);
    let daifee = await flashlender.flashFeeWithManyProviders(dai.address, maxloan, 1);
    console.log("daifee", daifee.toString());
    expect(fee.add(maxloans.length)).to.equal(daifee);
  });

  it('flashLoanWithCheapestProvider', async () => {
    beforeETH = await ethers.provider.getBalance(user.address);

    const maxloanWithCheapestProvider = await flashlender.maxFlashLoanWithCheapestProvider(weth.address, 1, { gasLimit: 30000000 });
    const feeWithCheapestProvider = await flashlender.flashFeeWithCheapestProvider(weth.address, maxloanWithCheapestProvider, { gasLimit: 30000000 });
    const balanceBeforeFeeToWithCheapestProvider = await weth.balanceOf(feeTo.address);
    await weth.connect(wethuser).transfer(flashborrower.address, feeWithCheapestProvider, { gasLimit: 30000000 });
    console.log("maxloanWithCheapestProvider", maxloanWithCheapestProvider.toString());
    console.log("feeWithCheapestProvider", feeWithCheapestProvider.toString());
    await flashborrower.connect(user).flashBorrowWithCheapestProvider(flashlender.address, weth.address, maxloanWithCheapestProvider, { gasLimit: 30000000 });
    const totalFlashBalanceWithCheapestProvider = await flashborrower.totalFlashBalance();
    expect(totalFlashBalanceWithCheapestProvider).to.equal(maxloanWithCheapestProvider.add(feeWithCheapestProvider));
    const balanceAfterFeeToWithCheapestProvider = await weth.balanceOf(feeTo.address);
    expect(balanceAfterFeeToWithCheapestProvider.sub(balanceBeforeFeeToWithCheapestProvider)).to.equal(maxloanWithCheapestProvider.mul(5).div(1000));
    
    afterETH = await ethers.provider.getBalance(user.address);
    console.log("afterETH", afterETH.toString());
    let feeETH = ethers.BigNumber.from(beforeETH).sub(afterETH);
    console.log("feeETH", feeETH.toString());
  });

  it('flashLoanWithManyProviders', async () => {
    beforeETH = await ethers.provider.getBalance(user.address);

    [maxloans, fee1e18s, feeMaxLoans] = await flashlender.getFlashLoanInfoListWithCheaperFeePriority(dai.address, 1, { gasLimit: 30000000 });

    let fee = BigNumber.from(0);
    let maxloan = BigNumber.from(0);
    for (let i = 0; i < feeMaxLoans.length; i++) {
      console.log("maxloans", maxloans[i].toString());
      console.log("fee1e18s", fee1e18s[i].toString());
      console.log("feeMaxLoans", feeMaxLoans[i].toString());
      fee = fee.add(feeMaxLoans[i]);
      maxloan = maxloan.add(maxloans[i]);
    }
    const maxloanWithManyProviders = await flashlender.maxFlashLoanWithManyProviders(dai.address, 1, { gasLimit: 30000000 });
    const feeWithManyProviders = await flashlender.flashFeeWithManyProviders(dai.address, maxloanWithManyProviders, 1, { gasLimit: 30000000 });
    const balanceBeforeFeeToWithManyProviders = await dai.balanceOf(feeTo.address);
    console.log("maxloanWithManyProviders", maxloanWithManyProviders.toString());
    console.log("feeWithManyProviders", feeWithManyProviders.toString());
    console.log("maxloans.length", maxloans.length.toString());
    await dai.connect(daiuser).transfer(flashborrower.address, feeWithManyProviders, { gasLimit: 30000000 });
    await flashborrower.connect(user).flashBorrowWithManyProviders(flashlender.address, dai.address, maxloanWithManyProviders, 1, { gasLimit: 30000000 });
    const totalFlashBalanceWithManyProviders = await flashborrower.totalFlashBalance();
    console.log("totalFlashBalanceWithManyProviders", totalFlashBalanceWithManyProviders.toString());
    console.log("maxloanWithManyProviders.add(feeWithManyProviders)", maxloanWithManyProviders.add(feeWithManyProviders).toString());
    expect(totalFlashBalanceWithManyProviders).to.lte(maxloanWithManyProviders.add(feeWithManyProviders));
    expect(totalFlashBalanceWithManyProviders).to.gte(maxloanWithManyProviders.add(feeWithManyProviders).sub(maxloans.length).sub(maxloans.length));
    const balanceAfterFeeToWithManyProviders = await dai.balanceOf(feeTo.address);
    expect(balanceAfterFeeToWithManyProviders.sub(balanceBeforeFeeToWithManyProviders)).to.lte(maxloanWithManyProviders.mul(5).div(1000).add(maxloans.length));
    expect(balanceAfterFeeToWithManyProviders.sub(balanceBeforeFeeToWithManyProviders)).to.gte(maxloanWithManyProviders.mul(5).div(1000).sub(maxloans.length));

    afterETH = await ethers.provider.getBalance(user.address);
    console.log("afterETH", afterETH.toString());
    let feeETH = ethers.BigNumber.from(beforeETH).sub(afterETH);
    console.log("feeETH", feeETH.toString());
  });
});