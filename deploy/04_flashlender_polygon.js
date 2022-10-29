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

  log('Contract Deployment');
  log('Network name:', chainNameById(chainId));
  log('Network id:', chainId);
  log('Deployer:', signers[0].address);

  log('Deploying...');

  let lender = []

  // aave2
  if (config[chainId].aavev2_polygon.LendingPoolAddressProvider === ZERO_ADDRESS) {
    console.log('Error: LendingPoolAddressProvider = ', ZERO_ADDRESS)
  } else {
    const AaveV2FlashLender = await ethers.getContractFactory('AaveV2FlashLender');
    const AaveV2FlashLenderInstance = await AaveV2FlashLender.deploy(config[chainId].aavev2_polygon.LendingPoolAddressProvider);
    aavev2Lender = await AaveV2FlashLenderInstance.deployed();
    lender.push(aavev2Lender);
    console.log('Deployed AaveV2FlashLender to: ', aavev2Lender.address);
  }

  // aave3
  if (config[chainId].aavev3_polygon.LendingPoolAddressProvider === ZERO_ADDRESS) {
    console.log('Error: LendingPoolAddressProvider = ', ZERO_ADDRESS)
  } else {
    const AaveV3FlashLender = await ethers.getContractFactory('AaveV3FlashLender');
    const AaveV3FlashLenderInstance = await AaveV3FlashLender.deploy(config[chainId].aavev3_polygon.LendingPoolAddressProvider);
    aavev3Lender = await AaveV3FlashLenderInstance.deployed();
    lender.push(aavev3Lender);
    console.log('Deployed AaveV3FlashLender to: ', aavev3Lender.address);
  }

  // uniswapv3
  const UniswapV3FlashLender = await ethers.getContractFactory("UniswapV3FlashLender")
  const UniswapV3FlashLenderInstance = await UniswapV3FlashLender.deploy();
  let uniswapv3Lender = await UniswapV3FlashLenderInstance.deployed();

  const rawPairsInfo_uniswapv3 = fs.readFileSync('./config/uniswapv3pair_polygon.json');
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

  // dodo
  const DODOFlashLender = await ethers.getContractFactory("DODOFlashLender")
  const DODOFlashLenderInstance = await DODOFlashLender.deploy();
  let dodoLender = await DODOFlashLenderInstance.deployed();

  const rawPairsInfo_dodo = fs.readFileSync('./config/dodopool_polygon.json');
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

  deployData['FlashLender_Polygon'] = {
    abi: getContractAbi('FlashLender'),
    address: flashlender.address,
    deployTransaction: flashlender.deployTransaction,
  }

  saveDeploymentData(chainId, deployData);
  log('\n  Contract Deployment Data saved to "deployments" directory.');

  log('\n~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~\n');

};

module.exports.tags = ['flashlender_polygon']