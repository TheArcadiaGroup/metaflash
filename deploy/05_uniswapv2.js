const {
  chainNameById,
  chainIdByName,
  saveDeploymentData,
  getContractAbi,
  log
} = require("../js-helpers/deploy");
require('dotenv').config()

const fs = require('fs')
const rawPairsInfo = fs.readFileSync('./config/uniswapv2pair.json');
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
    const UniswapV2FlashLender = await ethers.getContractFactory("UniswapV2FlashLender")
    const UniswapV2FlashLenderInstance = await UniswapV2FlashLender.deploy();
    let lender = await UniswapV2FlashLenderInstance.deployed();
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

    deployData['UniswapV2FlashLender'] = {
      abi: getContractAbi('UniswapV2FlashLender'),
      address: lender.address,
      deployTransaction: lender.deployTransaction,
    }
  
    saveDeploymentData(chainId, deployData);
    log('\n  Contract Deployment Data saved to "deployments" directory.');
  
    log('\n~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~\n');
};

module.exports.tags = ['uniswapv2']