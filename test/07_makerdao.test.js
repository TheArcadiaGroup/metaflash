const { expect } = require('chai');
const { ethers, network } = require('hardhat');
const {
  chainIdByName,
} = require("../js-helpers/deploy");
const { BigNumber } = require('ethers');

describe('MakerDao', () => {
  let dssflashtest, user, chainId, vat, dai, daijoin, dssflash, lender, borrower;
  chainId = chainIdByName(network.name);

  const {
    getBigNumber
} = require('./utilities')

  beforeEach(async function () {
    const DssFlashTest = await ethers.getContractFactory('DssFlashTest');
    dssflashtest = await DssFlashTest.deploy();
    await dssflashtest.setUp();

    [_, user] = await ethers.getSigners();
    const Vat = await ethers.getContractFactory('Vat');
    const Dai = await ethers.getContractFactory('Dai');
    const DaiJoin = await ethers.getContractFactory('DaiJoin');
    const DssFlash = await ethers.getContractFactory('DssFlash');
    const DssFlashERC3156 = await ethers.getContractFactory('MakerDaoFlashLender');
    const FlashBorrower = await ethers.getContractFactory('MakerDaoFlashBorrower');

    vat = await Vat.deploy();
    dai = await Dai.deploy(chainId);
    daijoin = await DaiJoin.deploy(vat.address, dai.address);
    dssflash = await DssFlash.deploy(daijoin.address);
    lender = await DssFlashERC3156.deploy(dssflash.address);
    borrower = await FlashBorrower.deploy();
    await dssflash.file("max", getBigNumber(100))
    vat.rely(dssflash.address);
    vat.rely(daijoin.address);
    dai.rely(daijoin.address);
  });

  it('flash supply', async function () {
    expect(await lender.maxFlashLoan(dai.address, 1)).to.equal(getBigNumber(100));
    expect(await lender.maxFlashLoan(lender.address, 1)).to.equal('0');
    expect(await lender.maxFlashLoanWithManyPairs_OR_ManyPools(dai.address)).to.equal(getBigNumber(100));
    expect(await lender.maxFlashLoanWithManyPairs_OR_ManyPools(lender.address)).to.equal('0');
  });

  it('flash fee', async function () {
    expect(await lender.flashFee(dai.address, getBigNumber(100))).to.equal(0);
    expect(await lender.flashFee(lender.address,  getBigNumber(100))).to.equal(0);
    expect(await lender.flashFeeWithManyPairs_OR_ManyPools(dai.address, getBigNumber(100))).to.equal(0);
    expect(await lender.flashFeeWithManyPairs_OR_ManyPools(lender.address,  getBigNumber(100))).to.equal(0);
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

  it('test_mint_payback', async function () {
    await dssflashtest.test_mint_payback();
  })

  it('testFail_flash_vat_not_live', async function () {
    await expect(dssflashtest.testFail_flash_vat_not_live()).to.revertedWith('DssFlash/vat-not-live');
  })

  it('testFail_vat_flash_vat_not_live', async function () {
    await expect(dssflashtest.testFail_vat_flash_vat_not_live()).to.revertedWith('DssFlash/vat-not-live');
  })

  it('test_mint_zero_amount', async function () {
    await dssflashtest.test_mint_zero_amount();
  })

  it('testFail_mint_amount_over_line1', async function () {
    await expect(dssflashtest.testFail_mint_amount_over_line1()).to.revertedWith('DssFlash/ceiling-exceeded');
  })

  it('testFail_mint_amount_over_line2', async function () {
    await expect(dssflashtest.testFail_mint_amount_over_line2()).to.revertedWith('DssFlash/ceiling-exceeded');
  })

  it('testFail_mint_line_zero1', async function () {
    await expect(dssflashtest.testFail_mint_line_zero1()).to.revertedWith('DssFlash/ceiling-exceeded');
  })

  it('testFail_mint_line_zero2', async function () {
    await expect(dssflashtest.testFail_mint_line_zero2()).to.revertedWith('DssFlash/ceiling-exceeded');
  })

  it('testFail_mint_unauthorized_suck1', async function () {
    await expect(dssflashtest.testFail_mint_unauthorized_suck1()).to.revertedWith('Vat/not-authorized');
  })

  it('testFail_mint_unauthorized_suck2', async function () {
    await expect(dssflashtest.testFail_mint_unauthorized_suck2()).to.revertedWith('Vat/not-authorized');
  })

  it('testFail_mint_reentrancy1', async function () {
    await expect(dssflashtest.testFail_mint_reentrancy1()).to.revertedWith('DssFlash/reentrancy-guard');
  })

  it('testFail_mint_reentrancy2', async function () {
    await expect(dssflashtest.testFail_mint_reentrancy2()).to.revertedWith('DssFlash/reentrancy-guard');
  })

  it('test_dex_trade', async function () {
    await dssflashtest.test_dex_trade();
  })

  it('testFail_line_limit', async function () {
    await expect(dssflashtest.testFail_line_limit()).to.revertedWith('DssFlash/ceiling-too-high');
  })

  it('test_max_flash_loan', async function () {
    await dssflashtest.test_max_flash_loan();
  })

  it('test_flash_fee', async function () {
    await dssflashtest.test_flash_fee();
  })

  it('testFail_flash_fee', async function () {
    await expect(dssflashtest.testFail_flash_fee()).to.revertedWith('DssFlash/token-unsupported');
  })

  it('testFail_bad_token', async function () {
    await expect(dssflashtest.testFail_bad_token()).to.revertedWith('DssFlash/token-unsupported');
  })

  it('testFail_bad_return_hash1', async function () {
    await expect(dssflashtest.testFail_bad_return_hash1()).to.revertedWith('DssFlash/callback-failed');
  })

  it('testFail_bad_return_hash2', async function () {
    await expect(dssflashtest.testFail_bad_return_hash2()).to.revertedWith('DssFlash/callback-failed');
  })

  it('testFail_no_callbacks1', async function () {
    await expect(dssflashtest.testFail_no_callbacks1()).to.revertedWith('');
  })

  it('testFail_no_callbacks2', async function () {
    await expect(dssflashtest.testFail_no_callbacks2()).to.revertedWith('');
  })
});
