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

  // multiplier
  if (config[chainId].multiplier.LendingPool === ZERO_ADDRESS) {
    console.log('Error: LendingPool = ', ZERO_ADDRESS)
  } else {
    const MultiplierFlashLender = await ethers.getContractFactory("MultiplierFlashLender")
    const MultiplierFlashLenderInstance = await MultiplierFlashLender.deploy(config[chainId].multiplier.LendingPool, { gasLimit: 30000000 });
    multiplierLender = await MultiplierFlashLenderInstance.deployed();
    lender.push(multiplierLender);
    console.log('Deployed MultiplierFlashLender to: ', multiplierLender.address)
  }

  // fortube
  if (config[chainId].fortube_bsc.Bank === ZERO_ADDRESS || config[chainId].fortube_bsc.BankController === ZERO_ADDRESS) {
    console.log('Error: Bank or BankController = ', ZERO_ADDRESS)
  } else {
    const FortubeFlashLender = await ethers.getContractFactory("FortubeFlashLender")
    const FortubeFlashLenderInstance = await FortubeFlashLender.deploy(config[chainId].fortube_bsc.Bank, config[chainId].fortube_bsc.BankController, { gasLimit: 30000000 });
    fortubeLender = await FortubeFlashLenderInstance.deployed();
    lender.push(fortubeLender);
    console.log('Deployed FortubeFlashLender to: ', fortubeLender.address)
  }

  // pancakeswap
  const PancakeswapFlashLender = await ethers.getContractFactory("PancakeswapFlashLender")
  const PancakeswapFlashLenderInstance = await PancakeswapFlashLender.deploy({ gasLimit: 30000000 });
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
  lender.push(pancakeswapLender);
  console.log('Deployed PancakeswapFlashLender to: ', pancakeswapLender.address)

  //creamfinance
  const CreamFinanceFlashLender = await ethers.getContractFactory("CreamFinanceFlashLender")
  const CreamFinanceFlashLenderInstance = await CreamFinanceFlashLender.deploy({ gasLimit: 30000000 });
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
  lender.push(creamfinanceLender);
  console.log('Deployed CreamFinanceFlashLender to: ', creamfinanceLender.address)

  // FlashLoan
  const FlashLender = await ethers.getContractFactory('FlashLender');
  flashlender = await FlashLender.deploy({ gasLimit: 30000000 });

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

  deployData['FlashLender_BSC'] = {
    abi: getContractAbi('FlashLender'),
    address: flashlender.address,
    deployTransaction: flashlender.deployTransaction,
  }

  saveDeploymentData(chainId, deployData);
  log('\n  Contract Deployment Data saved to "deployments" directory.');

  log('\n~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~\n');

};

module.exports.tags = ['flashlender_bsc']