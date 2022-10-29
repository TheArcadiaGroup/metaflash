const {
  chainNameById,
  chainIdByName,
  saveDeploymentData,
  getContractAbi,
  log
} = require("../js-helpers/deploy");

require('dotenv').config()
const config = require('../config/config.json')
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'
const deployData = {};
const fs = require('fs')

module.exports = async (hre) => {
  const { ethers } = hre;
  const network = await hre.network;
  const signers = await ethers.getSigners()
  const chainId = chainIdByName(network.name);
  console.log("chainId",chainId);

  log('Contract Deployment');
  log('Network name:', chainNameById(chainId));
  log('Network id:', chainId);
  log('Deployer:', signers[0].address);

  log('Deploying...');

  let lender = []

  // aave2
  if (config[chainId].aavev2.LendingPoolAddressProvider === ZERO_ADDRESS) {
    console.log('Error: LendingPoolAddressProvider = ', ZERO_ADDRESS)
  } else {
    const AaveV2FlashLender = await ethers.getContractFactory('AaveV2FlashLender');
    const AaveV2FlashLenderInstance = await AaveV2FlashLender.deploy(config[chainId].aavev2.LendingPoolAddressProvider);
    aavev2Lender = await AaveV2FlashLenderInstance.deployed();
    lender.push(aavev2Lender);
    console.log('Deployed AaveV2FlashLender to: ', aavev2Lender.address);
  }

  // dydx
  if (config[chainId].dydx.SoloMargin === ZERO_ADDRESS) {
    console.log('Error: SoloMargin = ', ZERO_ADDRESS)
  } else {
    const DYDXFlashLender = await ethers.getContractFactory("DYDXFlashLender")
    const DYDXFlashLenderInstance = await DYDXFlashLender.deploy(config[chainId].dydx.SoloMargin);
    dydxLender = await DYDXFlashLenderInstance.deployed();
    lender.push(dydxLender);
    console.log('Deployed DYDXFlashLender to: ', dydxLender.address);
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
  console.log('Deployed UniswapV2FlashLender to: ', uniswapv2Lender.address);

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
  console.log('Deployed UniswapV3FlashLender to: ', uniswapv3Lender.address);

  // makerdao
  if (config[chainId].makerdao.DssFlash === ZERO_ADDRESS) {
    console.log('Error: DssFlash = ', ZERO_ADDRESS)
  } else {
    const MakerDaoFlashLender = await ethers.getContractFactory("MakerDaoFlashLender")
    const MakerDaoFlashLenderInstance = await MakerDaoFlashLender.deploy(config[chainId].makerdao.DssFlash);
    makerdaoLender = await MakerDaoFlashLenderInstance.deployed();
    lender.push(makerdaoLender);
    console.log('Deployed MakerDaoFlashLender to: ', makerdaoLender.address);
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
  console.log('Deployed SaddleFinanceFlashLender to: ', saddlefinanceLender.address);

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
    console.log('Deployed CroDefiSwapFlashLender to: ', defiswapLender.address);
  }
  // fortube
  if (config[chainId].fortube_eth.Bank === ZERO_ADDRESS || config[chainId].fortube_eth.BankController === ZERO_ADDRESS) {
    console.log('Error: Bank or BankController = ', ZERO_ADDRESS)
  } else {
    const FortubeFlashLender = await ethers.getContractFactory("FortubeFlashLender")
    const FortubeFlashLenderInstance = await FortubeFlashLender.deploy(config[chainId].fortube_eth.Bank, config[chainId].fortube_eth.BankController);
    fortubeLender = await FortubeFlashLenderInstance.deployed();
    lender.push(fortubeLender);
    console.log('Deployed FortubeFlashLender to: ', fortubeLender.address);
  }
  // euler
  if (config[chainId].euler.FlashLoan === ZERO_ADDRESS) {
    console.log('Error: FlashLoan = ', ZERO_ADDRESS)
  } else {
    const EulerFlashLender = await ethers.getContractFactory("EulerFlashLender")
    const EulerFlashLenderInstance = await EulerFlashLender.deploy(config[chainId].euler.FlashLoan);
    eulerLender = await EulerFlashLenderInstance.deployed();
    lender.push(eulerLender);
    console.log('Deployed EulerFlashLender to: ', eulerLender.address);
  }

  // dodo
  const DODOFlashLender = await ethers.getContractFactory("DODOFlashLender")
  const DODOFlashLenderInstance = await DODOFlashLender.deploy();
  let dodoLender = await DODOFlashLenderInstance.deployed();

  const rawPairsInfo_dodo = fs.readFileSync('./config/dodopool_ethereum.json');
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

  await dodoLender.addPools(basetoken_dodo, quotetoken_dodo, pool_dodo)
  lender.push(dodoLender);
  console.log('Deployed DODOFlashLender to: ', dodoLender.address);

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

  log('=========================');
  log('Deployed FlashLender to: ', flashlender.address);

  deployData['FlashLender_ETH'] = {
    abi: getContractAbi('FlashLender'),
    address: flashlender.address,
    deployTransaction: flashlender.deployTransaction,
  }

  saveDeploymentData(chainId, deployData);
  log('\n  Contract Deployment Data saved to "deployments" directory.');

  log('\n~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~\n');

};

module.exports.tags = ['flashlender_eth']