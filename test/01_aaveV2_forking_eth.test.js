const { expect } = require('chai');
const { ethers } = require('hardhat');
const { BigNumber } = require('ethers');
const ERC20_ABI = require('../abi/IERC20.json');
const LendingPool_ABI = require('../contracts/providers/aaveV2/abi/LendingPool.json');
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'

describe('aaveV2', () => {
  let owner, user;
  let dai, daiAddress, aDaiAddress, lendingPool, premium, daiMaxLoan;
  let borrower;

  beforeEach(async () => {
    [owner, user] = await ethers.getSigners();

    await network.provider.request({
      method: "hardhat_reset",
      params: [
        {
          forking: {
            jsonRpcUrl: "https://mainnet.infura.io/v3/51b37822bf064fdb8f0004abcabcfbba"
          },
        },
      ],
    });

    daiHolderAddress = "0x075e72a5eDf65F0A5f44699c7654C1a76941Ddc8";
    daiAddress = "0x6b175474e89094c44da98b954eedeac495271d0f";
    lendingPoolProviderAddress = "0xb53c1a33016b2dc2ff3653530bff1848a515c8c5";
    lendingPoolAddress = "0x7d2768de32b0b80b7a3454c06bdac94a69ddc7a9";

    dai = await ethers.getContractAt(ERC20_ABI, daiAddress);
    lendingPool = await ethers.getContractAt(LendingPool_ABI, lendingPoolAddress);

    await hre.network.provider.request({
      method: 'hardhat_impersonateAccount',
      params: [daiHolderAddress]
    })

    daiuser = await hre.ethers.provider.getSigner(daiHolderAddress)

    const AaveV2FlashLender = await ethers.getContractFactory('AaveV2FlashLender');
    const AaveV2FlashBorrower = await ethers.getContractFactory('AaveV2FlashBorrower');

    lender = await AaveV2FlashLender.deploy(lendingPoolProviderAddress);
    borrower = await AaveV2FlashBorrower.deploy();

    let reserveData = await lendingPool.getReserveData(daiAddress);
    aDaiAddress = reserveData.aTokenAddress;

    premium = await lendingPool.FLASHLOAN_PREMIUM_TOTAL()
    daiMaxLoan = await dai.balanceOf(aDaiAddress);
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
    await expect(lender.connect(user).getFlashLoanInfoListWithCheaperFeePriority(daiAddress, 1)).to.revertedWith('AaveV2FlashLender: Not flashloaner');
    [pairs, maxloans, fees] = await lender.getFlashLoanInfoListWithCheaperFeePriority(daiAddress, 1);
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
    let feeMaxLoan = BigNumber.from(daiMaxLoan).mul(premium).div(10000)
    await expect(lender.connect(user).flashFee(ZERO_ADDRESS, daiAddress, daiMaxLoan)).to.revertedWith('AaveV2FlashLender: Not flashloaner');
    expect(await lender.flashFee(ZERO_ADDRESS, daiAddress, daiMaxLoan)).to.equal(feeMaxLoan);
  });

  it('flashLoan', async () => {
    await expect(lender.connect(user).flashLoan(ZERO_ADDRESS, borrower.address, daiAddress, "1000", "0x00000000000000000000000000000000000000000000000000000000000000")).to.revertedWith('AaveV2FlashLender: Not flashloaner');
    [pairs, maxloans, fees] = await lender.getFlashLoanInfoListWithCheaperFeePriority(daiAddress, 1);
    let count = 0;
    for (let i = 0; i < maxloans.length; i++) {
      tempBal = maxloans[i];
      await lender.setFlashLoaner(owner.address);
      tempFee = await lender.flashFee(pairs[i], daiAddress, tempBal);
      await lender.setFlashLoaner(borrower.address);
      await dai.connect(daiuser).transfer(borrower.address, tempFee, {gasLimit: 30000000});
      await borrower.connect(user).flashBorrow(pairs[i], lender.address, daiAddress, tempBal, { gasLimit: 30000000 });
      const flashSender = await borrower.flashSender();
      expect(flashSender.toLowerCase()).to.equal(borrower.address.toLowerCase());
      const flashToken = await borrower.flashToken();
      expect(flashToken.toLowerCase()).to.equal(daiAddress.toLowerCase());
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
    [pairs, maxloans, fees] = await lender.getFlashLoanInfoListWithCheaperFeePriority(daiAddress, 1);
    let count = 0;
    for (let i = 0; i < maxloans.length; i++) {
      tempBal = maxloans[i].add(1);
      await lender.setFlashLoaner(owner.address);
      tempFee = await lender.flashFee(pairs[i], daiAddress, tempBal);
      await lender.setFlashLoaner(borrower.address);
      await dai.connect(daiuser).transfer(borrower.address, tempFee, {gasLimit: 30000000});
      await expect(borrower.connect(user).flashBorrow(pairs[i], lender.address, daiAddress, tempBal, { gasLimit: 30000000 })).to.revertedWith('SafeERC20: low-level call failed');
      count++;
      if (count == 2) {
        break;
      }
    }
  });

  it('invalid case - flashLoan', async () => {
    [pairs, maxloans, fees] = await lender.getFlashLoanInfoListWithCheaperFeePriority(daiAddress, 1);
    let count = 0;
    for (let i = 0; i < maxloans.length; i++) {
      tempBal = maxloans[i].add(1);
      await lender.setFlashLoaner(owner.address);
      tempFee = await lender.flashFee(pairs[i], daiAddress, tempBal);
      await lender.setFlashLoaner(borrower.address);
      await dai.connect(daiuser).transfer(borrower.address, tempFee.sub(1), {gasLimit: 30000000});
      await expect(borrower.connect(user).flashBorrow(pairs[i], lender.address, daiAddress, tempBal, { gasLimit: 30000000 })).to.revertedWith('SafeERC20: low-level call failed');
      count++;
      if (count == 2) {
        break;
      }
    }
  });
});
