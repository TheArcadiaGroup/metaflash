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

module.exports = async (hre) => {
  const { ethers } = hre;
  const network = await hre.network;
  const signers = await ethers.getSigners()
  const chainId = chainIdByName(network.name);
  const deployData = {};

  log('Contract Deployment');
  log('Network name:', chainNameById(chainId));
  log('Network id:', chainId);
  log('Deployer:', signers[0].address);

  log('Deploying...');
  if (config[chainId].fortube_eth.Bank === ZERO_ADDRESS || config[chainId].fortube_eth.BankController === ZERO_ADDRESS) {
    console.log('Error: Bank or BankController = ', ZERO_ADDRESS)
    return
  } else {
    const FortubeFlashLender = await ethers.getContractFactory("FortubeFlashLender")
    const FortubeFlashLenderInstance = await FortubeFlashLender.deploy(config[chainId].fortube_eth.Bank, config[chainId].fortube_eth.BankController);
    let lender = await FortubeFlashLenderInstance.deployed();
    log('Deployed to: ', lender.address);
        
    deployData['FortubeFlashLender'] = {
      abi: getContractAbi('FortubeFlashLender'),
      address: lender.address,
      deployTransaction: lender.deployTransaction,
    }

    saveDeploymentData(chainId, deployData);
    log('\n  Contract Deployment Data saved to "deployments" directory.');

    log('\n~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~\n');
  }
};

module.exports.tags = ['fortubeeth']