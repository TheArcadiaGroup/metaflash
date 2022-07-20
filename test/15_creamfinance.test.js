const { expect } = require('chai');
const { ethers } = require('hardhat');
const { BigNumber } = require('ethers');

describe('CreamFinance', () => {
  let user, lender, borrower, ethuser;
  let eth, usdt, usdc, crEth, crUsdt, crUsdc;
  const bal = BigNumber.from(100000);
  const ERC20_ABI = require('../contracts/providers/creamfinance/abi/IERC20.json');

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
      await hre.network.provider.request({
        method: 'hardhat_impersonateAccount',
        params: ["0xF977814e90dA44bFA03b6295A0616a897441aceC"]
      })
    ethuser = await hre.ethers.provider.getSigner("0x2170Ed0880ac9A755fd29B2688956BD959F933F8")
    bnbuser = await hre.ethers.provider.getSigner("0xF977814e90dA44bFA03b6295A0616a897441aceC")

    const CreamFinanceERC3156 = await ethers.getContractFactory('CreamFinanceFlashLender');
    const FlashBorrower = await ethers.getContractFactory('CreamFinanceFlashBorrower');

    eth = await ethers.getContractAt(ERC20_ABI, "0x2170Ed0880ac9A755fd29B2688956BD959F933F8");
    usdt = await ethers.getContractAt(ERC20_ABI, "0x55d398326f99059fF775485246999027B3197955");
    usdc = await ethers.getContractAt(ERC20_ABI, "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d");

    crEth = "0xb31f5d117541825D6692c10e4357008EDF3E2BCD";
    crUsdt = "0xEF6d459FE81C3Ed53d292c936b2df5a8084975De";
    crUsdc = "0xD83C88DB3A6cA4a32FFf1603b0f7DDce01F5f727";

    lender = await CreamFinanceERC3156.deploy(owner.address);
    borrower = await FlashBorrower.deploy();

    await user.sendTransaction({
      to: lender.address,
      value: ethers.utils.parseEther("1.0"), // Sends exactly 1.0 ether
    });

    await user.sendTransaction({
      to: borrower.address,
      value: ethers.utils.parseEther("1.0"), // Sends exactly 1.0 ether
    });

    await lender.addCTokens([crEth, crUsdt], [eth.address, usdt.address]);

  });

  it('flash supply', async function () {
    let ethBal = await eth.balanceOf(crEth);
    let usdtBal = await usdt.balanceOf(crUsdt);
    expect(await lender.maxFlashLoan(eth.address, 1)).to.equal(ethBal);
    expect(await lender.maxFlashLoan(usdt.address, 1)).to.equal(usdtBal);
    // expect(await lender.maxFlashLoan(lender.address, 1)).to.equal(0);
    expect(await lender.maxFlashLoanWithManyPairs_OR_ManyPools(eth.address)).to.equal(ethBal);
    expect(await lender.maxFlashLoanWithManyPairs_OR_ManyPools(usdt.address)).to.equal(usdtBal);
    // expect(await lender.maxFlashLoanWithManyPairs_OR_ManyPools(lender.address)).to.equal(0);
  });

  it('flash fee', async function () {
    expect(await lender.flashFee(eth.address, bal)).to.equal(30);
    expect(await lender.flashFee(usdt.address, bal)).to.equal(30);
    // expect(await lender.flashFee(lender.address,  bal)).to.equal(0);
    expect(await lender.flashFeeWithManyPairs_OR_ManyPools(eth.address, bal)).to.equal(30);
    expect(await lender.flashFeeWithManyPairs_OR_ManyPools(usdt.address, bal)).to.equal(30);
    // expect(await lender.flashFeeWithManyPairs_OR_ManyPools(lender.address, bal)).to.equal(0);
  });

  it('flashLoan', async () => {
    const maxloan = await lender.maxFlashLoan(eth.address, 1);
    const fee = await lender.flashFee(eth.address, maxloan);
    await eth.connect(ethuser).transfer(borrower.address, fee);
    await borrower.connect(user).flashBorrow(lender.address, eth.address, maxloan, {gasLimit: 30000000});
    const totalFlashBalance = await borrower.totalFlashBalance();
    expect(totalFlashBalance).to.equal(maxloan.add(fee));
  });

  it('flashLoanWithManyPairs_OR_ManyPools', async () => {
    const maxloan = await lender.maxFlashLoanWithManyPairs_OR_ManyPools(usdt.address);
    const fee = await lender.flashFeeWithManyPairs_OR_ManyPools(usdt.address, maxloan);
    await usdt.connect(ethuser).transfer(borrower.address, fee);
    await borrower.connect(user).flashBorrowWithManyPairs_OR_ManyPools(lender.address, usdt.address, maxloan, {gasLimit: 30000000});
    const totalFlashBalance = await borrower.totalFlashBalance();
    expect(totalFlashBalance).to.equal(maxloan.add(fee));
  });
});
