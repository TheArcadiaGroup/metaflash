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
  const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'
  const ONE_ADDRESS = '0x1111111111111111111111111111111111111111'

  beforeEach(async () => {
    [owner, user] = await ethers.getSigners();
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

    // // aave2
    // const AaveV2FlashLender = await ethers.getContractFactory('AaveV2FlashLender');
    // const AaveV2FlashLenderInstance = await AaveV2FlashLender.deploy(config[chainId].aavev2.LendingPoolAddressProvider);
    // let aavev2Lender = await AaveV2FlashLenderInstance.deployed();


    // // dydx
    // const DYDXFlashLender = await ethers.getContractFactory("DYDXFlashLender")
    // const DYDXFlashLenderInstance = await DYDXFlashLender.deploy(config[chainId].dydx.SoloMargin);
    // let dydxLender = await DYDXFlashLenderInstance.deployed();

    // // uniswapv2
    // const UniswapV2FlashLender = await ethers.getContractFactory("UniswapV2FlashLender")
    // const UniswapV2FlashLenderInstance = await UniswapV2FlashLender.deploy();
    // let uniswapv2Lender = await UniswapV2FlashLenderInstance.deployed();

    // const rawPairsInfo_uniswapv2 = fs.readFileSync('./config/uniswapv2pair.json');
    // const pairsInfo_uniswapv2 = JSON.parse(rawPairsInfo_uniswapv2);
    // const pairsInfoLength_uniswapv2 = Object.keys(pairsInfo_uniswapv2).length;

    // let tokens0_uniswapv2 = []
    // let tokens1_uniswapv2 = []
    // let pairs_uniswapv2 = []

    // for (let i = 1; i <= pairsInfoLength_uniswapv2; i++) {
    //   tokens0_uniswapv2.push(pairsInfo_uniswapv2[i].tokens0);
    //   tokens1_uniswapv2.push(pairsInfo_uniswapv2[i].tokens1);
    //   pairs_uniswapv2.push(pairsInfo_uniswapv2[i].pairs);
    // }

    // await uniswapv2Lender.addPairs(tokens0_uniswapv2, tokens1_uniswapv2, pairs_uniswapv2);

    // // uniswapv3
    // const UniswapV3FlashLender = await ethers.getContractFactory("UniswapV3FlashLender")
    // const UniswapV3FlashLenderInstance = await UniswapV3FlashLender.deploy();
    // let uniswapv3Lender = await UniswapV3FlashLenderInstance.deployed();

    // const rawPairsInfo_uniswapv3 = fs.readFileSync('./config/uniswapv3pair.json');
    // const pairsInfo_uniswapv3 = JSON.parse(rawPairsInfo_uniswapv3);
    // const pairsInfoLength_uniswapv3 = Object.keys(pairsInfo_uniswapv3).length;

    // let tokens0_uniswapv3 = []
    // let tokens1_uniswapv3 = []
    // let pairs_uniswapv3 = []

    // for (let i = 1; i <= pairsInfoLength_uniswapv3; i++) {
    //   tokens0_uniswapv3.push(pairsInfo_uniswapv3[i].tokens0);
    //   tokens1_uniswapv3.push(pairsInfo_uniswapv3[i].tokens1);
    //   pairs_uniswapv3.push(pairsInfo_uniswapv3[i].pairs);
    // }

    // await uniswapv3Lender.addPairs(tokens0_uniswapv3, tokens1_uniswapv3, pairs_uniswapv3)

    // // makerdao
    // const MakerDaoFlashLender = await ethers.getContractFactory("MakerDaoFlashLender")
    // const MakerDaoFlashLenderInstance = await MakerDaoFlashLender.deploy(config[chainId].makerdao.DssFlash);
    // let makerdaoLender = await MakerDaoFlashLenderInstance.deployed();

    // // saddlefinance
    // const SaddleFinanceFlashLender = await ethers.getContractFactory("SaddleFinanceFlashLender")
    // const SaddleFinanceFlashLenderInstance = await SaddleFinanceFlashLender.deploy();
    // let saddlefinanceLender = await SaddleFinanceFlashLenderInstance.deployed();

    // const rawPoolsInfo_saddlefinance = fs.readFileSync('./config/saddlefinancepool.json');
    // const poolsInfo_saddlefinance = JSON.parse(rawPoolsInfo_saddlefinance);
    // const poolsInfoLength_saddlefinance = Object.keys(poolsInfo_saddlefinance).length;

    // let pools_saddlefinance = []
    // for (let i = 1; i <= poolsInfoLength_saddlefinance; i++) {
    //   pools_saddlefinance.push(poolsInfo_saddlefinance[i].pools);
    // }

    // await saddlefinanceLender.addPools(pools_saddlefinance);

    // // defiswap
    // const CroDefiSwapFlashLender = await ethers.getContractFactory("CroDefiSwapFlashLender")
    // const CroDefiSwapFlashLenderInstance = await CroDefiSwapFlashLender.deploy(config[chainId].defiswap.Factory);
    // let defiswapLender = await CroDefiSwapFlashLenderInstance.deployed()

    // const rawPairsInfo_defiswap = fs.readFileSync('./config/defiswappair.json');
    // const pairsInfo_defiswap = JSON.parse(rawPairsInfo_defiswap);
    // const pairsInfoLength_defiswap = Object.keys(pairsInfo_defiswap).length;

    // let tokens0_defiswap = []
    // let tokens1_defiswap = []
    // let pairs_defiswap = []

    // for (let i = 1; i <= pairsInfoLength_defiswap; i++) {
    //   tokens0_defiswap.push(pairsInfo_defiswap[i].tokens0);
    //   tokens1_defiswap.push(pairsInfo_defiswap[i].tokens1);
    //   pairs_defiswap.push(pairsInfo_defiswap[i].pairs);
    // }

    // await defiswapLender.addPairs(tokens0_defiswap, tokens1_defiswap, pairs_defiswap);

    // // fortube
    // const FortubeFlashLender = await ethers.getContractFactory("FortubeFlashLender")
    // const FortubeFlashLenderInstance = await FortubeFlashLender.deploy(config[chainId].fortube_eth.Bank, config[chainId].fortube_eth.BankController);
    // let fortubeLender = await FortubeFlashLenderInstance.deployed();

    // // euler
    // const EulerFlashLender = await ethers.getContractFactory("EulerFlashLender")
    // const EulerFlashLenderInstance = await EulerFlashLender.deploy(config[chainId].euler.FlashLoan);
    // let eulerLender = await EulerFlashLenderInstance.deployed();

    // // FlashLoan
    // const FlashLender = await ethers.getContractFactory('FlashLender');
    // flashlender = await FlashLender.deploy();

    // await flashlender.addProviders([aavev2Lender.address, dydxLender.address, uniswapv2Lender.address, uniswapv3Lender.address, makerdaoLender.address, saddlefinanceLender.address, defiswapLender.address, fortubeLender.address, eulerLender.address]);

    // // Borrower
    // const FlashBorrower = await ethers.getContractFactory('FlashBorrower');
    // flashborrower = await FlashBorrower.deploy();

    // await aavev2Lender.setFlashLoaner(flashlender.address);
    // await dydxLender.setFlashLoaner(flashlender.address);
    // await uniswapv2Lender.setFlashLoaner(flashlender.address);
    // await uniswapv3Lender.setFlashLoaner(flashlender.address);
    // await makerdaoLender.setFlashLoaner(flashlender.address);
    // await saddlefinanceLender.setFlashLoaner(flashlender.address);
    // await defiswapLender.setFlashLoaner(flashlender.address);
    // await fortubeLender.setFlashLoaner(flashlender.address);
    // await eulerLender.setFlashLoaner(flashlender.address);

    let lender = []
    // aave2
    if (config[chainId].aavev2.LendingPoolAddressProvider === ZERO_ADDRESS) {
      console.log('Error: LendingPoolAddressProvider = ', ZERO_ADDRESS)
    } else {
      const AaveV2FlashLender = await ethers.getContractFactory('AaveV2FlashLender');
      const AaveV2FlashLenderInstance = await AaveV2FlashLender.deploy(config[chainId].aavev2.LendingPoolAddressProvider);
      aavev2Lender = await AaveV2FlashLenderInstance.deployed();
      lender.push(aavev2Lender);
    }
  
    // dydx
    if (config[chainId].dydx.SoloMargin === ZERO_ADDRESS) {
      console.log('Error: SoloMargin = ', ZERO_ADDRESS)
    } else {
      const DYDXFlashLender = await ethers.getContractFactory("DYDXFlashLender")
      const DYDXFlashLenderInstance = await DYDXFlashLender.deploy(config[chainId].dydx.SoloMargin);
      dydxLender = await DYDXFlashLenderInstance.deployed();
      lender.push(dydxLender);
    }
  
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
    lender.push(uniswapv2Lender);
  
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
    lender.push(uniswapv3Lender);
  
    // makerdao
    if (config[chainId].makerdao.DssFlash === ZERO_ADDRESS) {
      console.log('Error: DssFlash = ', ZERO_ADDRESS)
    } else {
      const MakerDaoFlashLender = await ethers.getContractFactory("MakerDaoFlashLender")
      const MakerDaoFlashLenderInstance = await MakerDaoFlashLender.deploy(config[chainId].makerdao.DssFlash);
      makerdaoLender = await MakerDaoFlashLenderInstance.deployed();
      lender.push(makerdaoLender);
    }
  
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
    lender.push(saddlefinanceLender);
  
    // defiswap
    if (config[chainId].defiswap.Factory === ZERO_ADDRESS) {
      console.log('Error: Factory = ', ZERO_ADDRESS)
    } else {
      const CroDefiSwapFlashLender = await ethers.getContractFactory("CroDefiSwapFlashLender")
      const CroDefiSwapFlashLenderInstance = await CroDefiSwapFlashLender.deploy(config[chainId].defiswap.Factory);
      defiswapLender = await CroDefiSwapFlashLenderInstance.deployed()
  
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
      lender.push(defiswapLender);
    }
    // fortube
    if (config[chainId].fortube_eth.Bank === ZERO_ADDRESS || config[chainId].fortube_eth.BankController === ZERO_ADDRESS) {
      console.log('Error: Bank or BankController = ', ZERO_ADDRESS)
    } else {
      const FortubeFlashLender = await ethers.getContractFactory("FortubeFlashLender")
      const FortubeFlashLenderInstance = await FortubeFlashLender.deploy(config[chainId].fortube_eth.Bank, config[chainId].fortube_eth.BankController);
      fortubeLender = await FortubeFlashLenderInstance.deployed();
      lender.push(fortubeLender);
    }
    // euler
    if (config[chainId].euler.FlashLoan === ZERO_ADDRESS) {
      console.log('Error: FlashLoan = ', ZERO_ADDRESS)
    } else {
      const EulerFlashLender = await ethers.getContractFactory("EulerFlashLender")
      const EulerFlashLenderInstance = await EulerFlashLender.deploy(config[chainId].euler.FlashLoan);
      eulerLender = await EulerFlashLenderInstance.deployed();
      lender.push(eulerLender);
    }
    // FlashLoan
    const FlashLender = await ethers.getContractFactory('FlashLender');
    flashlender = await FlashLender.deploy();
  
    for(let i = 0; i < lender.length; i++) {
      await lender[i].setFlashLoaner(flashlender.address);
    }
  
    lendersAddress = []
    for(let i = 0; i < lender.length; i++) {
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
    [maxloans, fee1e18s, feeMaxLoans] = await flashlender.getFlashLoanInfoListWithCheaperFeePriority(dai.address, "1000000000000000000000", { gasLimit: 30000000 });
    console.log("maxloans.length", maxloans.length);
    if(maxloans.length > 1){
      for (let i = 0; i < maxloans.length - 1 ; i++) {
        expect(fee1e18s[i]).to.lte(fee1e18s[i+1]);
        if(fee1e18s[i] == fee1e18s[i+1]){
          expect(maxloans[i]).to.gte(maxloans[i+1]);
        }
      }
    }
  });

  it('maxFlashLoan', async function () {
    [maxloans, fee1e18s, feeMaxLoans] = await flashlender.getFlashLoanInfoListWithCheaperFeePriority(dai.address, "1000000000000000000000", { gasLimit: 30000000 });

    let maxloan = BigNumber.from(0);
    let max = BigNumber.from(0);
    for (let i = 0; i < maxloans.length; i++) {
      maxloan = maxloan.add(maxloans[i]);
      if(max.lt(maxloans[i])){
        max = maxloans[i];
      }
    }

    let daimaxloancheapest = await flashlender.maxFlashLoanWithCheapestProvider(dai.address, 1);
    console.log("daimaxloancheapest", daimaxloancheapest.toString());
    expect(maxloans[0]).to.equal(daimaxloancheapest);
    let daimaxloan = await flashlender.maxFlashLoanWithManyProviders(dai.address, 1);
    console.log("daimaxloan", daimaxloan.toString());
    expect(maxloan).to.equal(daimaxloan);

    daimaxloancheapest = await flashlender.maxFlashLoanWithCheapestProvider(dai.address, max);
    console.log("daimaxloancheapest", daimaxloancheapest.toString());
    expect(max).to.equal(daimaxloancheapest);
    
    let max2 = BigNumber.from(0);
    for (let i = 0; i < maxloans.length; i++) {
      if(max == maxloans[i]){
        max2 = max2.add(maxloans[i]);
      }
    }
    daimaxloan = await flashlender.maxFlashLoanWithManyProviders(dai.address, max);
    console.log("daimaxloan", daimaxloan.toString());
    expect(max2).to.equal(daimaxloan);

    await expect(flashlender.maxFlashLoanWithCheapestProvider(dai.address, max.add(1), { gasLimit: 30000000 })).to.revertedWith('FlashLender: Found no provider');
    await expect(flashlender.maxFlashLoanWithManyProviders(dai.address, max.add(1), { gasLimit: 30000000 })).to.revertedWith('FlashLender: Found no provider');
  });

  it('flashFee', async function () {
    [maxloans, fee1e18s, feeMaxLoans] = await flashlender.getFlashLoanInfoListWithCheaperFeePriority(dai.address, "1000000000000000000000", { gasLimit: 30000000 });

    let fee = BigNumber.from(0);
    let maxloan = BigNumber.from(0);
    let max = BigNumber.from(0);
    for (let i = 0; i < feeMaxLoans.length; i++) {
      fee = fee.add(feeMaxLoans[i]);
      maxloan = maxloan.add(maxloans[i]);
      if(max.lt(maxloans[i])){
        max = maxloans[i];
      }
    }

    let daifeecheapest = await flashlender.flashFeeWithCheapestProvider(dai.address, maxloans[0]);
    console.log("daifeecheapest", daifeecheapest.toString());
    expect(feeMaxLoans[0]).to.equal(daifeecheapest);
    let daifee = await flashlender.flashFeeWithManyProviders(dai.address, maxloan, 1);
    console.log("daifee", daifee.toString());
    expect(fee.add(maxloans.length)).to.equal(daifee);

    await expect(flashlender.flashFeeWithCheapestProvider(dai.address, max.add(1), { gasLimit: 30000000 })).to.revertedWith('FlashLender: Found no provider');
    await expect(flashlender.flashFeeWithManyProviders(dai.address, maxloan, max.add(1), { gasLimit: 30000000 })).to.revertedWith('FlashLender: Found no provider');
    await expect(flashlender.flashFeeWithManyProviders(dai.address, maxloan.add(1), 1, { gasLimit: 30000000 })).to.revertedWith('FlashLender: Amount is more than maxFlashLoan');
  });

  it('flashLoanWithCheapestProvider', async () => {
    beforeETH = await ethers.provider.getBalance(user.address);

    const maxloanWithCheapestProvider = await flashlender.maxFlashLoanWithCheapestProvider(weth.address, 1, { gasLimit: 30000000 });
    const feeWithCheapestProvider = await flashlender.flashFeeWithCheapestProvider(weth.address, maxloanWithCheapestProvider, { gasLimit: 30000000 });
    await weth.connect(wethuser).transfer(flashborrower.address, feeWithCheapestProvider, { gasLimit: 30000000 });
    console.log("maxloanWithCheapestProvider", maxloanWithCheapestProvider.toString());
    console.log("feeWithCheapestProvider", feeWithCheapestProvider.toString());
    await flashborrower.connect(user).flashBorrowWithCheapestProvider(flashlender.address, weth.address, maxloanWithCheapestProvider, { gasLimit: 30000000 });
    const totalFlashBalanceWithCheapestProvider = await flashborrower.totalFlashBalance();
    expect(totalFlashBalanceWithCheapestProvider).to.equal(maxloanWithCheapestProvider.add(feeWithCheapestProvider));
    
    afterETH = await ethers.provider.getBalance(user.address);
    console.log("afterETH", afterETH.toString());
    let feeETH = ethers.BigNumber.from(beforeETH).sub(afterETH);
    console.log("feeETH", feeETH.toString());
  });

    it('Invalid case - flashLoanWithCheapestProvider', async () => {
    [maxloans, fee1e18s, feeMaxLoans] = await flashlender.getFlashLoanInfoListWithCheaperFeePriority(weth.address, 1, { gasLimit: 30000000 });

    let maxloan = BigNumber.from(0);
    for (let i = 0; i < feeMaxLoans.length; i++) {
      if(maxloan.lt(maxloans[i])){
        maxloan = maxloans[i];
      }
    }
    await expect(flashborrower.connect(user).flashBorrowWithCheapestProvider(flashlender.address, weth.address, maxloan.add(1), { gasLimit: 30000000 })).to.revertedWith('FlashLender: Found no provider');
  });

  it('flashLoanWithManyProviders', async () => {
    beforeETH = await ethers.provider.getBalance(user.address);

    [maxloans, fee1e18s, feeMaxLoans] = await flashlender.getFlashLoanInfoListWithCheaperFeePriority(dai.address, 1, { gasLimit: 30000000 });

    let maxloan = BigNumber.from(0);
    for (let i = 0; i < feeMaxLoans.length; i++) {
      if(maxloan.lt(maxloans[i])){
        maxloan = maxloans[i];
      }
    }

    const maxloanWithManyProviders = await flashlender.maxFlashLoanWithManyProviders(dai.address, 1, { gasLimit: 30000000 });
    const feeWithManyProviders = await flashlender.flashFeeWithManyProviders(dai.address, maxloanWithManyProviders, 1, { gasLimit: 30000000 });
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

    afterETH = await ethers.provider.getBalance(user.address);
    console.log("afterETH", afterETH.toString());
    let feeETH = ethers.BigNumber.from(beforeETH).sub(afterETH);
    console.log("feeETH", feeETH.toString());
  });
  
  it('Invalid cases - flashLoanWithManyProviders', async () => {
    [maxloans, fee1e18s, feeMaxLoans] = await flashlender.getFlashLoanInfoListWithCheaperFeePriority(dai.address, 1, { gasLimit: 30000000 });

    let maxloan = BigNumber.from(0);
    for (let i = 0; i < feeMaxLoans.length; i++) {
      if(maxloan.lt(maxloans[i])){
        maxloan = maxloans[i];
      }
    }

    const maxloanWithManyProviders = await flashlender.maxFlashLoanWithManyProviders(dai.address, 1, { gasLimit: 30000000 });

    await expect(flashborrower.connect(user).flashBorrowWithManyProviders(flashlender.address, dai.address, maxloan.add(1), maxloan.add(1), { gasLimit: 30000000 })).to.revertedWith('FlashLender: Found no provider');

    await expect(flashborrower.connect(user).flashBorrowWithManyProviders(flashlender.address, dai.address, maxloanWithManyProviders.add(1), 1, { gasLimit: 30000000 })).to.revertedWith('FlashLender: Amount is more than maxFlashLoan');
  });
});