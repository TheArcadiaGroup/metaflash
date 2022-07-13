const { expect } = require('chai');
const { ethers } = require('hardhat');
const { BigNumber } = require('ethers');

describe('AaveERC3156', () => {
  let user;
  let weth, dai, aWeth, aDai, lendingPool, lendingPoolAddressProvider, lender, premium;
  let borrower;
  const aaveBal = BigNumber.from(100000);

  beforeEach(async () => {
    [_, user] = await ethers.getSigners();
    const AToken = await ethers.getContractFactory('ATokenMock');
    const MockToken = await ethers.getContractFactory('ERC20MockAAVE');
    const LendingPoolAddressesProvider = await ethers.getContractFactory(
      'LendingPoolAddressesProviderMock'
    );
    const LendingPool = await ethers.getContractFactory('LendingPoolMock');
    const AaveERC3156 = await ethers.getContractFactory('AaveV2FlashLender');
    const FlashBorrower = await ethers.getContractFactory('AaveV2FlashBorrower');

    weth = await MockToken.deploy('WETH', 'WETH');
    dai = await MockToken.deploy('DAI', 'DAI');
    aWeth = await AToken.deploy(weth.address, 'AToken1', 'ATST1');
    aDai = await AToken.deploy(dai.address, 'Atoken2', 'ATST2');
    lendingPool = await LendingPool.deploy();

    await lendingPool.addReserve(aWeth.address);
    await lendingPool.addReserve(aDai.address);
    lendingPoolAddressProvider = await LendingPoolAddressesProvider.deploy(lendingPool.address);
    lender = await AaveERC3156.deploy(lendingPoolAddressProvider.address);

    borrower = await FlashBorrower.deploy();

    await weth.mint(aWeth.address, aaveBal);
    await dai.mint(aDai.address, aaveBal.mul(2));
  });

  it('flash supply', async function () {
    expect(await lender.maxFlashLoan(weth.address)).to.equal(aaveBal);
    expect(await lender.maxFlashLoan(dai.address)).to.equal(aaveBal.mul(2));
    expect(await lender.maxFlashLoan(lender.address)).to.equal('0');

    expect(await lender.maxFlashLoanWithManyPairs_OR_ManyPools(weth.address)).to.equal(aaveBal);
    expect(await lender.maxFlashLoanWithManyPairs_OR_ManyPools(dai.address)).to.equal(aaveBal.mul(2));
    expect(await lender.maxFlashLoanWithManyPairs_OR_ManyPools(lender.address)).to.equal('0');
  });

  it('flash fee', async function () {
    premium = await lendingPool.FLASHLOAN_PREMIUM_TOTAL()
    expect(await lender.flashFee(weth.address, aaveBal)).to.equal(aaveBal.mul(premium).div(10000));
    expect(await lender.flashFee(dai.address, aaveBal)).to.equal(aaveBal.mul(premium).div(10000));
    expect(await lender.flashFee(lender.address, aaveBal)).to.equal(0);

    expect(await lender.flashFeeWithManyPairs_OR_ManyPools(weth.address, aaveBal)).to.equal(aaveBal.mul(premium).div(10000));
    expect(await lender.flashFeeWithManyPairs_OR_ManyPools(dai.address, aaveBal)).to.equal(aaveBal.mul(premium).div(10000));
    expect(await lender.flashFeeWithManyPairs_OR_ManyPools(lender.address, aaveBal)).to.equal(0);
  });

  it('flashLoan', async () => {
    const maxloan = await lender.maxFlashLoan(weth.address);
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
