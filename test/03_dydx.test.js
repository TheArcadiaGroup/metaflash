const { expect } = require('chai');
const { ethers } = require('hardhat');
const { BigNumber } = require('ethers');

describe('DYDXERC3156', () => {
  let user;
  let weth, dai, usdc, borrower, solo, lender;
  const soloBalance = BigNumber.from(100000);

  beforeEach(async function () {
    [_, user] = await ethers.getSigners();

    const SoloMarginMock = await ethers.getContractFactory('SoloMarginMock');
    const DYDXERC3156 = await ethers.getContractFactory('DYDXFlashLender');
    const MockToken = await ethers.getContractFactory('MockToken');
    const FlashBorrower = await ethers.getContractFactory('DYDXFlashBorrower');

    weth = await MockToken.deploy('WETH', 'WETH');
    dai = await MockToken.deploy('DAI', 'DAI');
    usdc = await MockToken.deploy('USDC', 'USDC');
    solo = await SoloMarginMock.deploy([0, 1, 2], [weth.address, dai.address, usdc.address]);
    lender = await DYDXERC3156.deploy(solo.address);

    borrower = await FlashBorrower.deploy();

    await weth.mint(solo.address, soloBalance);
    await dai.mint(solo.address, soloBalance);
    const fee = await lender.flashFee(weth.address, soloBalance);
    await weth.mint(borrower.address, fee);
    await dai.mint(borrower.address, fee);
  });
  
  it('flash supply', async function () {
    expect(await lender.maxFlashLoan(weth.address, 1)).to.equal(soloBalance);
    expect(await lender.maxFlashLoan(usdc.address, 1)).to.equal('0');
    expect(await lender.maxFlashLoan(lender.address, 1)).to.equal('0');

    expect(await lender.maxFlashLoanWithManyPairs_OR_ManyPools(weth.address)).to.equal(soloBalance);
    expect(await lender.maxFlashLoanWithManyPairs_OR_ManyPools(usdc.address)).to.equal('0');
    expect(await lender.maxFlashLoanWithManyPairs_OR_ManyPools(lender.address)).to.equal('0');
  });

  it('flash fee', async function () {
    expect(await lender.flashFee(weth.address, soloBalance)).to.equal(2);
    expect(await lender.flashFee(usdc.address, soloBalance)).to.equal(0);

    expect(await lender.flashFeeWithManyPairs_OR_ManyPools(weth.address, soloBalance)).to.equal(2);
    expect(await lender.flashFeeWithManyPairs_OR_ManyPools(usdc.address, soloBalance)).to.equal(0);
    // await expect(lender.flashFee(lender.address, soloBalance)).to.revertedWith(
    //   'Unsupported currency',
    // );
  });

  it('flashLoan', async () => {
    const maxloan = await lender.maxFlashLoan(dai.address, 1);
    const fee = await lender.flashFee(dai.address, maxloan);
    await dai.mint(borrower.address, fee);
    await borrower.connect(user).flashBorrow(lender.address, dai.address, maxloan);
    const totalFlashBalance = await borrower.totalFlashBalance();
    expect(totalFlashBalance).to.equal(maxloan.add(fee));
  });

  it('flashLoanWithManyPairs_OR_ManyPools', async () => {
    const maxloan = await lender.maxFlashLoanWithManyPairs_OR_ManyPools(dai.address);
    const fee = await lender.flashFeeWithManyPairs_OR_ManyPools(dai.address, maxloan);
    await dai.mint(borrower.address, fee);
    await borrower.connect(user).flashBorrowWithManyPairs_OR_ManyPools(lender.address, dai.address, maxloan);
    const totalFlashBalance = await borrower.totalFlashBalance();
    expect(totalFlashBalance).to.equal(maxloan.add(fee));
  });
});
