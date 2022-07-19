const { expect } = require('chai');
const { ethers } = require('hardhat');
const { BigNumber } = require('ethers');

describe('Fortube', () => {
  let user;
  let weth, dai, usdc, borrower, bank, lender;
  const bal = BigNumber.from(100000);

  beforeEach(async function () {
    [_, user, mulsig, vault] = await ethers.getSigners();

    const Bank = await ethers.getContractFactory('Bank');
    const BankController = await ethers.getContractFactory('BankController');
    const FortubeERC3156 = await ethers.getContractFactory('FortubeFlashLender');
    const MockUSDT = await ethers.getContractFactory('MockUSDT');
    const FlashBorrower = await ethers.getContractFactory('FortubeFlashBorrower');

    usdt = await MockUSDT.deploy();

    bankcontroller = await BankController.deploy();
    await bankcontroller.initialize(mulsig.address);

    bank = await Bank.deploy();
    await bank.initialize(bankcontroller.address, mulsig.address);

    lender = await FortubeERC3156.deploy(bank.address, bankcontroller.address);

    borrower = await FlashBorrower.deploy();
    bankcontroller.setBankEntryAddress(bank.address);
    bankcontroller.setFlashloanParams(100, vault.address)
    await usdt.transfer(bankcontroller.address, bal);
  });

  it('flash supply', async function () {
    expect(await lender.maxFlashLoan(usdt.address, 1)).to.equal(bal);
    // expect(await lender.maxFlashLoan(lender.address, 1)).to.equal('0');
    expect(await lender.maxFlashLoanWithManyPairs_OR_ManyPools(usdt.address)).to.equal(bal);
    // expect(await lender.maxFlashLoanWithManyPairs_OR_ManyPools(lender.address)).to.equal('0');

  });

  it('flash fee', async function () {
    expect(await lender.flashFee(usdt.address, bal)).to.equal(bal.mul(100).div(10000));
    // expect(await lender.flashFee(lender.address,  bal)).to.equal(bal.mul(100).div(10000));
    expect(await lender.flashFeeWithManyPairs_OR_ManyPools(usdt.address, bal)).to.equal(bal.mul(100).div(10000));
    // expect(await lender.flashFeeWithManyPairs_OR_ManyPools(lender.address,  bal)).to.equal(bal.mul(100).div(10000));
  });

  it('flashLoan', async () => {
    const maxloan = await lender.maxFlashLoan(usdt.address, 1);
    const fee = await lender.flashFee(usdt.address, maxloan);
    await usdt.transfer(borrower.address, fee);
    await borrower.connect(user).flashBorrow(lender.address, usdt.address, maxloan);
    const totalFlashBalance = await borrower.totalFlashBalance();
    expect(totalFlashBalance).to.equal(maxloan.add(fee));
  });

  it('flashLoanWithManyPairs_OR_ManyPools', async () => {
    const maxloan = await lender.maxFlashLoanWithManyPairs_OR_ManyPools(usdt.address);
    const fee = await lender.flashFeeWithManyPairs_OR_ManyPools(usdt.address, maxloan);
    await usdt.transfer(borrower.address, fee);
    await borrower.connect(user).flashBorrowWithManyPairs_OR_ManyPools(lender.address, usdt.address, maxloan);
    const totalFlashBalance = await borrower.totalFlashBalance();
    expect(totalFlashBalance).to.equal(maxloan.add(fee));
  });

});
