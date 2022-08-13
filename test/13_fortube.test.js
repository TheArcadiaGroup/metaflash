const { expect } = require('chai');
const { ethers } = require('hardhat');
const { BigNumber } = require('ethers');

describe('Fortube', () => {
  let user;
  let borrower, bank, lender, flashloanFeeBips;
  const bal = BigNumber.from("1000000000000000000");
  const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'

  beforeEach(async function () {
    [owner, user, mulsig, vault] = await ethers.getSigners();

    const Bank = await ethers.getContractFactory('Bank');
    const BankController = await ethers.getContractFactory('BankController');
    const MockUSDT = await ethers.getContractFactory('MockUSDT');
    const FortubeFlashLender = await ethers.getContractFactory('FortubeFlashLender');
    const FortubeFlashBorrower = await ethers.getContractFactory('FortubeFlashBorrower');

    usdt = await MockUSDT.deploy();

    bankcontroller = await BankController.deploy();
    await bankcontroller.initialize(mulsig.address);

    bank = await Bank.deploy();
    await bank.initialize(bankcontroller.address, mulsig.address);

    lender = await FortubeFlashLender.deploy(bank.address, bankcontroller.address);
    borrower = await FortubeFlashBorrower.deploy();

    bankcontroller.setBankEntryAddress(bank.address);
    bankcontroller.setFlashloanParams(100, vault.address)
    await usdt.transfer(bankcontroller.address, bal);

    flashloanFeeBips = await bankcontroller.flashloanFeeBips();
    await lender.setFlashLoaner(owner.address);
  });

  it("check operator", async function () {
    expect(await lender.operator()).to.equal(owner.address);
    await expect(lender.connect(user).setOperator(user.address)).to.revertedWith('FlashLender: Not operator');
    await lender.setOperator(user.address);
    expect(await lender.operator()).to.equal(user.address);
  });

  it("check flashloaner", async function () {
    expect(await lender.flashloaner()).to.equal(owner.address);
    await expect(lender.connect(user).setFlashLoaner(user.address)).to.revertedWith('FlashLender: Not operator');
    await lender.setFlashLoaner(user.address);
    expect(await lender.flashloaner()).to.equal(user.address);
  });

  it('getFlashLoanInfoListWithCheaperFeePriority', async function () {
    await expect(lender.connect(user).getFlashLoanInfoListWithCheaperFeePriority(usdt.address, 1)).to.revertedWith('FlashLender: Not flashloaner');
    [pairs, maxloans, fees] = await lender.getFlashLoanInfoListWithCheaperFeePriority(usdt.address, 1);
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
    await expect(lender.connect(user).flashFee(ZERO_ADDRESS, usdt.address, "1000")).to.revertedWith('FlashLender: Not flashloaner');
    let feeMaxLoan = BigNumber.from(bal).mul(flashloanFeeBips).div(10000)
    expect(await lender.flashFee(ZERO_ADDRESS, usdt.address, bal)).to.equal(feeMaxLoan);
  });

  it('flashLoan', async () => {
    await expect(lender.connect(user).flashLoan(ZERO_ADDRESS, borrower.address, usdt.address, "1000", "0x00000000000000000000000000000000000000000000000000000000000000")).to.revertedWith('FlashLender: Not flashloaner');
    [pairs, maxloans, fees] = await lender.getFlashLoanInfoListWithCheaperFeePriority(usdt.address, 1);
    let count = 0;
    for (let i = 0; i < maxloans.length; i++) {
      tempBal = maxloans[i];
      await lender.setFlashLoaner(owner.address);
      tempFee = await lender.flashFee(pairs[i], usdt.address, tempBal);
      await lender.setFlashLoaner(borrower.address);
      await usdt.transfer(borrower.address, tempFee);
      await borrower.connect(user).flashBorrow(pairs[i], lender.address, usdt.address, tempBal, { gasLimit: 30000000 });
      const flashSender = await borrower.flashSender();
      expect(flashSender.toLowerCase()).to.equal(borrower.address.toLowerCase());
      const flashToken = await borrower.flashToken();
      expect(flashToken.toLowerCase()).to.equal(usdt.address.toLowerCase());
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
    [pairs, maxloans, fees] = await lender.getFlashLoanInfoListWithCheaperFeePriority(usdt.address, 1);
    let count = 0;
    for (let i = 0; i < maxloans.length; i++) {
      tempBal = maxloans[i].add(1);
      await lender.setFlashLoaner(owner.address);
      tempFee = await lender.flashFee(pairs[i], usdt.address, tempBal);
      await lender.setFlashLoaner(borrower.address);
      await usdt.transfer(borrower.address, tempFee);
      await expect(borrower.connect(user).flashBorrow(pairs[i], lender.address, usdt.address, tempBal, { gasLimit: 30000000 })).to.revertedWith('insufficient flashloan liquidity');
      count++;
      if (count == 2) {
        break;
      }
    }

    it('invalid case - flashLoan', async () => {
      [pairs, maxloans, fees] = await lender.getFlashLoanInfoListWithCheaperFeePriority(usdt.address, 1);
      let count = 0;
      for (let i = 0; i < maxloans.length; i++) {
        tempBal = maxloans[i];
        await lender.setFlashLoaner(owner.address);
        tempFee = await lender.flashFee(pairs[i], usdt.address, tempBal);
        await lender.setFlashLoaner(borrower.address);
        await usdt.transfer(borrower.address, tempFee.sub(1));
        expect(borrower.connect(user).flashBorrow(pairs[i], lender.address, usdt.address, tempBal, { gasLimit: 30000000 })).to.revertedWith('Dai/insufficient-balance');
        count++;
        if (count == 2) {
          break;
        }
      }
    });
  });
});
