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
  if (config[chainId].aavev2.LendingPoolAddressProvider === ZERO_ADDRESS) {
    console.log('Error: LendingPoolAddressProvider = ', ZERO_ADDRESS)
    return
  } else {
    const AaveV2FlashLender = await ethers.getContractFactory("AaveV2FlashLender")
    const AaveV2FlashLenderInstance = await AaveV2FlashLender.deploy(config[chainId].aavev2.LendingPoolAddressProvider);
    let lender = await AaveV2FlashLenderInstance.deployed();
    log('Deployed to: ', lender.address);

    deployData['AaveV2FlashLender'] = {
      abi: getContractAbi('AaveV2FlashLender'),
      address: lender.address,
      deployTransaction: lender.deployTransaction,
    }
  
    saveDeploymentData(chainId, deployData);
    log('\n  Contract Deployment Data saved to "deployments" directory.');
  
    log('\n~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~\n');
  }
};

module.exports.tags = ['aavev2']