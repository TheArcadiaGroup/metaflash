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
  if (config[chainId].makerdao.DssFlash === ZERO_ADDRESS) {
    console.log('Error: DssFlash = ', ZERO_ADDRESS)
    return
  } else {
    const MakerDaoFlashLender = await ethers.getContractFactory("MakerDaoFlashLender")
    const MakerDaoFlashLenderInstance = await MakerDaoFlashLender.deploy(config[chainId].makerdao.DssFlash);
    let lender = await MakerDaoFlashLenderInstance.deployed();
    log('Deployed to: ', lender.address);

    deployData['MakerDaoFlashLender'] = {
      abi: getContractAbi('MakerDaoFlashLender'),
      address: lender.address,
      deployTransaction: lender.deployTransaction,
    }

    saveDeploymentData(chainId, deployData);
    log('\n  Contract Deployment Data saved to "deployments" directory.');

    log('\n~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~\n');
  }
};

module.exports.tags = ['makerdao']