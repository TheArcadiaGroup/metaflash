const { expect } = require('chai');
const { ethers } = require('hardhat');
const { BigNumber } = require('ethers');

describe('DODOERC3156', () => {
  let user, feeTo;
  let basetoken, quotetoken, dvmpool, dvmfactory, lender;
  let borrower, dvmPoolAddress, dvmPoolAddress2;
  const reserves = BigNumber.from(100000);

  beforeEach(async () => {
    [owner, feeTo, user] = await ethers.getSigners();
    
    const CloneFactory = await ethers.getContractFactory('CloneFactory');
    const ERC20Currency = await ethers.getContractFactory('MintableERC20');
    const DVMFactory = await ethers.getContractFactory('DVMFactory');
    const DVM = await ethers.getContractFactory('DVM');
    const FeeRateModel = await ethers.getContractFactory('FeeRateModel');
    const DODOERC3156 = await ethers.getContractFactory('DODOERC3156');
    const FlashBorrower = await ethers.getContractFactory('FlashBorrower');

    basetoken = await ERC20Currency.deploy('BASE', 'BASE', 18);
    quotetoken = await ERC20Currency.deploy('QUOTE', 'QUOTE', 18);
    quotetoken2 = await ERC20Currency.deploy('QUOTE2', 'QUOTE2', 18);

    clonefactory = await CloneFactory.deploy();
    dvmtemplate = await DVM.deploy();
    feeratemodel = await FeeRateModel.deploy();
    dvmfactory = await DVMFactory.deploy(clonefactory.address, dvmtemplate.address, owner.address, feeratemodel.address);

    await dvmfactory.createDODOVendingMachine(basetoken.address, quotetoken.address, 1, 1, 1, true);
    await dvmfactory.createDODOVendingMachine(basetoken.address, quotetoken2.address, 1, 1, 1, true);

    dvmPoolAddress = await dvmfactory.getDODOPool(basetoken.address, quotetoken.address)
    dvmPoolAddress2 = await dvmfactory.getDODOPool(basetoken.address, quotetoken2.address)

    lender = await DODOERC3156.deploy(feeTo.address);

    borrower = await FlashBorrower.deploy();

    await basetoken.mint(dvmPoolAddress[0], reserves);
    await quotetoken.mint(dvmPoolAddress[0], reserves);

    await basetoken.mint(dvmPoolAddress2[0], reserves);
    await quotetoken2.mint(dvmPoolAddress2[0], reserves);

    // // await wethDaiPair.mint();

    await lender.addDVMPool([basetoken.address], [quotetoken.address], [dvmPoolAddress[0]]);
  });

  it("feeTo: Revert if sender is not owner", async function () {
    await expect(lender.connect(user).setFeeTo(user.address)).to.revertedWith('NOT_OWNER');
  });

  it("feeTo: Should update", async function () {
    await lender.setFeeTo(user.address);
    expect(await lender.FEETO()).to.equal(user.address);
  });

  it('addDVMPool: Revert if sender is not owner', async function () {
    await expect(lender.connect(user).addDVMPool([basetoken.address], [quotetoken2.address], [dvmPoolAddress2[0]])).to.revertedWith('NOT_OWNER');
  });

  it("addDVMPool: Should update", async function () {
    await expect(lender.maxFlashLoan(quotetoken2.address)).to.revertedWith('Unsupported currency');
    await lender.addDVMPool([basetoken.address], [quotetoken2.address], [dvmPoolAddress2[0]]);
    expect(await lender.maxFlashLoan(quotetoken2.address)).to.equal(reserves);
  });

  it('removeDVMPool: Revert if sender is not owner', async function () {
    await expect(lender.connect(user).removeDVMPool([dvmPoolAddress2[0]])).to.revertedWith('NOT_OWNER');
  });

  it("removeDVMPool: Should update", async function () {
    await lender.addDVMPool([basetoken.address], [quotetoken2.address], [dvmPoolAddress2[0]]);
    expect(await lender.maxFlashLoan(quotetoken2.address)).to.equal(reserves);
    await lender.removeDVMPool([dvmPoolAddress2[0]]);
    await expect(lender.maxFlashLoan(quotetoken2.address)).to.revertedWith('Unsupported currency');
  });

  it('flash supply', async function () {
    expect(await lender.maxFlashLoan(basetoken.address)).to.equal(reserves);
    expect(await lender.maxFlashLoan(quotetoken.address)).to.equal(reserves);
    await expect(lender.maxFlashLoan(lender.address)).to.revertedWith('Unsupported currency');
  });

  it('flash fee', async function () {
    // expect(await lender.flashFee(basetoken.address, reserves)).to.equal((reserves.mul(3).div(997).add(1)).add(reserves.mul(5).div(1000)));
    // expect(await lender.flashFee(quotetoken.address, reserves)).to.equal((reserves.mul(3).div(997).add(1)).add(reserves.mul(5).div(1000)));
    // await expect(lender.flashFee(lender.address, reserves)).to.revertedWith('Unsupported currency');
  });

  it('basetoken flash loan', async () => {
    const loan = await lender.maxFlashLoan(basetoken.address);
    const fee = await lender.flashFee(basetoken.address, loan);

    const balanceBeforeFeeTo = await basetoken.balanceOf(feeTo.address);

    await basetoken.connect(user).mint(borrower.address, fee);
    await borrower.connect(user).flashBorrow(lender.address, basetoken.address, loan);

    const balanceAfter = await basetoken.balanceOf(await user.getAddress());
    expect(balanceAfter).to.equal(BigNumber.from('0'));
    const flashBalance = await borrower.flashBalance();
    expect(flashBalance).to.equal(loan.add(fee));
    const flashAmount = await borrower.flashAmount();
    expect(flashAmount).to.equal(loan);
    const flashFee = await borrower.flashFee();
    expect(flashFee).to.equal(fee);
    const flashSender = await borrower.flashSender();
    expect(flashSender).to.equal(borrower.address);

    const balanceAfterFeeTo = await basetoken.balanceOf(feeTo.address);
    expect(balanceAfterFeeTo.sub(balanceBeforeFeeTo)).to.equal(loan.mul(5).div(1000));
  });

  it('quotetoken flash loan', async () => {
    const loan = await lender.maxFlashLoan(quotetoken.address);
    const fee = await lender.flashFee(quotetoken.address, loan);

    const balanceBeforeFeeTo = await quotetoken.balanceOf(feeTo.address);
    
    await quotetoken.connect(user).mint(borrower.address, fee);
    await borrower.connect(user).flashBorrow(lender.address, quotetoken.address, loan);

    const balanceAfter = await quotetoken.balanceOf(await user.getAddress());
    expect(balanceAfter).to.equal(BigNumber.from('0'));
    const flashBalance = await borrower.flashBalance();
    expect(flashBalance).to.equal(loan.add(fee));
    const flashAmount = await borrower.flashAmount();
    expect(flashAmount).to.equal(loan);
    const flashFee = await borrower.flashFee();
    expect(flashFee).to.equal(fee);
    const flashSender = await borrower.flashSender();
    expect(flashSender).to.equal(borrower.address);

    const balanceAfterFeeTo = await quotetoken.balanceOf(feeTo.address);
    expect(balanceAfterFeeTo.sub(balanceBeforeFeeTo)).to.equal(loan.mul(5).div(1000));
  });
});
