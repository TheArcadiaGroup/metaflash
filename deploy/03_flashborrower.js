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

  const FlashBorrower = await ethers.getContractFactory("FlashBorrower")
  const FlashBorrowerInstance = await FlashBorrower.deploy();
  let flashborrower = await FlashBorrowerInstance.deployed();

  log('=========================');
  log('Deployed FlashBorrower to: ', flashborrower.address);

  deployData['FlashBorrower'] = {
    abi: getContractAbi('FlashBorrower'),
    address: flashborrower.address,
    deployTransaction: flashborrower.deployTransaction,
  }

  saveDeploymentData(chainId, deployData);
  log('\n  Contract Deployment Data saved to "deployments" directory.');

  log('\n~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~\n');

};

module.exports.tags = ['flashborrower']