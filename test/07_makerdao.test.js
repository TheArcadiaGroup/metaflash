const { expect } = require('chai');
const { ethers, network } = require('hardhat');
const {
  chainIdByName,
} = require("../js-helpers/deploy");
const { BigNumber } = require('ethers');

describe('DssFlash', () => {
  let dssflashtest, user, feeTo, chainId, vat, dai, daijoin, dssflash, lender, borrower;
  chainId = chainIdByName(network.name);

  const {
    getBigNumber
} = require('./utilities')

  beforeEach(async function () {
    const DssFlashTest = await ethers.getContractFactory('DssFlashTest');
    dssflashtest = await DssFlashTest.deploy();
    await dssflashtest.setUp();

    [_, user, feeTo] = await ethers.getSigners();
    const Vat = await ethers.getContractFactory('Vat');
    const Dai = await ethers.getContractFactory('Dai');
    const DaiJoin = await ethers.getContractFactory('DaiJoin');
    const DssFlash = await ethers.getContractFactory('DssFlash');
    const DssFlashERC3156 = await ethers.getContractFactory('DssFlashERC3156');
    const FlashBorrower = await ethers.getContractFactory('FlashBorrower');

    vat = await Vat.deploy();
    dai = await Dai.deploy(chainId);
    daijoin = await DaiJoin.deploy(vat.address, dai.address);
    dssflash = await DssFlash.deploy(daijoin.address);
    lender = await DssFlashERC3156.deploy(dssflash.address, feeTo.address);
    borrower = await FlashBorrower.deploy();
    await dssflash.file("max", getBigNumber(100))
    vat.rely(dssflash.address);
    vat.rely(daijoin.address);
    dai.rely(daijoin.address);
  });

  it("Revert if sender is not owner", async function () {
    await expect(lender.connect(user).setFeeTo(user.address)).to.revertedWith('Ownable: caller is not the owner');
  });

  it("Should update feeTo", async function () {
    await lender.setFeeTo(user.address);
    expect(await lender.FEETO()).to.equal(user.address);
  });

  it('flash supply', async function () {
    expect(await lender.maxFlashLoan(dai.address)).to.equal(getBigNumber(100));
  });

  it('flash fee', async function () {
    expect(await lender.flashFee(dai.address, getBigNumber(100))).to.equal(getBigNumber(100).mul(5).div(1000));
  });

  it('flash loan', async function () {
    let fee = await lender.flashFee(dai.address, getBigNumber(100));

    const balanceBeforeFeeTo = await dai.balanceOf(feeTo.address);

    await dai.mint(borrower.address, fee);
    expect(await dai.balanceOf(borrower.address)).to.equal(fee);
    await borrower.connect(user).flashBorrow(lender.address, dai.address, getBigNumber(100));

    const balanceAfter = await dai.balanceOf(user.address);
    expect(balanceAfter).to.equal(BigNumber.from('0'));
    const flashBalance = await borrower.flashBalance();
    expect(flashBalance).to.equal(getBigNumber(100).add(fee));
    const flashToken = await borrower.flashToken();
    expect(flashToken).to.equal(dai.address);
    const flashAmount = await borrower.flashAmount();
    expect(flashAmount).to.equal(getBigNumber(100));
    const flashFee = await borrower.flashFee();
    expect(flashFee).to.equal(fee);
    const flashSender = await borrower.flashSender();
    expect(flashSender).to.equal(borrower.address);

    const balanceAfterFeeTo = await dai.balanceOf(feeTo.address);
    expect(balanceAfterFeeTo.sub(balanceBeforeFeeTo)).to.equal(getBigNumber(100).mul(500).div(100000));
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
