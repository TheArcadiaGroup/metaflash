const {
  chainNameById,
  chainIdByName,
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
  const feeTo = "0x6f6Be3C5d4D0f738F8AEe07757e81eD21D973164"

  log('Contract Deployment');
  log('Network name:', chainNameById(chainId));
  log('Network id:', chainId);
  log('Deployer:', signers[0].address);

  log('Deploying...');
  if (config[chainId].dydx.SoloMargin === ZERO_ADDRESS) {
    console.log('Error: SoloMargin = ', ZERO_ADDRESS)
    return
  } else {
    const DYDXERC3156 = await ethers.getContractFactory("DYDXERC3156")
    const DYDXERC3156Instance = await DYDXERC3156.deploy(config[chainId].dydx.SoloMargin, feeTo);
    let lender = await DYDXERC3156Instance.deployed();
    log('Deployed to: ', lender.address);
  }
};

module.exports.tags = ['dydx']