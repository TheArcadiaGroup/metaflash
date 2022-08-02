const {
  chainNameById,
  chainIdByName,
  log
} = require("../js-helpers/deploy");
require('dotenv').config()

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
    const DODOERC3156 = await ethers.getContractFactory("DODOERC3156")
    const DODOERC3156Instance = await DODOERC3156.deploy(feeTo);
    let lender = await DODOERC3156Instance.deployed();
    log('Deployed to: ', lender.address);
};

module.exports.tags = ['dodo']