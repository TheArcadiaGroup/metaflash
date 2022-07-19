const { expect } = require('chai');
const { ethers } = require('hardhat');
const { BigNumber } = require('ethers');

describe('AaveV3', () => {
  let user;
  let weth, dai, aWeth, aDai, pool, poolAddressProvider, lender, premium;
  let borrower;
  let poolconfigurator;
  const aaveBal = BigNumber.from(100000);
  const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'

  beforeEach(async () => {
    [owner, user] = await ethers.getSigners();

    const MockToken = await ethers.getContractFactory('ERC20MockAAVEV3');
    const PoolAddressesProvider = await ethers.getContractFactory(
      'PoolAddressesProvider'
    );
    const AaveERC3156 = await ethers.getContractFactory('AaveV3FlashLender');
    const FlashBorrower = await ethers.getContractFactory('AaveV3FlashBorrower');

    weth = await MockToken.deploy('WETH', 'WETH');
    dai = await MockToken.deploy('DAI', 'DAI');
    usdc = await MockToken.deploy('USDC', 'USDC');

    poolAddressProvider = await PoolAddressesProvider.deploy("marketid", owner.address);

    const BorrowLogic = await ethers.getContractFactory("BorrowLogic");
    const borrowlogic = await BorrowLogic.deploy();
    await borrowlogic.deployed();

    const BridgeLogic = await ethers.getContractFactory("BridgeLogic");
    const bridgelogic = await BridgeLogic.deploy();
    await bridgelogic.deployed();

    const EModeLogic = await ethers.getContractFactory("EModeLogic");
    const emodelogic = await EModeLogic.deploy();
    await emodelogic.deployed();

    const FlashLoanLogic = await ethers.getContractFactory("FlashLoanLogic", {
      signer: owner,
      libraries: {
        BorrowLogic: borrowlogic.address,
      }
    });
    const flashloanlogic = await FlashLoanLogic.deploy();
    await flashloanlogic.deployed();

    const LiquidationLogic = await ethers.getContractFactory("LiquidationLogic");
    const liquidationlogic = await LiquidationLogic.deploy();
    await liquidationlogic.deployed();

    const PoolLogic = await ethers.getContractFactory("PoolLogic");
    const poollogic = await PoolLogic.deploy();
    await poollogic.deployed();

    const SupplyLogic = await ethers.getContractFactory("SupplyLogic");
    const supplylogic = await SupplyLogic.deploy();
    await supplylogic.deployed();

    await poolAddressProvider.setAddress("0x41434c5f41444d494e0000000000000000000000000000000000000000000000", owner.address)

    const ACLManager = await ethers.getContractFactory("ACLManager");
    const aclmanager = await ACLManager.deploy(poolAddressProvider.address);
    await aclmanager.deployed();

    await poolAddressProvider.setAddress("0x41434c5f4d414e41474552000000000000000000000000000000000000000000", aclmanager.address)

    await aclmanager.addPoolAdmin(owner.address)
    await aclmanager.addAssetListingAdmin(owner.address)

    const Pool = await ethers.getContractFactory('PoolMock', {
      signer: owner,
      libraries: {
        BorrowLogic: borrowlogic.address,
        BridgeLogic: bridgelogic.address,
        EModeLogic: emodelogic.address,
        FlashLoanLogic: flashloanlogic.address,
        LiquidationLogic: liquidationlogic.address,
        PoolLogic: poollogic.address,
        SupplyLogic: supplylogic.address,
      }
    });

    pool = await Pool.deploy(poolAddressProvider.address);
    await pool.initialize(poolAddressProvider.address)

    await poolAddressProvider.setAddress("0x504f4f4c00000000000000000000000000000000000000000000000000000000", pool.address)

    const AToken = await ethers.getContractFactory('AToken');
    aWeth = await AToken.deploy(pool.address);
    aDai = await AToken.deploy(pool.address);
    aUsdc = await AToken.deploy(pool.address);
    await aWeth.initialize(pool.address, ZERO_ADDRESS, weth.address, ZERO_ADDRESS, 18, "AWETH", "AWETH", [])
    await aDai.initialize(pool.address, ZERO_ADDRESS, dai.address, ZERO_ADDRESS, 18, "ADAI", "ADAI", [])
    await aUsdc.initialize(pool.address, ZERO_ADDRESS, usdc.address, ZERO_ADDRESS, 18, "USDC", "USDC", [])

    const StableDebtToken = await ethers.getContractFactory("StableDebtToken");
    const stabledebttoken = await StableDebtToken.deploy(pool.address);
    await stabledebttoken.deployed();

    const VariableDebtToken = await ethers.getContractFactory("VariableDebtToken");
    const variabledebttoken = await VariableDebtToken.deploy(pool.address);
    await variabledebttoken.deployed();

    const DefaultReserveInterestRateStrategy = await ethers.getContractFactory("DefaultReserveInterestRateStrategy");
    const reserveinterestratestrategy = await DefaultReserveInterestRateStrategy.deploy(poolAddressProvider.address, 1, 1, 1, 1, 1, 1, 1, 1, 1);
    await reserveinterestratestrategy.deployed();

    const ConfiguratorLogic = await ethers.getContractFactory("ConfiguratorLogic");
    const configuratorlogic = await ConfiguratorLogic.deploy();
    await configuratorlogic.deployed();

    const PoolConfigurator = await ethers.getContractFactory("PoolConfigurator", {
      signer: owner,
      libraries: {
        ConfiguratorLogic: configuratorlogic.address,
      }
    });
    poolconfigurator = await PoolConfigurator.deploy();
    await poolconfigurator.deployed();
    await poolconfigurator.initialize(poolAddressProvider.address);

    await poolAddressProvider.setAddress("0x504f4f4c5f434f4e464947555241544f52000000000000000000000000000000", owner.address)
    
    await pool.initReserve(weth.address, aWeth.address, stabledebttoken.address, variabledebttoken.address, reserveinterestratestrategy.address);
    await pool.initReserve(dai.address, aDai.address, stabledebttoken.address, variabledebttoken.address, reserveinterestratestrategy.address);
    await pool.initReserve(usdc.address, aUsdc.address, stabledebttoken.address, variabledebttoken.address, reserveinterestratestrategy.address);

    lender = await AaveERC3156.deploy(poolAddressProvider.address);

    borrower = await FlashBorrower.deploy();

    await weth.mint(aWeth.address, aaveBal);
    await dai.mint(aDai.address, aaveBal.mul(2));

    await pool.setConfiguration(weth.address, { data: "1" })
    await pool.setConfiguration(dai.address, { data: "1" })
    await poolAddressProvider.setAddress("0x504f4f4c5f434f4e464947555241544f52000000000000000000000000000000", poolconfigurator.address)
    await poolconfigurator.setReserveActive(weth.address, true)
    await poolconfigurator.setReserveActive(dai.address, true)
    await poolconfigurator.setUnbackedMintCap(weth.address, 100000)
    await poolconfigurator.setUnbackedMintCap(dai.address, 100000)
    await aclmanager.addBridge(owner.address)
    await pool.mintUnbacked(weth.address, 10, lender.address, 0)
    await pool.mintUnbacked(dai.address, 10, lender.address, 0)
  });

  it('flash supply', async function () {
    expect(await lender.maxFlashLoan(weth.address, 1)).to.equal(aaveBal);
    expect(await lender.maxFlashLoan(dai.address, 1)).to.equal(aaveBal.mul(2));
    expect(await lender.maxFlashLoan(usdc.address, 1)).to.equal('0');

    expect(await lender.maxFlashLoanWithManyPairs_OR_ManyPools(weth.address)).to.equal(aaveBal);
    expect(await lender.maxFlashLoanWithManyPairs_OR_ManyPools(dai.address)).to.equal(aaveBal.mul(2));
    expect(await lender.maxFlashLoanWithManyPairs_OR_ManyPools(usdc.address)).to.equal('0');
  });

  it('flash fee', async function () {
    premium = await pool.FLASHLOAN_PREMIUM_TOTAL()
    expect(await lender.flashFee(weth.address, aaveBal)).to.equal(aaveBal.mul(premium).div(10000));
    expect(await lender.flashFee(dai.address, aaveBal)).to.equal(aaveBal.mul(premium).div(10000));
    expect(await lender.flashFee(usdc.address, aaveBal)).to.equal(0);

    expect(await lender.flashFeeWithManyPairs_OR_ManyPools(weth.address, aaveBal)).to.equal(aaveBal.mul(premium).div(10000));
    expect(await lender.flashFeeWithManyPairs_OR_ManyPools(dai.address, aaveBal)).to.equal(aaveBal.mul(premium).div(10000));
    expect(await lender.flashFeeWithManyPairs_OR_ManyPools(usdc.address, aaveBal)).to.equal(0);
  });

  it('flashLoan', async () => {
    const maxloan = await lender.maxFlashLoan(weth.address, 1);
    const fee = await lender.flashFee(weth.address, maxloan);

    await weth.connect(user).mint(borrower.address, fee);
    await borrower.connect(user).flashBorrow(lender.address, weth.address, maxloan);

    const totalFlashBalance = await borrower.totalFlashBalance();
    expect(totalFlashBalance).to.equal(maxloan.add(fee));
  });

  it('flashLoanWithManyPairs_OR_ManyPools', async () => {
    const maxloan = await lender.maxFlashLoanWithManyPairs_OR_ManyPools(dai.address);
    const fee = await lender.flashFeeWithManyPairs_OR_ManyPools(dai.address, maxloan);

    await dai.connect(user).mint(borrower.address, fee);
    await borrower.connect(user).flashBorrowWithManyPairs_OR_ManyPools(lender.address, dai.address, maxloan);

    const totalFlashBalance = await borrower.totalFlashBalance();
    expect(totalFlashBalance).to.equal(maxloan.add(fee));
  });
});
