const {
  chainNameById,
  chainIdByName,
  saveDeploymentData,
  getContractAbi,
  log
} = require("../js-helpers/deploy");
require('dotenv').config()

const fs = require('fs')
const rawPoolsInfo = fs.readFileSync('./config/saddlefinancepool.json');
const poolsInfo = JSON.parse(rawPoolsInfo);
const poolsInfoLength = Object.keys(poolsInfo).length;

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
    const SaddleFinanceFlashLender = await ethers.getContractFactory("SaddleFinanceFlashLender")
    const SaddleFinanceFlashLenderInstance = await SaddleFinanceFlashLender.deploy();
    let lender = await SaddleFinanceFlashLenderInstance.deployed();
    log('Deployed to: ', lender.address);
    
    let pools = []
    for (let i = 1; i <= poolsInfoLength; i++) {
      pools.push(poolsInfo[i].pools);
    }

    console.log(pools);
    await lender.addPools(pools);

    deployData['SaddleFinanceFlashLender'] = {
      abi: getContractAbi('SaddleFinanceFlashLender'),
      address: lender.address,
      deployTransaction: lender.deployTransaction,
    }

    saveDeploymentData(chainId, deployData);
    log('\n  Contract Deployment Data saved to "deployments" directory.');

    log('\n~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~\n');
};

module.exports.tags = ['saddlefinance']