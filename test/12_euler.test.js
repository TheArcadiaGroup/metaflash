const { expect } = require('chai');
const { ethers } = require('hardhat');
const { BigNumber } = require('ethers');
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'

describe('Euler', () => {
  let user, lender, borrower, wethuser;
  let weth, wethAddress;
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

    eulerAddress = "0x27182842E098f60e3D576794A5bFFb0777E025d3";
    flashLoanAddress = "0x07df2ad9878F8797B4055230bbAE5C808b8259b3";

    lender = await EulerFlashLender.deploy(flashLoanAddress);
    borrower = await EulerFlashBorrower.deploy();
    await lender.setFlashLoaner(owner.address);
  });

  it("check operator", async function () {
    expect(await lender.operator()).to.equal(owner.address);
    await expect(lender.connect(user).setOperator(user.address)).to.revertedWith('EulerFlashLender: Not operator');
    await lender.setOperator(user.address);
    expect(await lender.operator()).to.equal(user.address);
  });

  it("check flashloaner", async function () {
    expect(await lender.flashloaner()).to.equal(owner.address);
    await expect(lender.connect(user).setFlashLoaner(user.address)).to.revertedWith('EulerFlashLender: Not operator');
    await lender.setFlashLoaner(user.address);
    expect(await lender.flashloaner()).to.equal(user.address);
  });

  it('getFlashLoanInfoListWithCheaperFeePriority', async function () {
    await expect(lender.connect(user).getFlashLoanInfoListWithCheaperFeePriority(wethAddress, 1)).to.revertedWith('EulerFlashLender: Not flashloaner');
    [pairs, maxloans, fees] = await lender.getFlashLoanInfoListWithCheaperFeePriority(wethAddress, 1);
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
    let wethBal = await weth.balanceOf(eulerAddress);
    await expect(lender.connect(user).flashFee(ZERO_ADDRESS, wethAddress, wethBal)).to.revertedWith('EulerFlashLender: Not flashloaner');
    expect(await lender.flashFee(ZERO_ADDRESS, wethAddress, wethBal)).to.equal(0);
  });

  it('flashLoan', async () => {
    await expect(lender.connect(user).flashLoan(ZERO_ADDRESS, borrower.address, wethAddress, "1000", "0x00000000000000000000000000000000000000000000000000000000000000")).to.revertedWith('EulerFlashLender: Not flashloaner');
    [pairs, maxloans, fees] = await lender.getFlashLoanInfoListWithCheaperFeePriority(wethAddress, 1);
    let count = 0;
    for (let i = 0; i < maxloans.length; i++) {
      tempBal = maxloans[i];
      await lender.setFlashLoaner(owner.address);
      tempFee = await lender.flashFee(pairs[i], wethAddress, tempBal);
      await lender.setFlashLoaner(borrower.address);
      await weth.connect(wethuser).transfer(borrower.address, tempFee, {gasLimit: 30000000});
      await borrower.connect(user).flashBorrow(pairs[i], lender.address, wethAddress, tempBal, { gasLimit: 30000000 });
      const flashSender = await borrower.flashSender();
      expect(flashSender.toLowerCase()).to.equal(borrower.address.toLowerCase());
      const flashToken = await borrower.flashToken();
      expect(flashToken.toLowerCase()).to.equal(wethAddress.toLowerCase());
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
    [pairs, maxloans, fees] = await lender.getFlashLoanInfoListWithCheaperFeePriority(wethAddress, 1);
    let count = 0;
    for (let i = 0; i < maxloans.length; i++) {
      tempBal = maxloans[i].add(1);
      await lender.setFlashLoaner(owner.address);
      tempFee = await lender.flashFee(pairs[i], wethAddress, tempBal);
      await lender.setFlashLoaner(borrower.address);
      await weth.connect(wethuser).transfer(borrower.address, tempFee, {gasLimit: 30000000});
      await expect(borrower.connect(user).flashBorrow(pairs[i], lender.address, wethAddress, tempBal, { gasLimit: 30000000 })).to.revertedWith('e/insufficient-tokens-available');
      count++;
      if (count == 2) {
        break;
      }
    }
  });
});
