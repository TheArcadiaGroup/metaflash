const { expect } = require('chai');
const { ethers } = require('hardhat');
const { BigNumber } = require('ethers');
const fs = require('fs')
const rawPoolsInfo = fs.readFileSync('./config/saddlefinancepool.json');
const poolsInfo = JSON.parse(rawPoolsInfo);
const poolsInfoLength = Object.keys(poolsInfo).length;
const ERC20_ABI = require('../contracts/providers/saddlefinance/abi/IERC20.json');
const POOL_ABI = require('../contracts/providers/saddlefinance/abi/Pool.json');

describe('SaddleFinance', () => {
  let owner, user;
  let weth, wethAddress;
  let borrower;
  const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'
  const ONE_ADDRESS = '0x1111111111111111111111111111111111111111'

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

    wethHolderAddress = "0x06920C9fC643De77B99cB7670A944AD31eaAA260";
    wethAddress = "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2";
    weth = await ethers.getContractAt(ERC20_ABI, wethAddress);

    await hre.network.provider.request({
      method: 'hardhat_impersonateAccount',
      params: [wethHolderAddress]
    })

    wethuser = await hre.ethers.provider.getSigner(wethHolderAddress)

    const SaddleFinanceFlashLender = await ethers.getContractFactory('SaddleFinanceFlashLender');
    const SaddleFinanceFlashBorrower = await ethers.getContractFactory('SaddleFinanceFlashBorrower');

    lender = await SaddleFinanceFlashLender.deploy();
    borrower = await SaddleFinanceFlashBorrower.deploy();

    let pools = []
    for (let i = 1; i <= poolsInfoLength; i++) {
      pools.push(poolsInfo[i].pools);
    }

    await lender.addPools(pools);
    await lender.setFlashLoaner(owner.address);
  });

  it("check operator", async function () {
    expect(await lender.operator()).to.equal(owner.address);
    await expect(lender.connect(user).setOperator(user.address)).to.revertedWith('SaddleFinanceFlashLender: Not operator');
    await lender.setOperator(user.address);
    expect(await lender.operator()).to.equal(user.address);
  });

  it("check flashloaner", async function () {
    expect(await lender.flashloaner()).to.equal(owner.address);
    await expect(lender.connect(user).setFlashLoaner(user.address)).to.revertedWith('SaddleFinanceFlashLender: Not operator');
    await lender.setFlashLoaner(user.address);
    expect(await lender.flashloaner()).to.equal(user.address);
  });

  it('getFlashLoanInfoListWithCheaperFeePriority', async function () {
    await expect(lender.connect(user).getFlashLoanInfoListWithCheaperFeePriority(weth.address, 1)).to.revertedWith('SaddleFinanceFlashLender: Not flashloaner');
    [pairs, maxloans, fees] = await lender.getFlashLoanInfoListWithCheaperFeePriority(weth.address, 1);
    console.log("maxloans.length", maxloans.length);
    if (maxloans.length > 1) {
      for (let i = 0; i < maxloans.length - 1; i++) {
        expect(fees[i]).to.lte(fees[i + 1]);
        if (fees[i] == fees[i + 1]) {
          expect(maxloans[i]).to.gte(maxloans[i + 1]);
        }
      }
    }
  });

  it("add/removePools", async function () {
    //add
    await expect(lender.connect(user).addPools([ONE_ADDRESS])).to.revertedWith('SaddleFinanceFlashLender: Not operator');
    await expect(lender.addPools([ZERO_ADDRESS])).to.revertedWith('SaddleFinanceFlashLender: _pool address is zero address!');

    beforeLength = await lender.getPoolLength();
    await lender.addPools([ONE_ADDRESS]);
    afterLength = await lender.getPoolLength();
    await expect(beforeLength.add(1)).eq(afterLength);

    beforeLength = await lender.getPoolLength();
    await lender.addPools([ONE_ADDRESS]);
    afterLength = await lender.getPoolLength();
    await expect(beforeLength).eq(afterLength);

    //remove
    await expect(lender.connect(user).removePools([ONE_ADDRESS])).to.revertedWith('SaddleFinanceFlashLender: Not operator');

    beforeLength = await lender.getPoolLength();
    await lender.removePools([ONE_ADDRESS]);
    afterLength = await lender.getPoolLength();
    await expect(beforeLength.sub(1)).eq(afterLength);

    beforeLength = await lender.getPoolLength();
    await lender.removePools([ONE_ADDRESS]);
    afterLength = await lender.getPoolLength();
    await expect(beforeLength).eq(afterLength);

  });

  it('flash fee', async function () {
    await expect(lender.connect(user).flashFee(ZERO_ADDRESS, weth.address, "1000")).to.revertedWith('SaddleFinanceFlashLender: Not flashloaner');
    for (let i = 1; i <= poolsInfoLength; i++) {
        let pool = await ethers.getContractAt(POOL_ABI, poolsInfo[i].pools);
        let fee = await pool.flashLoanFeeBPS();
        let tempBal = await weth.balanceOf(poolsInfo[i].pools)
        let tempFee = tempBal.mul(fee).div(10000);
        expect(await lender.flashFee(poolsInfo[i].pools, weth.address, tempBal)).to.equal(tempFee);
    }
  });

  it('flashLoan', async () => {
    await expect(lender.connect(user).flashLoan(ZERO_ADDRESS, borrower.address, weth.address, "1000", "0x00000000000000000000000000000000000000000000000000000000000000")).to.revertedWith('SaddleFinanceFlashLender: Not flashloaner');
    [pools, maxloans, fees] = await lender.getFlashLoanInfoListWithCheaperFeePriority(weth.address, 1);
    let count = 0;
    for (let i = 0; i < maxloans.length; i++) {
      tempBal = maxloans[i];
      await lender.setFlashLoaner(owner.address);
      tempFee = await lender.flashFee(pools[i], weth.address, tempBal);
      await lender.setFlashLoaner(borrower.address);
      await weth.connect(wethuser).transfer(borrower.address, tempFee);
      await borrower.connect(user).flashBorrow(pools[i], lender.address, weth.address, tempBal, { gasLimit: 30000000 });
      const flashSender = await borrower.flashSender();
      expect(flashSender.toLowerCase()).to.equal(borrower.address.toLowerCase());
      const flashToken = await borrower.flashToken();
      expect(flashToken.toLowerCase()).to.equal(weth.address.toLowerCase());
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
    [pools, maxloans, fees] = await lender.getFlashLoanInfoListWithCheaperFeePriority(weth.address, 1);
    let count = 0;
    for (let i = 0; i < maxloans.length; i++) {
      tempBal = maxloans[i].add(1);
      await lender.setFlashLoaner(owner.address);
      tempFee = await lender.flashFee(pools[i], weth.address, tempBal);
      await lender.setFlashLoaner(borrower.address);
      await weth.connect(wethuser).transfer(borrower.address, tempFee);
      await expect(borrower.connect(user).flashBorrow(pools[i], lender.address, weth.address, tempBal, { gasLimit: 30000000 })).to.revertedWith('invalid amount');
      count++;
      if (count == 2) {
        break;
      }
    }
  });

  it('invalid case - flashLoan', async () => {
    [pools, maxloans, fees] = await lender.getFlashLoanInfoListWithCheaperFeePriority(weth.address, 1);
    let count = 0;
    for (let i = 0; i < maxloans.length; i++) {
      tempBal = maxloans[i];
      await lender.setFlashLoaner(owner.address);
      tempFee = await lender.flashFee(pools[i], weth.address, tempBal);
      await lender.setFlashLoaner(borrower.address);
      await weth.connect(wethuser).transfer(borrower.address, tempFee.sub(1));
      await expect(borrower.connect(user).flashBorrow(pools[i], lender.address, weth.address, tempBal, { gasLimit: 30000000 })).to.revertedWith('SaddleFinanceFlashLender: Transfer failed');
      count++;
      if (count == 2) {
        break;
      }
    }
  });
});
