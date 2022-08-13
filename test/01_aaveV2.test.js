const { expect } = require('chai');
const { ethers } = require('hardhat');
const { BigNumber } = require('ethers');
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'

describe('AaveV2', () => {
  let owner, user;
  let weth, dai, aWeth, aDai, lendingPool, lendingPoolAddressProvider, lender, premium;
  let borrower;
  const aaveBal = BigNumber.from(100000);

  beforeEach(async () => {
    [owner, user] = await ethers.getSigners();
    const AToken = await ethers.getContractFactory('ATokenMock');
    const MockToken = await ethers.getContractFactory('ERC20MockAAVE');
    const LendingPoolAddressesProvider = await ethers.getContractFactory(
      'LendingPoolAddressesProviderMock'
    );
    const LendingPool = await ethers.getContractFactory('LendingPoolMock');
    const AaveERC3156 = await ethers.getContractFactory('AaveV2FlashLender');
    const FlashBorrower = await ethers.getContractFactory('AaveV2FlashBorrower');

    weth = await MockToken.deploy('WETH', 'WETH');
    dai = await MockToken.deploy('DAI', 'DAI');
    usdc = await MockToken.deploy('USDC', 'USDC');
    aWeth = await AToken.deploy(weth.address, 'AToken1', 'ATST1');
    aDai = await AToken.deploy(dai.address, 'Atoken2', 'ATST2');
    aUsdc = await AToken.deploy(usdc.address, 'Atoken3', 'ATST3');
    lendingPool = await LendingPool.deploy();

    await lendingPool.addReserve(aWeth.address);
    await lendingPool.addReserve(aDai.address);
    await lendingPool.addReserve(aUsdc.address);
    lendingPoolAddressProvider = await LendingPoolAddressesProvider.deploy(lendingPool.address);
    lender = await AaveERC3156.deploy(lendingPoolAddressProvider.address);

    borrower = await FlashBorrower.deploy();

    await weth.mint(aWeth.address, aaveBal);
    await dai.mint(aDai.address, aaveBal.mul(2));

    await lender.setFlashLoaner(owner.address);
  });

  it("check operator", async function () {
    expect(await lender.operator()).to.equal(owner.address);
    await expect(lender.connect(user).setOperator(user.address)).to.revertedWith('AaveV2FlashLender: Not operator');
    await lender.setOperator(user.address);
    expect(await lender.operator()).to.equal(user.address);
  });

  it("check flashloaner", async function () {
    expect(await lender.flashloaner()).to.equal(owner.address);
    await expect(lender.connect(user).setFlashLoaner(user.address)).to.revertedWith('AaveV2FlashLender: Not operator');
    await lender.setFlashLoaner(user.address);
    expect(await lender.flashloaner()).to.equal(user.address);
  });

  it('getFlashLoanInfoListWithCheaperFeePriority', async function () {
    await expect(lender.connect(user).getFlashLoanInfoListWithCheaperFeePriority(dai.address, 1)).to.revertedWith('AaveV2FlashLender: Not flashloaner');
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
    daiMaxLoan = await dai.balanceOf(aDai.address);
    premium = await lendingPool.FLASHLOAN_PREMIUM_TOTAL()
    let feeMaxLoan = BigNumber.from(daiMaxLoan).mul(premium).div(10000)
    await expect(lender.connect(user).flashFee(ZERO_ADDRESS, dai.address, daiMaxLoan)).to.revertedWith('AaveV2FlashLender: Not flashloaner');
    expect(await lender.flashFee(ZERO_ADDRESS, dai.address, daiMaxLoan)).to.equal(feeMaxLoan);
  });

  it('flashLoan', async () => {
    await expect(lender.connect(user).flashLoan(ZERO_ADDRESS, borrower.address, dai.address, "1000", "0x00000000000000000000000000000000000000000000000000000000000000")).to.revertedWith('AaveV2FlashLender: Not flashloaner');
    [pairs, maxloans, fees] = await lender.getFlashLoanInfoListWithCheaperFeePriority(dai.address, 1);
    let count = 0;
    for (let i = 0; i < maxloans.length; i++) {
      tempBal = maxloans[i];
      await lender.setFlashLoaner(owner.address);
      tempFee = await lender.flashFee(pairs[i], dai.address, tempBal);
      await lender.setFlashLoaner(borrower.address);
      await dai.connect(user).mint(borrower.address, tempFee);
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
      await dai.connect(user).mint(borrower.address, tempFee);
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
      await dai.connect(user).mint(borrower.address, tempFee.sub(1));
      await expect(borrower.connect(user).flashBorrow(pairs[i], lender.address, dai.address, tempBal, { gasLimit: 30000000 })).to.revertedWith('ERC20: transfer amount exceeds balance');
      count++;
      if (count == 2) {
        break;
      }
    }
  });
});
