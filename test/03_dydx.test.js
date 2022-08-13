const { expect } = require('chai');
const { ethers } = require('hardhat');
const { BigNumber } = require('ethers');
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'

describe('DYDX', () => {
  let owner, user;
  let weth, dai, usdc, borrower, solo, lender;
  const soloBalance = BigNumber.from(100000);

  beforeEach(async function () {
    [owner, user] = await ethers.getSigners();

    const SoloMarginMock = await ethers.getContractFactory('SoloMarginMock');
    const DYDXERC3156 = await ethers.getContractFactory('DYDXFlashLender');
    const MockToken = await ethers.getContractFactory('MockToken');
    const FlashBorrower = await ethers.getContractFactory('DYDXFlashBorrower');

    weth = await MockToken.deploy('WETH', 'WETH');
    dai = await MockToken.deploy('DAI', 'DAI');
    usdc = await MockToken.deploy('USDC', 'USDC');
    solo = await SoloMarginMock.deploy([0, 1, 2], [weth.address, dai.address, usdc.address]);
    lender = await DYDXERC3156.deploy(solo.address);

    borrower = await FlashBorrower.deploy();

    await weth.mint(solo.address, soloBalance);
    await dai.mint(solo.address, soloBalance);

    await lender.setFlashLoaner(owner.address);
  });
  
  it("check operator", async function () {
    expect(await lender.operator()).to.equal(owner.address);
    await expect(lender.connect(user).setOperator(user.address)).to.revertedWith('DYDXFlashLender: Not operator');
    await lender.setOperator(user.address);
    expect(await lender.operator()).to.equal(user.address);
  });

  it("check flashloaner", async function () {
    expect(await lender.flashloaner()).to.equal(owner.address);
    await expect(lender.connect(user).setFlashLoaner(user.address)).to.revertedWith('DYDXFlashLender: Not operator');
    await lender.setFlashLoaner(user.address);
    expect(await lender.flashloaner()).to.equal(user.address);
  });

  it('getFlashLoanInfoListWithCheaperFeePriority', async function () {
    await expect(lender.connect(user).getFlashLoanInfoListWithCheaperFeePriority(dai.address, 1)).to.revertedWith('DYDXFlashLender: Not flashloaner');
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
    await expect(lender.connect(user).flashFee(ZERO_ADDRESS, dai.address, soloBalance)).to.revertedWith('DYDXFlashLender: Not flashloaner');
    expect(await lender.flashFee(ZERO_ADDRESS, dai.address, soloBalance)).to.equal(2);
  });

  it('flashLoan', async () => {
    await expect(lender.connect(user).flashLoan(ZERO_ADDRESS, borrower.address, dai.address, "1000", "0x00000000000000000000000000000000000000000000000000000000000000")).to.revertedWith('DYDXFlashLender: Not flashloaner');
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
      await expect(borrower.connect(user).flashBorrow(pairs[i], lender.address, dai.address, tempBal, { gasLimit: 30000000 })).to.revertedWith('ERC20: transfer amount exceeds balance');
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
      await dai.mint(borrower.address, tempFee.sub(1));
      await expect(borrower.connect(user).flashBorrow(pairs[i], lender.address, dai.address, tempBal, { gasLimit: 30000000 })).to.revertedWith('ERC20: transfer amount exceeds balance');
      count++;
      if (count == 2) {
        break;
      }
    }
  });
});
