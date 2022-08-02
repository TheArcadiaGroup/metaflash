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
  if (config[chainId].dydx.SoloMargin === ZERO_ADDRESS) {
    console.log('Error: SoloMargin = ', ZERO_ADDRESS)
    return
  } else {
    const DYDXFlashLender = await ethers.getContractFactory("DYDXFlashLender")
    const DYDXFlashLenderInstance = await DYDXFlashLender.deploy(config[chainId].dydx.SoloMargin);
    let lender = await DYDXFlashLenderInstance.deployed();
    log('Deployed to: ', lender.address);

    deployData['DYDXFlashLender'] = {
      abi: getContractAbi('DYDXFlashLender'),
      address: lender.address,
      deployTransaction: lender.deployTransaction,
    }
  
    saveDeploymentData(chainId, deployData);
    log('\n  Contract Deployment Data saved to "deployments" directory.');
  
    log('\n~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~\n');
  }
};

module.exports.tags = ['dydx']