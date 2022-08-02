const { expect } = require('chai');
const { ethers } = require('hardhat');
const { BigNumber } = require('ethers');
const ERC20_ABI = require('../contracts/providers/aaveV2/abi/IERC20.json');
const LendingPool_ABI = require('../contracts/providers/aaveV2/abi/LendingPool.json');

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
  });

  it('flash supply', async function () {
    beforeETH = await ethers.provider.getBalance(user.address);
    console.log("beforeETH", beforeETH.toString());
    expect(await lender.maxFlashLoan(daiAddress, daiMaxLoan)).to.equal(daiMaxLoan);
    afterETH = await ethers.provider.getBalance(user.address);
    console.log("afterETH", afterETH.toString());
    let feeETH = ethers.BigNumber.from(beforeETH).sub(afterETH);
    console.log("feeETH", feeETH.toString());

    expect(await lender.maxFlashLoan(daiAddress, daiMaxLoan.add(1))).to.equal(0);

    beforeETH2 = await ethers.provider.getBalance(user.address);
    console.log("beforeETH2", beforeETH2.toString());
    expect(await lender.maxFlashLoanWithManyPairs_OR_ManyPools(daiAddress)).to.equal(daiMaxLoan);
    afterETH2 = await ethers.provider.getBalance(user.address);
    console.log("afterETH2", afterETH2.toString());
    let feeETH2 = ethers.BigNumber.from(beforeETH2).sub(afterETH2);
    console.log("feeETH2", feeETH2.toString());
  });

  it('flash fee', async function () {
    let feeMaxLoan = BigNumber.from(daiMaxLoan).mul(premium).div(10000)
    beforeETH = await ethers.provider.getBalance(user.address);
    console.log("beforeETH", beforeETH.toString());
    expect(await lender.flashFee(dai.address, daiMaxLoan)).to.equal(feeMaxLoan);
    afterETH = await ethers.provider.getBalance(user.address);
    console.log("afterETH", afterETH.toString());
    let feeETH = ethers.BigNumber.from(beforeETH).sub(afterETH);
    console.log("feeETH", feeETH.toString());

    expect(await lender.flashFee(dai.address, daiMaxLoan.add(1))).to.equal(0);

    beforeETH2 = await ethers.provider.getBalance(user.address);
    console.log("beforeETH2", beforeETH2.toString());
    fee = await lender.flashFeeWithManyPairs_OR_ManyPools(dai.address, daiMaxLoan);
    expect(fee).to.equal(feeMaxLoan);
    afterETH2 = await ethers.provider.getBalance(user.address);
    console.log("afterETH2", afterETH2.toString());
    let feeETH2 = ethers.BigNumber.from(beforeETH2).sub(afterETH2);
    console.log("feeETH2", feeETH2.toString());
  });

  it('flashLoan', async () => {
    beforeETH = await ethers.provider.getBalance(user.address);
    console.log("beforeETH", beforeETH.toString());
    const maxloan = BigNumber.from(await lender.maxFlashLoan(dai.address, 1));
    const fee = BigNumber.from(await lender.flashFee(dai.address, maxloan));
    await dai.connect(daiuser).transfer(borrower.address, fee);
    await borrower.connect(user).flashBorrow(lender.address, dai.address, maxloan);
    const totalFlashBalance = await borrower.totalFlashBalance();
    expect(totalFlashBalance).to.equal(maxloan.add(fee));
    afterETH = await ethers.provider.getBalance(user.address);
    console.log("afterETH", afterETH.toString());
    let feeETH = ethers.BigNumber.from(beforeETH).sub(afterETH);
    console.log("feeETH", feeETH.toString());
  });

  it('flashLoanWithManyPairs_OR_ManyPools', async () => {
    beforeETH = await ethers.provider.getBalance(user.address);
    console.log("beforeETH", beforeETH.toString());
    const maxloan = BigNumber.from(await lender.maxFlashLoanWithManyPairs_OR_ManyPools(dai.address, {gasLimit: 30000000}));
    fee = await lender.flashFeeWithManyPairs_OR_ManyPools(dai.address, maxloan, {gasLimit: 30000000});
    console.log("fee", fee.toString());
    await dai.connect(daiuser).transfer(borrower.address, fee, {gasLimit: 30000000});
    await borrower.connect(user).flashBorrowWithManyPairs_OR_ManyPools(lender.address, dai.address, maxloan, {gasLimit: 30000000});
    const totalFlashBalance = await borrower.totalFlashBalance();
    expect(totalFlashBalance).to.lte(maxloan.add(fee));
    // expect(totalFlashBalance).to.gte(maxloan.add(fee).sub(pairCount));
    afterETH = await ethers.provider.getBalance(user.address);
    console.log("afterETH", afterETH.toString());
    let feeETH = ethers.BigNumber.from(beforeETH).sub(afterETH);
    console.log("feeETH", feeETH.toString());
  });
});
