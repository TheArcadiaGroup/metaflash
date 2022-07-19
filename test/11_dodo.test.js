const { expect } = require('chai');
const { ethers } = require('hardhat');
const { BigNumber } = require('ethers');

describe('DODO', () => {
  let user;
  let basetoken, quotetoken, dvmpool, dvmfactory, lender;
  let borrower, dvmPoolAddress, dvmPoolAddress2;
  const reserves = BigNumber.from(100000);

  beforeEach(async () => {
    [owner, user] = await ethers.getSigners();
    
    const CloneFactory = await ethers.getContractFactory('CloneFactory');
    const ERC20Currency = await ethers.getContractFactory('MintableERC20');
    const DVMFactory = await ethers.getContractFactory('DVMFactory');
    const DVM = await ethers.getContractFactory('DVM');
    const FeeRateModel = await ethers.getContractFactory('FeeRateModel');
    const DODOERC3156 = await ethers.getContractFactory('DODOFlashLender');
    const FlashBorrower = await ethers.getContractFactory('DODOFlashBorrower');

    basetoken = await ERC20Currency.deploy('BASE', 'BASE', 18);
    basetoken2 = await ERC20Currency.deploy('BASE2', 'BASE2', 18);
    quotetoken = await ERC20Currency.deploy('QUOTE', 'QUOTE', 18);
    quotetoken2 = await ERC20Currency.deploy('QUOTE2', 'QUOTE2', 18);

    clonefactory = await CloneFactory.deploy();
    dvmtemplate = await DVM.deploy();
    feeratemodel = await FeeRateModel.deploy();
    dvmfactory = await DVMFactory.deploy(clonefactory.address, dvmtemplate.address, owner.address, feeratemodel.address);

    await dvmfactory.createDODOVendingMachine(basetoken.address, quotetoken.address, 1, 1, 1, true);
    await dvmfactory.createDODOVendingMachine(basetoken.address, quotetoken2.address, 1, 1, 1, true);
    await dvmfactory.createDODOVendingMachine(basetoken2.address, quotetoken.address, 1, 1, 1, true);

    dvmPoolAddress = await dvmfactory.getDODOPool(basetoken.address, quotetoken.address)
    dvmPoolAddress2 = await dvmfactory.getDODOPool(basetoken.address, quotetoken2.address)
    dvmPoolAddress3 = await dvmfactory.getDODOPool(basetoken2.address, quotetoken.address)

    lender = await DODOERC3156.deploy();

    borrower = await FlashBorrower.deploy();

    await basetoken.mint(dvmPoolAddress[0], reserves);
    await quotetoken.mint(dvmPoolAddress[0], reserves);

    await basetoken.mint(dvmPoolAddress2[0], reserves.mul(2));
    await quotetoken2.mint(dvmPoolAddress2[0], reserves.mul(2));

    await basetoken2.mint(dvmPoolAddress3[0], reserves.mul(3));
    await quotetoken.mint(dvmPoolAddress3[0], reserves.mul(3));

    await lender.addDVMPools([basetoken.address], [quotetoken.address], [dvmPoolAddress[0]]);
    await lender.addDVMPools([basetoken.address], [quotetoken2.address], [dvmPoolAddress2[0]]);
  });

  it('addDVMPool: Revert if sender is not owner', async function () {
    await expect(lender.connect(user).addDVMPools([basetoken2.address], [quotetoken.address], [dvmPoolAddress3[0]])).to.revertedWith('NOT_OWNER');
  });

  it("addDVMPool: Should update", async function () {
    expect(await lender.maxFlashLoan(basetoken2.address, 1)).to.equal(0);
    expect(await lender.maxFlashLoan(quotetoken.address, 1)).to.equal(reserves.mul(1).sub(1));
    expect(await lender.maxFlashLoanWithManyPairs_OR_ManyPools(basetoken2.address)).to.equal(0);
    expect(await lender.maxFlashLoanWithManyPairs_OR_ManyPools(quotetoken.address)).to.equal(reserves.mul(1).sub(1));
    await lender.addDVMPools([basetoken2.address], [quotetoken.address], [dvmPoolAddress3[0]]);
    expect(await lender.maxFlashLoan(basetoken2.address, 1)).to.equal(reserves.mul(3).sub(1));
    expect(await lender.maxFlashLoan(quotetoken.address, 1)).to.equal(reserves.mul(3).sub(1));
    expect(await lender.maxFlashLoanWithManyPairs_OR_ManyPools(basetoken2.address)).to.equal(reserves.mul(3).sub(1));
    expect(await lender.maxFlashLoanWithManyPairs_OR_ManyPools(quotetoken.address)).to.equal(reserves.mul(4).sub(2));
  });

  it('removeDVMPool: Revert if sender is not owner', async function () {
    await expect(lender.connect(user).removeDVMPools([dvmPoolAddress2[0]])).to.revertedWith('NOT_OWNER');
  });

  it("removeDVMPool: Should update", async function () {
    await lender.addDVMPools([basetoken2.address], [quotetoken.address], [dvmPoolAddress3[0]]);
    expect(await lender.maxFlashLoan(basetoken2.address, 1)).to.equal(reserves.mul(3).sub(1));
    expect(await lender.maxFlashLoanWithManyPairs_OR_ManyPools(basetoken2.address)).to.equal(reserves.mul(3).sub(1));
    expect(await lender.maxFlashLoan(quotetoken.address, 1)).to.equal(reserves.mul(3).sub(1));
    expect(await lender.maxFlashLoanWithManyPairs_OR_ManyPools(quotetoken.address)).to.equal(reserves.mul(4).sub(2));
    await lender.removeDVMPools([dvmPoolAddress3[0]]);
    expect(await lender.maxFlashLoan(basetoken2.address, 1)).to.equal(0);
    expect(await lender.maxFlashLoanWithManyPairs_OR_ManyPools(basetoken2.address)).to.equal(0);
    expect(await lender.maxFlashLoan(quotetoken.address, 1)).to.equal(reserves.mul(1).sub(1));
    expect(await lender.maxFlashLoanWithManyPairs_OR_ManyPools(quotetoken.address)).to.equal(reserves.mul(1).sub(1));
  });

  it('flash supply', async function () {
    expect(await lender.maxFlashLoan(basetoken.address, 1)).to.equal(reserves.mul(2).sub(1));
    expect(await lender.maxFlashLoan(quotetoken.address, 1)).to.equal(reserves.sub(1));
    expect(await lender.maxFlashLoan(lender.address, 1)).to.equal(0);

    expect(await lender.maxFlashLoanWithManyPairs_OR_ManyPools(basetoken.address)).to.equal(reserves.mul(3).sub(2));
    expect(await lender.maxFlashLoanWithManyPairs_OR_ManyPools(quotetoken.address)).to.equal(reserves.sub(1));
    expect(await lender.maxFlashLoanWithManyPairs_OR_ManyPools(lender.address)).to.equal(0);
  });

  it('flash fee', async function () {
    expect(await lender.flashFee(basetoken.address, reserves)).to.equal(0);
    expect(await lender.flashFee(quotetoken.address, reserves.sub(1))).to.equal(0);
    expect(await lender.flashFee(lender.address, reserves)).to.equal(0);

    expect(await lender.flashFeeWithManyPairs_OR_ManyPools(basetoken.address, reserves)).to.equal(0);
    expect(await lender.flashFeeWithManyPairs_OR_ManyPools(quotetoken.address, reserves)).to.equal(0);
    expect(await lender.flashFeeWithManyPairs_OR_ManyPools(lender.address, reserves)).to.equal(0);
  });

  it('flashLoan', async () => {
    const maxloan = await lender.maxFlashLoan(basetoken.address, 1);
    const fee = await lender.flashFee(basetoken.address, maxloan);
    await basetoken.connect(user).mint(borrower.address, fee);
    await borrower.connect(user).flashBorrow(lender.address, basetoken.address, maxloan);
    const totalFlashBalance = await borrower.totalFlashBalance();
    expect(totalFlashBalance).to.equal(maxloan.add(fee));
  });

  it('flashLoanWithManyPairs_OR_ManyPools', async () => {
    const maxloan = await lender.maxFlashLoanWithManyPairs_OR_ManyPools(quotetoken.address);
    const fee = await lender.flashFeeWithManyPairs_OR_ManyPools(quotetoken.address, maxloan);
    await quotetoken.connect(user).mint(borrower.address, fee);
    await borrower.connect(user).flashBorrowWithManyPairs_OR_ManyPools(lender.address, quotetoken.address, maxloan);
    const totalFlashBalance = await borrower.totalFlashBalance();
    expect(totalFlashBalance).to.equal(maxloan.add(fee));
  });
});
