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
    const LendingPool_ABI = require('../contracts/providers/aaveV2/abi/LendingPool.json');
    let lendingPoolAddress = "0x7d2768de32b0b80b7a3454c06bdac94a69ddc7a9";
    let lendingPool = await ethers.getContractAt(LendingPool_ABI, lendingPoolAddress);

    const AaveV2FlashLender = await ethers.getContractFactory('AaveV2FlashLender');
    aavev2Lender = await AaveV2FlashLender.deploy(config[chainId].aavev2.LendingPoolAddressProvider);

    let daiReserveData = await lendingPool.getReserveData(daiAddress);
    let aDaiAddress = daiReserveData.aTokenAddress;

    let wethReserveData = await lendingPool.getReserveData(wethAddress);
    let aWETHAddress = wethReserveData.aTokenAddress;

    let premium = await lendingPool.FLASHLOAN_PREMIUM_TOTAL()

    dai_maxloan_aavev2 = await dai.balanceOf(aDaiAddress);
    dai_feemaxloan_aave2 = BigNumber.from(dai_maxloan_aavev2).mul(premium).div(10000)
    pairPoolDAICount = pairPoolDAICount.add(1);

    weth_maxloan_aavev2 = await weth.balanceOf(aWETHAddress);
    weth_feemaxloan_aave2 = BigNumber.from(weth_maxloan_aavev2).mul(premium).div(10000)
    pairPoolETHCount = pairPoolETHCount.add(1);

    // // dydx
    // const DYDXFlashLender = await ethers.getContractFactory("DYDXFlashLender")
    // const DYDXFlashLenderInstance = await DYDXFlashLender.deploy(config[chainId].dydx.SoloMargin);
    // let dydxLender = await DYDXFlashLenderInstance.deployed();

    // dai_maxloan_dydx = await dai.balanceOf(config[chainId].dydx.SoloMargin);
    // dai_feemaxloan_dydx = 2;
    // pairPoolDAICount = pairPoolDAICount.add(1);

    // weth_maxloan_dydx = await weth.balanceOf(config[chainId].dydx.SoloMargin);
    // weth_feemaxloan_dydx = 2;
    // pairPoolETHCount = pairPoolETHCount.add(1);

    // // uniswapv2
    // const UniswapV2FlashLender = await ethers.getContractFactory("UniswapV2FlashLender")
    // const UniswapV2FlashLenderInstance = await UniswapV2FlashLender.deploy();
    // let uniswapv2Lender = await UniswapV2FlashLenderInstance.deployed();


    // max_dai_maxloan_uniswapv2 = BigNumber.from(0), total_dai_maxloan_uniswapv2 = BigNumber.from(0);
    // max_dai_feemaxloan_uniswapv2 = BigNumber.from(0), total_dai_feemaxloan_uniswapv2 = BigNumber.from(0);

    // max_weth_maxloan_uniswapv2 = BigNumber.from(0), total_weth_maxloan_uniswapv2 = BigNumber.from(0);
    // max_weth_feemaxloan_uniswapv2 = BigNumber.from(0), total_weth_feemaxloan_uniswapv2 = BigNumber.from(0);

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

    // for (let i = 1; i <= pairsInfoLength_uniswapv2; i++) {
    //   if (daiAddress == pairsInfo_uniswapv2[i].tokens0 || daiAddress == pairsInfo_uniswapv2[i].tokens1) {
    //     let tempBal = await dai.balanceOf(pairsInfo_uniswapv2[i].pairs)
    //     if (tempBal.gt(BigNumber.from(1))) {
    //       total_dai_maxloan_uniswapv2 = total_dai_maxloan_uniswapv2.add(tempBal).sub(1);
    //       pairPoolDAICount = pairPoolDAICount.add(1);
    //       if (max_dai_maxloan_uniswapv2.lt(tempBal.sub(1))) {
    //         max_dai_maxloan_uniswapv2 = tempBal.sub(1);
    //       }
    //     }
    //   }
    // }

    // for (let i = 1; i <= pairsInfoLength_uniswapv2; i++) {
    //   if (wethAddress == pairsInfo_uniswapv2[i].tokens0 || wethAddress == pairsInfo_uniswapv2[i].tokens1) {
    //     let tempBal = await weth.balanceOf(pairsInfo_uniswapv2[i].pairs)
    //     if (tempBal.gt(BigNumber.from(1))) {
    //       total_weth_maxloan_uniswapv2 = total_weth_maxloan_uniswapv2.add(tempBal).sub(1);
    //       pairPoolETHCount = pairPoolETHCount.add(1);
    //       if (max_weth_maxloan_uniswapv2.lt(tempBal.sub(1))) {
    //         max_weth_maxloan_uniswapv2 = tempBal.sub(1);
    //       }
    //     }
    //   }
    // }

    // max_dai_feemaxloan_uniswapv2 = max_dai_maxloan_uniswapv2.mul(3).div(997).add(1)
    // total_dai_feemaxloan_uniswapv2 = total_dai_maxloan_uniswapv2.mul(3).div(997).add(1)

    // max_weth_feemaxloan_uniswapv2 = max_weth_maxloan_uniswapv2.mul(3).div(997).add(1)
    // total_weth_feemaxloan_uniswapv2 = total_weth_maxloan_uniswapv2.mul(3).div(997).add(1)

    // // uniswapv3
    // const UniswapV3FlashLender = await ethers.getContractFactory("UniswapV3FlashLender")
    // const UniswapV3FlashLenderInstance = await UniswapV3FlashLender.deploy();
    // let uniswapv3Lender = await UniswapV3FlashLenderInstance.deployed();

    // max_dai_maxloan_uniswapv3 = BigNumber.from(0), total_dai_maxloan_uniswapv3 = BigNumber.from(0);
    // max_dai_feemaxloan_uniswapv3 = BigNumber.from(0), total_dai_feemaxloan_uniswapv3 = BigNumber.from(0);

    // max_weth_maxloan_uniswapv3 = BigNumber.from(0), total_weth_maxloan_uniswapv3 = BigNumber.from(0);
    // max_weth_feemaxloan_uniswapv3 = BigNumber.from(0), total_weth_feemaxloan_uniswapv3 = BigNumber.from(0);

    // const PAIR_UNISWAPV3_ABI = require('../contracts/providers/uniswapV3/abi/Pair.json');
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
    
    // await uniswapv3Lender.addPairs(tokens0_uniswapv3, tokens1_uniswapv3, pairs_uniswapv3);

    // for (let i = 1; i <= pairsInfoLength_uniswapv3; i++) {
    //   if (daiAddress == pairsInfo_uniswapv3[i].tokens0 || daiAddress == pairsInfo_uniswapv3[i].tokens1) {
    //     let tempBal = await dai.balanceOf(pairsInfo_uniswapv3[i].pairs)
    //     let pair_uniswapv3 = await ethers.getContractAt(PAIR_UNISWAPV3_ABI, pairsInfo_uniswapv3[i].pairs);
    //     let liquidity = await pair_uniswapv3.liquidity();
    //     if (tempBal.gt(BigNumber.from(1)) && liquidity.gt(0)) {
    //       tempBal = tempBal.sub(1);
    //       let fee = await pair_uniswapv3.fee();
    //       let tempFee = tempBal.mul(fee).div(1000000).add(1);
    //       total_dai_maxloan_uniswapv3 = total_dai_maxloan_uniswapv3.add(tempBal);
    //       total_dai_feemaxloan_uniswapv3 = total_dai_feemaxloan_uniswapv3.add(tempFee);
    //       pairPoolDAICount = pairPoolDAICount.add(1);
    //       if (max_dai_maxloan_uniswapv3.lt(tempBal)) {
    //         max_dai_maxloan_uniswapv3 = tempBal;
    //         max_dai_feemaxloan_uniswapv3 = tempBal.mul(fee).div(1000000).add(1);
    //       }
    //     }
    //   }
    // }

    // for (let i = 1; i <= pairsInfoLength_uniswapv3; i++) {
    //   if (wethAddress == pairsInfo_uniswapv3[i].tokens0 || wethAddress == pairsInfo_uniswapv3[i].tokens1) {
    //     let tempBal = await weth.balanceOf(pairsInfo_uniswapv3[i].pairs)
    //     let pair_uniswapv3 = await ethers.getContractAt(PAIR_UNISWAPV3_ABI, pairsInfo_uniswapv3[i].pairs);
    //     let liquidity = await pair_uniswapv3.liquidity();
    //     if (tempBal.gt(BigNumber.from(1)) && liquidity.gt(0)) {
    //       tempBal = tempBal.sub(1);
    //       let fee = await pair_uniswapv3.fee();
    //       let tempFee = tempBal.mul(fee).div(1000000).add(1);
    //       total_weth_maxloan_uniswapv3 = total_weth_maxloan_uniswapv3.add(tempBal);
    //       total_weth_maxloan_uniswapv3 = total_weth_maxloan_uniswapv3.add(tempFee);
    //       pairPoolETHCount = pairPoolETHCount.add(1);
    //       if (max_weth_maxloan_uniswapv3.lt(tempBal)) {
    //         max_weth_maxloan_uniswapv3 = tempBal;
    //         max_weth_feemaxloan_uniswapv3 = tempBal.mul(fee).div(1000000).add(1);
    //       }
    //     }
    //   }
    // }

    // // makerdao
    // const MakerDaoFlashLender = await ethers.getContractFactory("MakerDaoFlashLender")
    // const MakerDaoFlashLenderInstance = await MakerDaoFlashLender.deploy(config[chainId].makerdao.DssFlash);
    // let makerdaoLender = await MakerDaoFlashLenderInstance.deployed();

    // const DSSFlash_ABI = require('../contracts/providers/makerdao/abi/DSSFlash.json');
    // dssflash = await ethers.getContractAt(DSSFlash_ABI, config[chainId].makerdao.DssFlash);

    // dai_maxloan_makerdao = await dssflash.max();
    // dai_feemaxloan_makerdao = 0;
    // pairPoolDAICount = pairPoolDAICount.add(1);

    // weth_maxloan_makerdao = 0;
    // weth_feemaxloan_makerdao = 0;
    // pairPoolETHCount = pairPoolETHCount.add(1);

    // // saddlefinance
    // const SaddleFinanceFlashLender = await ethers.getContractFactory("SaddleFinanceFlashLender")
    // const SaddleFinanceFlashLenderInstance = await SaddleFinanceFlashLender.deploy();
    // let saddlefinanceLender = await SaddleFinanceFlashLenderInstance.deployed();

    // max_dai_maxloan_saddlefinance = BigNumber.from(0), total_dai_maxloan_saddlefinance = BigNumber.from(0);
    // max_dai_feemaxloan_saddlefinance = BigNumber.from(0), total_dai_feemaxloan_saddlefinance = BigNumber.from(0);

    // max_weth_maxloan_saddlefinance = BigNumber.from(0), total_weth_maxloan_saddlefinance = BigNumber.from(0);
    // max_weth_feemaxloan_saddlefinance = BigNumber.from(0), total_weth_feemaxloan_saddlefinance = BigNumber.from(0);

    // const rawPoolsInfo_saddlefinance = fs.readFileSync('./config/saddlefinancepool.json');
    // const poolsInfo_saddlefinance = JSON.parse(rawPoolsInfo_saddlefinance);
    // const poolsInfoLength_saddlefinance = Object.keys(poolsInfo_saddlefinance).length;
    // const POOL_SADDLEFINANCE_ABI = require('../contracts/providers/saddlefinance/abi/Pool.json');

    // let pools_saddlefinance = []
    // for (let i = 1; i <= poolsInfoLength_saddlefinance; i++) {
    //   pools_saddlefinance.push(poolsInfo_saddlefinance[i].pools);
    // }

    // await saddlefinanceLender.addPools(pools_saddlefinance);

    // for (let i = 1; i <= poolsInfoLength_saddlefinance; i++) {
    //   let tempBal = await dai.balanceOf(poolsInfo_saddlefinance[i].pools)
    //   if (tempBal.gt(0)) {
    //     let pool = await ethers.getContractAt(POOL_SADDLEFINANCE_ABI, poolsInfo_saddlefinance[i].pools);
    //     let fee = await pool.flashLoanFeeBPS();
    //     let tempFee = tempBal.mul(fee).div(10000);
    //     total_dai_maxloan_saddlefinance = total_dai_maxloan_saddlefinance.add(tempBal);
    //     total_dai_feemaxloan_saddlefinance = total_dai_feemaxloan_saddlefinance.add(tempFee);
    //     pairPoolDAICount = pairPoolDAICount.add(1);
    //     if (max_dai_maxloan_saddlefinance.lt(tempBal)) {
    //       max_dai_maxloan_saddlefinance = tempBal;
    //       max_dai_feemaxloan_saddlefinance = tempBal.mul(fee).div(10000);
    //     }
    //   }
    // }

    // for (let i = 1; i <= poolsInfoLength_saddlefinance; i++) {
    //   let tempBal = await weth.balanceOf(poolsInfo_saddlefinance[i].pools)
    //   if (tempBal.gt(0)) {
    //     let pool = await ethers.getContractAt(POOL_SADDLEFINANCE_ABI, poolsInfo_saddlefinance[i].pools);
    //     let fee = await pool.flashLoanFeeBPS();
    //     let tempFee = tempBal.mul(fee).div(10000);
    //     total_weth_maxloan_saddlefinance = total_weth_maxloan_saddlefinance.add(tempBal);
    //     total_weth_feemaxloan_saddlefinance = total_weth_feemaxloan_saddlefinance.add(tempFee);
    //     pairPoolETHCount = pairPoolETHCount.add(1);
    //     if (max_weth_maxloan_saddlefinance.lt(tempBal)) {
    //       max_weth_maxloan_saddlefinance = tempBal;
    //       max_weth_feemaxloan_saddlefinance = tempBal.mul(fee).div(10000);
    //     }
    //   }
    // }

    // // defiswap
    // const CroDefiSwapFlashLender = await ethers.getContractFactory("CroDefiSwapFlashLender")
    // const CroDefiSwapFlashLenderInstance = await CroDefiSwapFlashLender.deploy(config[chainId].defiswap.Factory);
    // let defiswapLender = await CroDefiSwapFlashLenderInstance.deployed();
    
    // max_dai_maxloan_defiswap = BigNumber.from(0), total_dai_maxloan_defiswap = BigNumber.from(0);
    // max_dai_feemaxloan_defiswap = BigNumber.from(0), total_dai_feemaxloan_defiswap = BigNumber.from(0);

    // max_weth_maxloan_defiswap = BigNumber.from(0), total_weth_maxloan_defiswap = BigNumber.from(0);
    // max_weth_feemaxloan_defiswap = BigNumber.from(0), total_weth_feemaxloan_defiswap = BigNumber.from(0);

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

    // for (let i = 1; i <= pairsInfoLength_defiswap; i++) {
    //   if (daiAddress == pairsInfo_defiswap[i].tokens0 || daiAddress == pairsInfo_defiswap[i].tokens1) {
    //     let tempBal = await dai.balanceOf(pairsInfo_defiswap[i].pairs)
    //     if (tempBal.gt(BigNumber.from(1))) {
    //       total_dai_maxloan_defiswap = total_dai_maxloan_defiswap.add(tempBal).sub(1);
    //       pairPoolDAICount = pairPoolDAICount.add(1);
    //       if (max_dai_maxloan_defiswap.lt(tempBal.sub(1))) {
    //         max_dai_maxloan_defiswap = tempBal.sub(1);
    //       }
    //     }
    //   }
    // }

    // for (let i = 1; i <= pairsInfoLength_defiswap; i++) {
    //   if (wethAddress == pairsInfo_defiswap[i].tokens0 || wethAddress == pairsInfo_defiswap[i].tokens1) {
    //     let tempBal = await weth.balanceOf(pairsInfo_defiswap[i].pairs)
    //     if (tempBal.gt(BigNumber.from(1))) {
    //       total_weth_maxloan_defiswap = total_weth_maxloan_defiswap.add(tempBal).sub(1);
    //       pairPoolETHCount = pairPoolETHCount.add(1);
    //       if (max_weth_maxloan_defiswap.lt(tempBal.sub(1))) {
    //         max_weth_maxloan_defiswap = tempBal.sub(1);
    //       }
    //     }
    //   }
    // }

    // const FACTORY_DEFISWAP_ABI = require('../contracts/providers/defiswap/abi/Factory.json');
    // factory_defiswap = await ethers.getContractAt(FACTORY_DEFISWAP_ABI, config[chainId].defiswap.Factory);
    // let totalFeeBasisPoint = await factory_defiswap.totalFeeBasisPoint()

    // max_dai_feemaxloan_defiswap = BigNumber.from(max_dai_maxloan_defiswap).mul(totalFeeBasisPoint).div(BigNumber.from(10000).sub(totalFeeBasisPoint)).add(1)
    // total_dai_feemaxloan_defiswap = BigNumber.from(total_dai_maxloan_defiswap).mul(totalFeeBasisPoint).div(BigNumber.from(10000).sub(totalFeeBasisPoint)).add(1)

    // max_weth_feemaxloan_defiswap = BigNumber.from(max_weth_maxloan_defiswap).mul(totalFeeBasisPoint).div(BigNumber.from(10000).sub(totalFeeBasisPoint)).add(1)
    // total_weth_feemaxloan_defiswap = BigNumber.from(total_weth_maxloan_defiswap).mul(totalFeeBasisPoint).div(BigNumber.from(10000).sub(totalFeeBasisPoint)).add(1)

    // // fortube
    // const FortubeFlashLender = await ethers.getContractFactory("FortubeFlashLender")
    // const FortubeFlashLenderInstance = await FortubeFlashLender.deploy(config[chainId].fortube_eth.Bank, config[chainId].fortube_eth.BankController);
    // let fortubeLender = await FortubeFlashLenderInstance.deployed();

    // const BANKCONTROLLER_FORTUBE_ABI = require('../contracts/providers/fortube/abi/BankController.json');
    // bankcontroller_fortube = await ethers.getContractAt(BANKCONTROLLER_FORTUBE_ABI, config[chainId].fortube_eth.BankController);

    // let flashloanFeeBips = await bankcontroller_fortube.flashloanFeeBips()

    // dai_maxloan_fortube = await dai.balanceOf(config[chainId].fortube_eth.BankController);
    // dai_feemaxloan_fortube = BigNumber.from(dai_maxloan_fortube).mul(flashloanFeeBips).div(10000);
    // pairPoolDAICount = pairPoolDAICount.add(1);

    // weth_maxloan_fortube = await weth.balanceOf(config[chainId].fortube_eth.BankController);
    // weth_feemaxloan_fortube = BigNumber.from(weth_maxloan_fortube).mul(flashloanFeeBips).div(10000);
    // pairPoolETHCount = pairPoolETHCount.add(1);

    // FlashLoan
    const FlashLender = await ethers.getContractFactory('FlashLender');
    flashlender = await FlashLender.deploy(feeTo.address);

    // console.log("aavev2Lender.address", aavev2Lender.address);
    // console.log("dydxLender.address", dydxLender.address);
    // console.log("uniswapv2Lender.address", uniswapv2Lender.address);
    // console.log("uniswapv3Lender.address", uniswapv3Lender.address);
    // console.log("makerdaoLender.address", makerdaoLender.address);
    // console.log("saddlefinanceLender.address", saddlefinanceLender.address);
    // console.log("defiswapLender.address", defiswapLender.address);
    // console.log("fortubeLender.address", fortubeLender.address);

    // await flashlender.addProviders([aavev2Lender.address, dydxLender.address, uniswapv2Lender.address, uniswapv3Lender.address, makerdaoLender.address, saddlefinanceLender.address, defiswapLender.address, fortubeLender.address]);
    
    // await flashlender.addProviders([aavev2Lender.address, dydxLender.address, uniswapv3Lender.address, makerdaoLender.address, saddlefinanceLender.address, defiswapLender.address, fortubeLender.address]);
    await flashlender.addProviders([aavev2Lender.address]);

    // Borrower
    const FlashBorrower = await ethers.getContractFactory('FlashBorrower');
    flashborrower = await FlashBorrower.deploy();
  });

  // it("check factory", async function () {
  //   expect(await flashlender.factory()).to.equal(owner.address);
  //   await expect(flashlender.connect(user).setFactory(user.address)).to.revertedWith('FlashLender: Not factory');
  //   await flashlender.setFactory(user.address);
  //   expect(await flashlender.factory()).to.equal(user.address);
  // });

  // it("check feeTo", async function () {
  //   expect(await flashlender.FEETO()).to.equal(feeTo.address);
  //   await expect(flashlender.connect(user).setFeeTo(user.address)).to.revertedWith('FlashLender: Not factory');
  //   await flashlender.setFeeTo(user.address);
  //   expect(await flashlender.FEETO()).to.equal(user.address);
  // });

  // it('flash supply', async function () {
  //   expect(await flashlender.maxFlashLoanWithCheapestProvider(weth.address, aaveBal)).to.equal(aaveBal);
  //   expect(await flashlender.maxFlashLoanWithCheapestProvider(weth.address, aaveBal.add(1))).to.equal(uniswapBal.mul(2).sub(1));
  //   expect(await flashlender.maxFlashLoanWithCheapestProvider(weth.address, uniswapBal.mul(2).sub(1))).to.equal(uniswapBal.mul(2).sub(1));
  //   await expect(flashlender.maxFlashLoanWithCheapestProvider(weth.address, uniswapBal.mul(2))).to.revertedWith('FlashLender: Found no provider');
  //   // await expect(flashlender.maxFlashLoanWithCheapestProvider(flashlender.address, 1)).to.revertedWith('FlashLender: Found no provider');

  //   expect(await flashlender.maxFlashLoanWithManyProviders(weth.address)).to.equal((uniswapBal.mul(3).sub(2)).add(aaveBal));
  //   expect(await flashlender.maxFlashLoanWithManyProviders(dai.address)).to.equal((uniswapBal.sub(1)).add(aaveBal));
  //   expect(await flashlender.maxFlashLoanWithManyProviders(usdc.address)).to.equal((uniswapBal.mul(2).sub(1)).add(aaveBal));
  //   // await expect(flashlender.maxFlashLoanWithManyProviders(flashlender.address)).to.revertedWith('FlashLender: Found no provider');
  // });

  // it('flash fee', async function () {
  //   let premium = await lendingPool.FLASHLOAN_PREMIUM_TOTAL();
  //   expect(await flashlender.flashFeeWithCheapestProvider(weth.address, aaveBal)).to.equal((aaveBal.mul(premium).div(10000)).add(aaveBal.mul(5).div(1000)));
  //   expect(await flashlender.flashFeeWithCheapestProvider(weth.address, uniswapBal.sub(1))).to.equal(((uniswapBal.sub(1)).mul(3).div(997).add(1)).add((uniswapBal.sub(1)).mul(5).div(1000)));
  //   expect(await flashlender.flashFeeWithCheapestProvider(weth.address, uniswapBal.mul(2).sub(1))).to.equal(((uniswapBal.mul(2).sub(1)).mul(3).div(997).add(1)).add((uniswapBal.mul(2).sub(1)).mul(5).div(1000)));
  //   await expect(flashlender.flashFeeWithCheapestProvider(weth.address, uniswapBal.mul(2))).to.revertedWith('FlashLender: Found no provider');
  //   // await expect(flashlender.flashFeeWithCheapestProvider(flashlender.address, 1)).to.revertedWith('FlashLender: Found no provider');

  //   expect(await flashlender.flashFeeWithManyProviders(weth.address, aaveBal)).to.equal((aaveBal.mul(premium).div(10000)).add(aaveBal.mul(5).div(1000)));

  //   let aaveFee1 = aaveBal.mul(premium).div(10000)
  //   let uniswapFee1 = (uniswapBal.sub(aaveBal)).mul(3).div(997).add(1)
  //   let myFee1 = uniswapBal.mul(5).div(1000)
  //   let totalFee1 = aaveFee1.add(uniswapFee1).add(myFee1)
  //   expect(await flashlender.flashFeeWithManyProviders(weth.address, uniswapBal)).to.equal(totalFee1);

  //   let amount2 = (uniswapBal.mul(3).sub(2)).add(aaveBal)
  //   let aaveFee2 = aaveBal.mul(premium).div(10000)
  //   let uniswapFee2 = (uniswapBal.mul(3).sub(2)).mul(3).div(997).add(1)
  //   let myFee2 = amount2.mul(5).div(1000)
  //   let totalFee2 = aaveFee2.add(uniswapFee2).add(myFee2)
  //   expect(await flashlender.flashFeeWithManyProviders(weth.address, amount2)).to.equal(totalFee2);

  //   let amount3 = (uniswapBal.mul(3).sub(1)).add(aaveBal)
  //   await expect(flashlender.flashFeeWithManyProviders(weth.address, amount3)).to.revertedWith('FlashLender: Amount is more than maxFlashLoan');
  //   // await expect(flashlender.flashFeeWithManyProviders(flashlender.address, 1)).to.revertedWith('FlashLender: Found no provider');
  // });

  // it('flashLoanWithCheapestProvider', async () => {
  //   const maxloanWithCheapestProvider = await flashlender.maxFlashLoanWithCheapestProvider(weth.address, 1);
  //   const feeWithCheapestProvider = await flashlender.flashFeeWithCheapestProvider(weth.address, maxloanWithCheapestProvider);
  //   const balanceBeforeFeeToWithCheapestProvider = await weth.balanceOf(feeTo.address);
  //   await weth.connect(wethuser).transfer(flashborrower.address, feeWithCheapestProvider, {gasLimit: 30000000});
  //   await flashborrower.connect(user).flashBorrowWithCheapestProvider(flashlender.address, weth.address, maxloanWithCheapestProvider);
  //   const totalFlashBalanceWithCheapestProvider = await flashborrower.totalFlashBalance();
  //   expect(totalFlashBalanceWithCheapestProvider).to.equal(maxloanWithCheapestProvider.add(feeWithCheapestProvider));
  //   const balanceAfterFeeToWithCheapestProvider = await weth.balanceOf(feeTo.address);
  //   expect(balanceAfterFeeToWithCheapestProvider.sub(balanceBeforeFeeToWithCheapestProvider)).to.equal(maxloanWithCheapestProvider.mul(5).div(1000));
  // });

  // it('flashLoanWithManyProviders', async () => {
  //   const maxloanWithManyProviders = await flashlender.maxFlashLoanWithManyProviders(dai.address, {gasLimit: 30000000});
  //   const feeWithManyProviders = await flashlender.flashFeeWithManyProviders(dai.address, maxloanWithManyProviders, {gasLimit: 30000000});
  //   const balanceBeforeFeeToWithManyProviders = await dai.balanceOf(feeTo.address);
  //   console.log("maxloanWithManyProviders",maxloanWithManyProviders.toString());
  //   console.log("feeWithManyProviders",feeWithManyProviders.toString());
  //   console.log("pairPoolDAICount",pairPoolDAICount.toString());
  //   await dai.connect(daiuser).transfer(flashborrower.address, feeWithManyProviders, {gasLimit: 30000000});
  //   await flashborrower.connect(user).flashBorrowWithManyProviders(flashlender.address, dai.address, maxloanWithManyProviders, {gasLimit: 30000000});
  //   const totalFlashBalanceWithManyProviders = await flashborrower.totalFlashBalance();
  //   console.log("totalFlashBalanceWithManyProviders",totalFlashBalanceWithManyProviders.toString());
  //   console.log("maxloanWithManyProviders.add(feeWithManyProviders)",maxloanWithManyProviders.add(feeWithManyProviders).toString());
  //   expect(totalFlashBalanceWithManyProviders).to.lte(maxloanWithManyProviders.add(feeWithManyProviders));
  //   expect(totalFlashBalanceWithManyProviders).to.gte(maxloanWithManyProviders.add(feeWithManyProviders).sub(pairPoolDAICount).sub(pairPoolDAICount));
  //   const balanceAfterFeeToWithManyProviders = await dai.balanceOf(feeTo.address);
  //   expect(balanceAfterFeeToWithManyProviders.sub(balanceBeforeFeeToWithManyProviders)).to.lte(maxloanWithManyProviders.mul(5).div(1000).add(pairPoolDAICount));
  //   expect(balanceAfterFeeToWithManyProviders.sub(balanceBeforeFeeToWithManyProviders)).to.gte(maxloanWithManyProviders.mul(5).div(1000).sub(pairPoolDAICount));
  // });

  it('flashLoanWithManyProviders', async () => {
    const maxloanWithManyProviders = await flashlender.maxFlashLoanWithManyProviders(weth.address, {gasLimit: 30000000});
    const feeWithManyProviders = await flashlender.flashFeeWithManyProviders(weth.address, maxloanWithManyProviders, {gasLimit: 30000000});
    const balanceBeforeFeeToWithManyProviders = await weth.balanceOf(feeTo.address);
    console.log("maxloanWithManyProviders",maxloanWithManyProviders.toString());
    console.log("feeWithManyProviders",feeWithManyProviders.toString());
    console.log("pairPoolETHCount",pairPoolETHCount.toString());
    await weth.connect(wethuser).transfer(flashborrower.address, feeWithManyProviders, {gasLimit: 30000000});
    await flashborrower.connect(user).flashBorrowWithManyProviders(flashlender.address, weth.address, maxloanWithManyProviders, {gasLimit: 30000000});
    const totalFlashBalanceWithManyProviders = await flashborrower.totalFlashBalance();
    console.log("totalFlashBalanceWithManyProviders",totalFlashBalanceWithManyProviders.toString());
    console.log("maxloanWithManyProviders.add(feeWithManyProviders)",maxloanWithManyProviders.add(feeWithManyProviders).toString());
    expect(totalFlashBalanceWithManyProviders).to.lte(maxloanWithManyProviders.add(feeWithManyProviders));
    expect(totalFlashBalanceWithManyProviders).to.gte(maxloanWithManyProviders.add(feeWithManyProviders).sub(pairPoolETHCount).sub(pairPoolETHCount));
    const balanceAfterFeeToWithManyProviders = await weth.balanceOf(feeTo.address);
    expect(balanceAfterFeeToWithManyProviders.sub(balanceBeforeFeeToWithManyProviders)).to.lte(maxloanWithManyProviders.mul(5).div(1000).add(pairPoolETHCount));
    expect(balanceAfterFeeToWithManyProviders.sub(balanceBeforeFeeToWithManyProviders)).to.gte(maxloanWithManyProviders.mul(5).div(1000).sub(pairPoolETHCount));
  });
});