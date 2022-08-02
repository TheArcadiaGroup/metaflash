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

const fs = require('fs')
const rawPairsInfo = fs.readFileSync('./config/defiswappair.json');
const pairsInfo =  JSON.parse(rawPairsInfo);
const pairsInfoLength = Object.keys(pairsInfo).length;

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
  if (config[chainId].defiswap.Factory === ZERO_ADDRESS) {
    console.log('Error: Factory = ', ZERO_ADDRESS)
    return
  } else {
    const CroDefiSwapFlashLender = await ethers.getContractFactory("CroDefiSwapFlashLender")
    const CroDefiSwapFlashLenderInstance = await CroDefiSwapFlashLender.deploy(config[chainId].defiswap.Factory);
    let lender = await CroDefiSwapFlashLenderInstance.deployed();
    log('Deployed to: ', lender.address);
      
    let tokens0 = []
    let tokens1 = []
    let pairs = []

    for (let i = 1; i <= pairsInfoLength; i++) {
      tokens0.push(pairsInfo[i].tokens0);
      tokens1.push(pairsInfo[i].tokens1);
      pairs.push(pairsInfo[i].pairs);
    }

    console.log(pairs);
    await lender.addPairs(tokens0, tokens1, pairs);

    deployData['CroDefiSwapFlashLender'] = {
      abi: getContractAbi('CroDefiSwapFlashLender'),
      address: lender.address,
      deployTransaction: lender.deployTransaction,
    }

    saveDeploymentData(chainId, deployData);
    log('\n  Contract Deployment Data saved to "deployments" directory.');

    log('\n~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~\n');
  }
};

module.exports.tags = ['defiswap']