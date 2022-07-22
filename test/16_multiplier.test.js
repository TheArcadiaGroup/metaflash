const { expect } = require('chai');
const { ethers } = require('hardhat');
const { BigNumber } = require('ethers');

describe('Multiplier', () => {
  let user, lender, borrower, usdc;
  const bal = BigNumber.from(100000);
  const ERC20_ABI = require('../contracts/providers/euler/abi/IERC20.json');

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

    busdAddress = "0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56";
    usdcAddress = "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d";

    await hre.network.provider.request({
      method: 'hardhat_impersonateAccount',
      params: ["0x8894E0a0c962CB723c1976a4421c95949bE2D4E3"]
    })

    busduser = await hre.ethers.provider.getSigner("0x8894E0a0c962CB723c1976a4421c95949bE2D4E3")

    const MultiplierFlashLender = await ethers.getContractFactory('MultiplierFlashLender');
    const MultiplierFlashBorrower = await ethers.getContractFactory('MultiplierFlashBorrower');

    busd = await ethers.getContractAt(ERC20_ABI, busdAddress);
    usdc = await ethers.getContractAt(ERC20_ABI, usdcAddress);

    lendingPoolCoreAddress = "0x913e21e190c59C00bB3153E76384e2949BE8707C";
    lendingPoolAddress = "0xBEc588F8A4859065b45fcFcB1c8805F5584A2219";
    

    lender = await MultiplierFlashLender.deploy(lendingPoolAddress);
    borrower = await MultiplierFlashBorrower.deploy();

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
    let busdBal = await busd.balanceOf(lendingPoolCoreAddress);
    let usdcBal = await usdc.balanceOf(lendingPoolCoreAddress);
    expect(await lender.maxFlashLoan(busdAddress, 1)).to.equal(busdBal);
    expect(await lender.maxFlashLoan(usdcAddress, 1)).to.equal(usdcBal);
    expect(await lender.maxFlashLoanWithManyPairs_OR_ManyPools(busdAddress)).to.equal(busdBal);
    expect(await lender.maxFlashLoanWithManyPairs_OR_ManyPools(usdcAddress)).to.equal(usdcBal);
  });

  it('flash fee', async function () {
    expect(await lender.flashFee(busdAddress, bal)).to.equal(60);//flashloanFeeRate = 0.0006 * 1e18;
    expect(await lender.flashFee(usdcAddress, bal)).to.equal(60);
    expect(await lender.flashFeeWithManyPairs_OR_ManyPools(busdAddress, bal)).to.equal(60);
    expect(await lender.flashFeeWithManyPairs_OR_ManyPools(usdcAddress, bal)).to.equal(60);
  });

  it('flashLoan', async () => {
    const maxloan = await lender.maxFlashLoan(busdAddress, 1);
    const fee = await lender.flashFee(busdAddress, maxloan);
    await busd.connect(busduser).transfer(borrower.address, fee.add(1));
    await borrower.connect(user).flashBorrow(lender.address, busdAddress, maxloan, { gasLimit: 30000000 });
    const totalFlashBalance = await borrower.totalFlashBalance();
    expect(totalFlashBalance).to.equal(maxloan.add(fee).add(1));
  });

  it('flashLoanWithManyPairs_OR_ManyPools', async () => {
    const maxloan = await lender.maxFlashLoanWithManyPairs_OR_ManyPools(busdAddress);
    const fee = await lender.flashFeeWithManyPairs_OR_ManyPools(busdAddress, maxloan);
    await busd.connect(busduser).transfer(borrower.address, fee.add(1));
    await borrower.connect(user).flashBorrowWithManyPairs_OR_ManyPools(lender.address, busdAddress, maxloan, { gasLimit: 30000000 });
    const totalFlashBalance = await borrower.totalFlashBalance();
    expect(totalFlashBalance).to.equal(maxloan.add(fee).add(1));
  });
});
