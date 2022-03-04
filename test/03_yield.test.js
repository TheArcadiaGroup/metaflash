const { expect } = require('chai');
const { ethers } = require('hardhat');
const { BigNumber } = require('ethers');

describe('YieldFYDaiERC3156', () => {
  let user;
  let fyDai, lender, borrower;
  const MAX_UINT112 = '5192296858534827628530496329220095';

  beforeEach(async function () {
    [_, user] = await ethers.getSigners();

    const YieldFYDaiERC3156 = await ethers.getContractFactory('YieldFYDaiERC3156');
    const FYDaiMock = await ethers.getContractFactory('FYDaiMock');
    const FlashBorrower = await ethers.getContractFactory('FlashBorrower');

    // Setup fyDai
    const block = await web3.eth.getBlockNumber();
    const maturity0 = (await web3.eth.getBlock(block)).timestamp + 15778476; // Six months

    fyDai = await FYDaiMock.deploy('FYDAI', 'FYDAI', maturity0);
    lender = await YieldFYDaiERC3156.deploy([fyDai.address]);
    borrower = await FlashBorrower.deploy();
  });

  it('flash supply', async function () {
    expect(await lender.maxFlashLoan(fyDai.address)).to.equal(MAX_UINT112);
    expect(await lender.maxFlashLoan(lender.address)).to.equal('0');
  });

  it('flash fee', async function () {
    const loan = BigNumber.from('1000');
    expect(await lender.flashFee(fyDai.address, loan)).to.equal('0');
    await expect(lender.flashFee(lender.address, loan)).to.revertedWith('Unsupported currency');
  });

  it('fyDai flash loan', async function () {
    const loan = BigNumber.from('1000');
    const balanceBefore = await fyDai.balanceOf(borrower.address);
    await borrower.connect(user).flashBorrow(lender.address, fyDai.address, loan);

    expect(await borrower.flashSender()).to.equal(borrower.address);
    expect(await borrower.flashToken()).to.equal(fyDai.address);
    expect(await borrower.flashAmount()).to.equal(loan);
    expect(await borrower.flashBalance()).to.equal(balanceBefore.add(loan));
    expect(await borrower.flashFee()).to.equal(0);
    expect(await fyDai.balanceOf(borrower.address)).to.equal(balanceBefore);
  });
});
