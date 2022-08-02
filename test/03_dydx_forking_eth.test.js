const { expect } = require('chai');
const { ethers } = require('hardhat');
const { BigNumber } = require('ethers');
const ERC20_ABI = require('../contracts/providers/dydx/abi/IERC20.json');
// const SoloMargin_ABI = require('../contracts/providers/dydx/abi/SoloMargin.json');

describe('dydx', () => {
  let owner, user;
  let dai, daiAddress, daiMaxLoan;
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
    soloMarginAddress = "0x1e0447b19bb6ecfdae1e4ae1694b0c3659614e4e";

    dai = await ethers.getContractAt(ERC20_ABI, daiAddress);

    await hre.network.provider.request({
      method: 'hardhat_impersonateAccount',
      params: [daiHolderAddress]
    })

    daiuser = await hre.ethers.provider.getSigner(daiHolderAddress)

    const DYDXFlashLender = await ethers.getContractFactory('DYDXFlashLender');
    const DYDXFlashBorrower = await ethers.getContractFactory('DYDXFlashBorrower');

    lender = await DYDXFlashLender.deploy(soloMarginAddress);
    borrower = await DYDXFlashBorrower.deploy();

    daiMaxLoan = await dai.balanceOf(soloMarginAddress);

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
    beforeETH = await ethers.provider.getBalance(user.address);
    console.log("beforeETH", beforeETH.toString());
    expect(await lender.flashFee(dai.address, daiMaxLoan)).to.equal(2);
    afterETH = await ethers.provider.getBalance(user.address);
    console.log("afterETH", afterETH.toString());
    let feeETH = ethers.BigNumber.from(beforeETH).sub(afterETH);
    console.log("feeETH", feeETH.toString());

    expect(await lender.flashFee(dai.address, daiMaxLoan.add(1))).to.equal(0);

    beforeETH2 = await ethers.provider.getBalance(user.address);
    console.log("beforeETH2", beforeETH2.toString());
    fee = await lender.flashFeeWithManyPairs_OR_ManyPools(dai.address, daiMaxLoan);
    expect(fee).to.equal(2);
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
