const { expect } = require('chai');
const { ethers } = require('hardhat');
const { BigNumber } = require('ethers');

describe('Multiplier', () => {
  let user, lender, borrower, usdc;
  const bal = BigNumber.from(100000);
  const ERC20_ABI = require('../abi/IERC20.json');
  const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'

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
    coreAddress = "0x913e21e190c59c00bb3153e76384e2949be8707c";
    
    busdMaxLoan = await busd.balanceOf(coreAddress);

    lender = await MultiplierFlashLender.deploy(lendingPoolAddress);
    borrower = await MultiplierFlashBorrower.deploy();

    await lender.setFlashLoaner(owner.address);
  });

  it("check operator", async function () {
    expect(await lender.operator()).to.equal(owner.address);
    await expect(lender.connect(user).setOperator(user.address)).to.revertedWith('MultiplierFlashLender: Not operator');
    await lender.setOperator(user.address);
    expect(await lender.operator()).to.equal(user.address);
  });

  it("check flashloaner", async function () {
    expect(await lender.flashloaner()).to.equal(owner.address);
    await expect(lender.connect(user).setFlashLoaner(user.address)).to.revertedWith('MultiplierFlashLender: Not operator');
    await lender.setFlashLoaner(user.address);
    expect(await lender.flashloaner()).to.equal(user.address);
  });

  it('getFlashLoanInfoListWithCheaperFeePriority', async function () {
    await expect(lender.connect(user).getFlashLoanInfoListWithCheaperFeePriority(busdAddress, 1)).to.revertedWith('MultiplierFlashLender: Not flashloaner');
    [pairs, maxloans, fees] = await lender.getFlashLoanInfoListWithCheaperFeePriority(busdAddress, 1);
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
    await expect(lender.connect(user).flashFee(ZERO_ADDRESS, busdAddress, "1000")).to.revertedWith('MultiplierFlashLender: Not flashloaner');

    expect(await lender.flashFee(ZERO_ADDRESS, busdAddress, bal)).to.equal(60);
  });

  it('flashLoan', async () => {
    await expect(lender.connect(user).flashLoan(ZERO_ADDRESS, borrower.address, busdAddress, "1000", "0x00000000000000000000000000000000000000000000000000000000000000")).to.revertedWith('MultiplierFlashLender: Not flashloaner');
    [pairs, maxloans, fees] = await lender.getFlashLoanInfoListWithCheaperFeePriority(busdAddress, 1);
    let count = 0;
    for (let i = 0; i < maxloans.length; i++) {
      tempBal = maxloans[i];
      await lender.setFlashLoaner(owner.address);
      tempFee = await lender.flashFee(pairs[i], busdAddress, tempBal);
      await lender.setFlashLoaner(borrower.address);
      await busd.connect(busduser).transfer(borrower.address, tempFee, {gasLimit: 30000000});
      await borrower.connect(user).flashBorrow(pairs[i], lender.address, busdAddress, tempBal, { gasLimit: 30000000 });
      const flashSender = await borrower.flashSender();
      expect(flashSender.toLowerCase()).to.equal(borrower.address.toLowerCase());
      const flashToken = await borrower.flashToken();
      expect(flashToken.toLowerCase()).to.equal(busdAddress.toLowerCase());
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
    [pairs, maxloans, fees] = await lender.getFlashLoanInfoListWithCheaperFeePriority(busdAddress, 1);
    let count = 0;
    for (let i = 0; i < maxloans.length; i++) {
      tempBal = maxloans[i].add(1);
      await lender.setFlashLoaner(owner.address);
      tempFee = await lender.flashFee(pairs[i], busdAddress, tempBal);
      await lender.setFlashLoaner(borrower.address);
      await busd.connect(busduser).transfer(borrower.address, tempFee, {gasLimit: 30000000});
      await expect(borrower.connect(user).flashBorrow(pairs[i], lender.address, busdAddress, tempBal, { gasLimit: 30000000 })).to.revertedWith('insufficient flashloan liquidity');
      count++;
      if (count == 2) {
        break;
      }
    }
  });

  it('invalid case - flashLoan', async () => {
    [pairs, maxloans, fees] = await lender.getFlashLoanInfoListWithCheaperFeePriority(busdAddress, 1);
    let count = 0;
    for (let i = 0; i < maxloans.length; i++) {
      tempBal = maxloans[i];
      await lender.setFlashLoaner(owner.address);
      tempFee = await lender.flashFee(pairs[i], busdAddress, tempBal);
      await lender.setFlashLoaner(borrower.address);
      await busd.connect(busduser).transfer(borrower.address, tempFee.sub(1), {gasLimit: 30000000});
      await expect(borrower.connect(user).flashBorrow(pairs[i], lender.address, busdAddress, tempBal, { gasLimit: 30000000 })).to.be.reverted;
      count++;
      if (count == 2) {
        break;
      }
    }
  });
});
