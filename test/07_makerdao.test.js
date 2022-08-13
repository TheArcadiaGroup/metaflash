const { expect } = require('chai');
const { ethers, network } = require('hardhat');
const {
  chainIdByName,
} = require("../js-helpers/deploy");
const { BigNumber } = require('ethers');
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'
describe('MakerDao', () => {
  let dssflashtest, user, chainId, vat, dai, daijoin, dssflash, lender, borrower;
  chainId = chainIdByName(network.name);

  const {
    getBigNumber
} = require('./utilities')

  beforeEach(async function () {
    // const DssFlashTest = await ethers.getContractFactory('DssFlashTest');
    // dssflashtest = await DssFlashTest.deploy({ gasLimit: 30000000 });
    // await dssflashtest.setUp();

    [owner, user] = await ethers.getSigners();
    const Vat = await ethers.getContractFactory('Vat');
    const Dai = await ethers.getContractFactory('Dai');
    const DaiJoin = await ethers.getContractFactory('DaiJoin');
    const DssFlash = await ethers.getContractFactory('DssFlash');
    const MakerDaoFlashLender = await ethers.getContractFactory('MakerDaoFlashLender');
    const MakerDaoFlashBorrower = await ethers.getContractFactory('MakerDaoFlashBorrower');

    vat = await Vat.deploy();
    dai = await Dai.deploy(chainId);
    daijoin = await DaiJoin.deploy(vat.address, dai.address);
    dssflash = await DssFlash.deploy(daijoin.address);
    lender = await MakerDaoFlashLender.deploy(dssflash.address);
    borrower = await MakerDaoFlashBorrower.deploy();
    await dssflash.file("max", getBigNumber(100))
    await vat.rely(dssflash.address);
    await vat.rely(daijoin.address);
    await dai.rely(daijoin.address);

    await lender.setFlashLoaner(owner.address);
  });

  it("check operator", async function () {
    expect(await lender.operator()).to.equal(owner.address);
    await expect(lender.connect(user).setOperator(user.address)).to.revertedWith('MakerDaoFlashLender: Not operator');
    await lender.setOperator(user.address);
    expect(await lender.operator()).to.equal(user.address);
  });

  it("check flashloaner", async function () {
    expect(await lender.flashloaner()).to.equal(owner.address);
    await expect(lender.connect(user).setFlashLoaner(user.address)).to.revertedWith('MakerDaoFlashLender: Not operator');
    await lender.setFlashLoaner(user.address);
    expect(await lender.flashloaner()).to.equal(user.address);
  });

  it('getFlashLoanInfoListWithCheaperFeePriority', async function () {
    await expect(lender.connect(user).getFlashLoanInfoListWithCheaperFeePriority(dai.address, 1)).to.revertedWith('MakerDaoFlashLender: Not flashloaner');
    [pairs, maxloans, fees] = await lender.getFlashLoanInfoListWithCheaperFeePriority(dai.address, 1);
    if(maxloans.length > 1){
      for (let i = 0; i < maxloans.length - 1 ; i++) {
        expect(fees[i]).to.lte(fees[i+1]);
        if(fees[i] == fees[i+1]){
          expect(maxloans[i]).to.gte(maxloans[i+1]);
        }
      }
    }
  });

  it('flash fee', async function () {
    await expect(lender.connect(user).flashFee(ZERO_ADDRESS, dai.address, "1000")).to.revertedWith('MakerDaoFlashLender: Not flashloaner');
    daiMaxLoan = await dssflash.max();
    expect(await lender.flashFee(ZERO_ADDRESS, dai.address, daiMaxLoan)).to.equal(0);
  });

  it('flashLoan', async () => {
    await expect(lender.connect(user).flashLoan(ZERO_ADDRESS, borrower.address, dai.address, "1000", "0x00000000000000000000000000000000000000000000000000000000000000")).to.revertedWith('MakerDaoFlashLender: Not flashloaner');
    [pairs, maxloans, fees] = await lender.getFlashLoanInfoListWithCheaperFeePriority(dai.address, 1);
    let count = 0;
    for (let i = 0; i < maxloans.length; i++) {
      tempBal = maxloans[i];
      await lender.setFlashLoaner(owner.address);
      tempFee = await lender.flashFee(pairs[i], dai.address, tempBal);
      await lender.setFlashLoaner(borrower.address);
      await dai.mint(borrower.address, tempFee);
      await borrower.connect(user).flashBorrow(pairs[i], lender.address, dai.address, tempBal, { gasLimit: 30000000 });
      const flashSender = await borrower.flashSender();
      expect(flashSender.toLowerCase()).to.equal(borrower.address.toLowerCase());
      const flashToken = await borrower.flashToken();
      expect(flashToken.toLowerCase()).to.equal(dai.address.toLowerCase());
      const flashAmount = await borrower.flashAmount();
      expect(flashAmount).to.equal(tempBal);
      const flashFee = await borrower.flashFee();
      expect(flashFee).to.equal(tempFee);
      count++;
      if (count == 2) {
        break;
      }
    }
  });

  it('invalid case - flashLoan', async () => {
    [pairs, maxloans, fees] = await lender.getFlashLoanInfoListWithCheaperFeePriority(dai.address, 1);
    let count = 0;
    for (let i = 0; i < maxloans.length; i++) {
      tempBal = maxloans[i].add(1);
      await lender.setFlashLoaner(owner.address);
      tempFee = await lender.flashFee(pairs[i], dai.address, tempBal);
      await lender.setFlashLoaner(borrower.address);
      await dai.mint(borrower.address, tempFee);
      await expect(borrower.connect(user).flashBorrow(pairs[i], lender.address, dai.address, tempBal, { gasLimit: 30000000 })).to.revertedWith('DssFlash/ceiling-exceeded');
      count++;
      if (count == 2) {
        break;
      }
    }
  });
  
  // it('test_mint_payback', async function () {
  //   await dssflashtest.test_mint_payback();
  // })

  // it('testFail_flash_vat_not_live', async function () {
  //   await expect(dssflashtest.testFail_flash_vat_not_live()).to.revertedWith('DssFlash/vat-not-live');
  // })

  // it('testFail_vat_flash_vat_not_live', async function () {
  //   await expect(dssflashtest.testFail_vat_flash_vat_not_live()).to.revertedWith('DssFlash/vat-not-live');
  // })

  // it('test_mint_zero_amount', async function () {
  //   await dssflashtest.test_mint_zero_amount();
  // })

  // it('testFail_mint_amount_over_line1', async function () {
  //   await expect(dssflashtest.testFail_mint_amount_over_line1()).to.revertedWith('DssFlash/ceiling-exceeded');
  // })

  // it('testFail_mint_amount_over_line2', async function () {
  //   await expect(dssflashtest.testFail_mint_amount_over_line2()).to.revertedWith('DssFlash/ceiling-exceeded');
  // })

  // it('testFail_mint_line_zero1', async function () {
  //   await expect(dssflashtest.testFail_mint_line_zero1()).to.revertedWith('DssFlash/ceiling-exceeded');
  // })

  // it('testFail_mint_line_zero2', async function () {
  //   await expect(dssflashtest.testFail_mint_line_zero2()).to.revertedWith('DssFlash/ceiling-exceeded');
  // })

  // it('testFail_mint_unauthorized_suck1', async function () {
  //   await expect(dssflashtest.testFail_mint_unauthorized_suck1()).to.revertedWith('Vat/not-authorized');
  // })

  // it('testFail_mint_unauthorized_suck2', async function () {
  //   await expect(dssflashtest.testFail_mint_unauthorized_suck2()).to.revertedWith('Vat/not-authorized');
  // })

  // it('testFail_mint_reentrancy1', async function () {
  //   await expect(dssflashtest.testFail_mint_reentrancy1()).to.revertedWith('DssFlash/reentrancy-guard');
  // })

  // it('testFail_mint_reentrancy2', async function () {
  //   await expect(dssflashtest.testFail_mint_reentrancy2()).to.revertedWith('DssFlash/reentrancy-guard');
  // })

  // it('test_dex_trade', async function () {
  //   await dssflashtest.test_dex_trade();
  // })

  // it('testFail_line_limit', async function () {
  //   await expect(dssflashtest.testFail_line_limit()).to.revertedWith('DssFlash/ceiling-too-high');
  // })

  // it('test_max_flash_loan', async function () {
  //   await dssflashtest.test_max_flash_loan();
  // })

  // it('test_flash_fee', async function () {
  //   await dssflashtest.test_flash_fee();
  // })

  // it('testFail_flash_fee', async function () {
  //   await expect(dssflashtest.testFail_flash_fee()).to.revertedWith('DssFlash/token-unsupported');
  // })

  // it('testFail_bad_token', async function () {
  //   await expect(dssflashtest.testFail_bad_token()).to.revertedWith('DssFlash/token-unsupported');
  // })

  // it('testFail_bad_return_hash1', async function () {
  //   await expect(dssflashtest.testFail_bad_return_hash1()).to.revertedWith('DssFlash/callback-failed');
  // })

  // it('testFail_bad_return_hash2', async function () {
  //   await expect(dssflashtest.testFail_bad_return_hash2()).to.revertedWith('DssFlash/callback-failed');
  // })

  // it('testFail_no_callbacks1', async function () {
  //   await expect(dssflashtest.testFail_no_callbacks1()).to.revertedWith('');
  // })

  // it('testFail_no_callbacks2', async function () {
  //   await expect(dssflashtest.testFail_no_callbacks2()).to.revertedWith('');
  // })
});
