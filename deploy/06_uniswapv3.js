const {
  chainNameById,
  chainIdByName,
  saveDeploymentData,
  getContractAbi,
  log
} = require("../js-helpers/deploy");
require('dotenv').config()

const fs = require('fs')
const rawPairsInfo = fs.readFileSync('./config/uniswapv3pair.json');
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
    const UniswapV3FlashLender = await ethers.getContractFactory("UniswapV3FlashLender")
    const UniswapV3FlashLenderInstance = await UniswapV3FlashLender.deploy();
    let lender = await UniswapV3FlashLenderInstance.deployed();
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

    deployData['UniswapV3FlashLender'] = {
      abi: getContractAbi('UniswapV3FlashLender'),
      address: lender.address,
      deployTransaction: lender.deployTransaction,
    }
  
    saveDeploymentData(chainId, deployData);
    log('\n  Contract Deployment Data saved to "deployments" directory.');
  
    log('\n~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~\n');
};

module.exports.tags = ['uniswapv3']