const { expect } = require('chai');
const { ethers } = require('hardhat');
const { BigNumber } = require('ethers');
const fs = require('fs')
const rawCtoken= fs.readFileSync('./config/creamfinancectoken.json');
const ctokenInfo = JSON.parse(rawCtoken);
const ctokenInfoLength = Object.keys(ctokenInfo).length;
const ERC20_ABI = require('../abi/IERC20.json');

describe('CreamFinance', () => {
  let user, lender, borrower, wethuser;
  const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'
  const ONE_ADDRESS = '0x1111111111111111111111111111111111111111'


  beforeEach(async () => {
    [owner, user] = await ethers.getSigners();
    await network.provider.request({
      method: "hardhat_reset",
      params: [
        {
          forking: {
            jsonRpcUrl: "https://bsc-dataseed4.binance.org"
          },
        },
      ],
    });

    await hre.network.provider.request({
      method: 'hardhat_impersonateAccount',
      params: ["0x2170Ed0880ac9A755fd29B2688956BD959F933F8"]
    })

    wethuser = await hre.ethers.provider.getSigner("0x2170Ed0880ac9A755fd29B2688956BD959F933F8")

    const CreamFinanceFlashLender = await ethers.getContractFactory('CreamFinanceFlashLender');
    const CreamFinanceFlashBorrower = await ethers.getContractFactory('CreamFinanceFlashBorrower');

    wethAddress = "0x2170Ed0880ac9A755fd29B2688956BD959F933F8";
    weth = await ethers.getContractAt(ERC20_ABI, wethAddress);


    lender = await CreamFinanceFlashLender.deploy();
    borrower = await CreamFinanceFlashBorrower.deploy();

    let ctoken = []
    let underlying = []

    for (let i = 1; i <= ctokenInfoLength; i++) {
      ctoken.push(ctokenInfo[i].ctoken);
      underlying.push(ctokenInfo[i].underlying);
    }

    await lender.addCTokens(ctoken, underlying);

    await lender.setFlashLoaner(owner.address);

  });

  it("check operator", async function () {
    expect(await lender.operator()).to.equal(owner.address);
    await expect(lender.connect(user).setOperator(user.address)).to.revertedWith('CreamFinanceFlashLender: Not operator');
    await lender.setOperator(user.address);
    expect(await lender.operator()).to.equal(user.address);
  });

  it("check flashloaner", async function () {
    expect(await lender.flashloaner()).to.equal(owner.address);
    await expect(lender.connect(user).setFlashLoaner(user.address)).to.revertedWith('CreamFinanceFlashLender: Not operator');
    await lender.setFlashLoaner(user.address);
    expect(await lender.flashloaner()).to.equal(user.address);
  });

  it('getFlashLoanInfoListWithCheaperFeePriority', async function () {
    await expect(lender.connect(user).getFlashLoanInfoListWithCheaperFeePriority(weth.address, 1)).to.revertedWith('CreamFinanceFlashLender: Not flashloaner');

    [pairs, maxloans, fees] = await lender.getFlashLoanInfoListWithCheaperFeePriority(weth.address, 1);
    console.log("maxloans.length", maxloans.length);
    if (maxloans.length > 1) {
      for (let i = 0; i < maxloans.length - 1; i++) {
        expect(fees[i]).to.lte(fees[i + 1]);
        if (fees[i] == fees[i + 1]) {
          expect(maxloans[i]).to.gte(maxloans[i + 1]);
        }
      }
    }
  });

  it("add/removeCToken", async function () {
    //add
    await expect(lender.connect(user).addCTokens([ONE_ADDRESS], [ONE_ADDRESS])).to.revertedWith('CreamFinanceFlashLender: Not operator');
    await expect(lender.addCTokens([ONE_ADDRESS], [ONE_ADDRESS, ONE_ADDRESS])).to.revertedWith('CreamFinanceFlashLender: mismatch length of _ctoken, _underlying');
    await expect(lender.addCTokens([ZERO_ADDRESS], [ONE_ADDRESS])).to.revertedWith('CreamFinanceFlashLender: _ctokens address is zero address');
    await expect(lender.addCTokens([ONE_ADDRESS], [ZERO_ADDRESS])).to.revertedWith('CreamFinanceFlashLender: _underlyings address is zero address');

    beforeLength = await lender.getCTokenLength();
    await lender.addCTokens([ONE_ADDRESS], [ONE_ADDRESS]);
    afterLength = await lender.getCTokenLength();
    await expect(beforeLength.add(1)).eq(afterLength);

    beforeLength = await lender.getCTokenLength();
    await lender.addCTokens([ONE_ADDRESS], [ONE_ADDRESS]);
    afterLength = await lender.getCTokenLength();
    await expect(beforeLength).eq(afterLength);

    //remove
    await expect(lender.connect(user).removeCTokens([ONE_ADDRESS])).to.revertedWith('CreamFinanceFlashLender: Not operator');

    beforeLength = await lender.getCTokenLength();
    await lender.removeCTokens([ONE_ADDRESS]);
    afterLength = await lender.getCTokenLength();
    await expect(beforeLength.sub(1)).eq(afterLength);

    beforeLength = await lender.getCTokenLength();
    await lender.removeCTokens([ONE_ADDRESS]);
    afterLength = await lender.getCTokenLength();
    await expect(beforeLength).eq(afterLength);
  });

  it('flash fee', async function () {
    await expect(lender.connect(user).flashFee(ZERO_ADDRESS, wethAddress, "1000")).to.revertedWith('CreamFinanceFlashLender: Not flashloaner');
    for (let i = 1; i <= ctokenInfoLength; i++) {
      if (wethAddress == ctokenInfo[i].underlying) {
        let tempBal = await weth.balanceOf(ctokenInfo[i].ctoken)
        let tempFee = tempBal.mul(3).div(10000);
        expect(await lender.flashFee(ctokenInfo[i].ctoken, weth.address, tempBal)).to.equal(tempFee);
      }
    }
  });

  it('flashLoan', async () => {
    await expect(lender.connect(user).flashLoan(ZERO_ADDRESS, borrower.address, wethAddress, "1000", "0x00000000000000000000000000000000000000000000000000000000000000")).to.revertedWith('CreamFinanceFlashLender: Not flashloaner');
    [pairs, maxloans, fees] = await lender.getFlashLoanInfoListWithCheaperFeePriority(weth.address, 1);
    console.log("maxloans.length",maxloans.length);
    let count = 0;
    for (let i = 0; i < maxloans.length; i++) {
      tempBal = maxloans[i];
      await lender.setFlashLoaner(owner.address);
      tempFee = await lender.flashFee(pairs[i], weth.address, tempBal);
      await lender.setFlashLoaner(borrower.address);
      await weth.connect(wethuser).transfer(borrower.address, tempFee);
      await borrower.connect(user).flashBorrow(pairs[i], lender.address, weth.address, tempBal, { gasLimit: 30000000 });
      const flashSender = await borrower.flashSender();
      expect(flashSender.toLowerCase()).to.equal(borrower.address.toLowerCase());
      const flashToken = await borrower.flashToken();
      expect(flashToken.toLowerCase()).to.equal(weth.address.toLowerCase());
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
    [pairs, maxloans, fees] = await lender.getFlashLoanInfoListWithCheaperFeePriority(weth.address, 1);
    let count = 0;
    for (let i = 0; i < maxloans.length; i++) {
      tempBal = maxloans[i].add(1);
      await lender.setFlashLoaner(owner.address);
      tempFee = await lender.flashFee(pairs[i], weth.address, tempBal);
      await lender.setFlashLoaner(borrower.address);
      await weth.connect(wethuser).transfer(borrower.address, tempFee);
      await expect(borrower.connect(user).flashBorrow(pairs[i], lender.address, weth.address, tempBal, { gasLimit: 30000000 })).to.revertedWith('UniswapV2: INSUFFICIENT_LIQUIDITY');
      count++;
      if (count == 2) {
        break;
      }
    }
  });

  it('invalid case - flashLoan', async () => {
    [pairs, maxloans, fees] = await lender.getFlashLoanInfoListWithCheaperFeePriority(weth.address, 1);
    let count = 0;
    for (let i = 0; i < maxloans.length; i++) {
      tempBal = maxloans[i];
      await lender.setFlashLoaner(owner.address);
      tempFee = await lender.flashFee(pairs[i], weth.address, tempBal);
      await lender.setFlashLoaner(borrower.address);
      await weth.connect(wethuser).transfer(borrower.address, tempFee.sub(1));
      await expect(borrower.connect(user).flashBorrow(pairs[i], lender.address, weth.address, tempBal, { gasLimit: 30000000 })).to.revertedWith('UniswapV2FlashLender: Transfer failed');
      count++;
      if (count == 2) {
        break;
      }
    }
  });
});
