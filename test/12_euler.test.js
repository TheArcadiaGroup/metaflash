const { expect } = require('chai');
const { ethers } = require('hardhat');
const { BigNumber } = require('ethers');

describe('Euler', () => {
  let user, lender, borrower, wethuser;
  let weth, usdt, usdc, wethAddress;
  const bal = BigNumber.from(100000);
  const ERC20_ABI = require('../contracts/providers/euler/abi/IERC20.json');

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

    await hre.network.provider.request({
        method: 'hardhat_impersonateAccount',
        params: ["0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2"]
      })

    wethuser = await hre.ethers.provider.getSigner("0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2")

    const EulerFlashLender = await ethers.getContractFactory('EulerFlashLender');
    const EulerFlashBorrower = await ethers.getContractFactory('EulerFlashBorrower');

    wethAddress = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
    weth = await ethers.getContractAt(ERC20_ABI, "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2");
    usdt = await ethers.getContractAt(ERC20_ABI, "0xdAC17F958D2ee523a2206206994597C13D831ec7");
    usdc = await ethers.getContractAt(ERC20_ABI, "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48");

    eulerAddress = "0x27182842E098f60e3D576794A5bFFb0777E025d3";
    flashLoanAddress = "0x07df2ad9878F8797B4055230bbAE5C808b8259b3";

    lender = await EulerFlashLender.deploy(flashLoanAddress);
    borrower = await EulerFlashBorrower.deploy();

    await user.sendTransaction({
      to: lender.address,
      value: ethers.utils.parseEther("1.0"), 
    });

    await user.sendTransaction({
      to: borrower.address,
      value: ethers.utils.parseEther("1.0"), 
    });

  });

  it('flash supply', async function () {
    let wethBal = await weth.balanceOf(eulerAddress);
    let usdtBal = await usdt.balanceOf(eulerAddress);
    expect(await lender.maxFlashLoan(wethAddress, 1)).to.equal(wethBal);
    expect(await lender.maxFlashLoan(usdt.address, 1)).to.equal(usdtBal);
    expect(await lender.maxFlashLoanWithManyPairs_OR_ManyPools(weth.address)).to.equal(wethBal);
    expect(await lender.maxFlashLoanWithManyPairs_OR_ManyPools(usdt.address)).to.equal(usdtBal);
  });

  it('flash fee', async function () {
    expect(await lender.flashFee(weth.address, bal)).to.equal(0);
    expect(await lender.flashFee(usdt.address, bal)).to.equal(0);
    expect(await lender.flashFeeWithManyPairs_OR_ManyPools(weth.address, bal)).to.equal(0);
    expect(await lender.flashFeeWithManyPairs_OR_ManyPools(usdt.address, bal)).to.equal(0);
  });

  it('flashLoan', async () => {
    const maxloan = await lender.maxFlashLoan(weth.address, 1);
    const fee = await lender.flashFee(weth.address, maxloan);
    await weth.connect(wethuser).transfer(borrower.address, fee);
    await borrower.connect(user).flashBorrow(lender.address, weth.address, maxloan, {gasLimit: 30000000});
    const totalFlashBalance = await borrower.totalFlashBalance();
    expect(totalFlashBalance).to.equal(maxloan.add(fee));
  });

  it('flashLoanWithManyPairs_OR_ManyPools', async () => {
    const maxloan = await lender.maxFlashLoanWithManyPairs_OR_ManyPools(weth.address);
    const fee = await lender.flashFeeWithManyPairs_OR_ManyPools(weth.address, maxloan);
    await weth.connect(wethuser).transfer(borrower.address, fee);
    await borrower.connect(user).flashBorrowWithManyPairs_OR_ManyPools(lender.address, weth.address, maxloan, {gasLimit: 30000000});
    const totalFlashBalance = await borrower.totalFlashBalance();
    expect(totalFlashBalance).to.equal(maxloan.add(fee));
  });
});
