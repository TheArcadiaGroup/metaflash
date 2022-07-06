const { expect } = require('chai');
const { ethers } = require('hardhat');
const { BigNumber } = require('ethers');

describe('FortubeERC3156', () => {
  let user, feeTo;
  let weth, dai, usdc, borrower, bank, lender;
  const bal = BigNumber.from(100000);

  beforeEach(async function () {
    [_, feeTo, user, mulsig, vault] = await ethers.getSigners();

    const Bank = await ethers.getContractFactory('Bank');
    const BankController = await ethers.getContractFactory('BankController');
    const FortubeERC3156 = await ethers.getContractFactory('FortubeERC3156');
    const MockUSDT = await ethers.getContractFactory('MockUSDT');
    const FlashBorrower = await ethers.getContractFactory('FlashBorrower');

    usdt = await MockUSDT.deploy();

    bankcontroller = await BankController.deploy();
    await bankcontroller.initialize(mulsig.address);

    bank = await Bank.deploy();
    await bank.initialize(bankcontroller.address, mulsig.address);

    lender = await FortubeERC3156.deploy(bank.address, bankcontroller.address, feeTo.address);

    borrower = await FlashBorrower.deploy();
    bankcontroller.setBankEntryAddress(bank.address);
    bankcontroller.setFlashloanParams(100, vault.address)
    await usdt.transfer(bankcontroller.address, bal);
    const fee = await lender.flashFee(usdt.address, bal);

    await usdt.transfer(borrower.address, fee);

  });
  it("Revert if sender is not owner", async function () {
    await expect(lender.connect(user).setFeeTo(user.address)).to.revertedWith('Ownable: caller is not the owner');
  });

  it("Should update feeTo", async function () {
    await lender.setFeeTo(user.address);
    expect(await lender.FEETO()).to.equal(user.address);
  });
  
  it('flash supply', async function () {
    expect(await lender.maxFlashLoan(usdt.address)).to.equal(bal);
  });

  it('flash fee', async function () {
    expect(await lender.flashFee(usdt.address, bal)).to.equal(bal.mul(5).div(1000).add(bal.mul(100).div(10000)));
  });

  it('usdt flash loan', async function () {
    const fee = await lender.flashFee(usdt.address, bal);
    
    const balanceBeforeFeeTo = await usdt.balanceOf(feeTo.address);

    await borrower.connect(user).flashBorrow(lender.address, usdt.address, bal);
    expect(await usdt.balanceOf(bankcontroller.address)).to.equal(bal);
    expect(await usdt.balanceOf(vault.address)).to.equal(bal.mul(100).div(10000));

    const balanceAfter = await usdt.balanceOf(await user.getAddress());
    expect(balanceAfter).to.equal(BigNumber.from('0'));
    const flashBalance = await borrower.flashBalance();
    expect(flashBalance).to.equal(bal.add(fee));
    const flashToken = await borrower.flashToken();
    expect(flashToken).to.equal(usdt.address);
    const flashAmount = await borrower.flashAmount();
    expect(flashAmount).to.equal(bal);
    const flashFee = await borrower.flashFee();
    expect(flashFee).to.equal(fee);
    const flashSender = await borrower.flashSender();
    expect(flashSender).to.equal(borrower.address);

    const balanceAfterFeeTo = await usdt.balanceOf(feeTo.address);
    expect(balanceAfterFeeTo.sub(balanceBeforeFeeTo)).to.equal(bal.mul(5).div(1000));
  });
});
