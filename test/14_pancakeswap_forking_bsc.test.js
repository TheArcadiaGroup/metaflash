const { expect } = require('chai');
const { ethers } = require('hardhat');
const { BigNumber } = require('ethers');
const fs = require('fs')
const rawPairsInfo = fs.readFileSync('./config/pancakeswappair.json');
const pairsInfo =  JSON.parse(rawPairsInfo);
const pairsInfoLength = Object.keys(pairsInfo).length;
const ERC20_ABI = require('../contracts/providers/uniswapV2/abi/IERC20.json');
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'
const ONE_ADDRESS = '0x1111111111111111111111111111111111111111'

describe('pancakeswap', () => {
  let owner, user;
  let weth, wethAddress;
  let borrower;

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

    wethHolderAddress = "0xf977814e90da44bfa03b6295a0616a897441acec";
    wethAddress = "0x2170ed0880ac9a755fd29b2688956bd959f933f8";
    weth = await ethers.getContractAt(ERC20_ABI, wethAddress);

    await hre.network.provider.request({
      method: 'hardhat_impersonateAccount',
      params: [wethHolderAddress]
    })

    wethuser = await hre.ethers.provider.getSigner(wethHolderAddress)

    const PancakeswapFlashLender = await ethers.getContractFactory('PancakeswapFlashLender');
    const PancakeswapFlashBorrower = await ethers.getContractFactory('PancakeswapFlashBorrower');

    lender = await PancakeswapFlashLender.deploy();
    borrower = await PancakeswapFlashBorrower.deploy();

    let tokens0 = []
    let tokens1 = []
    let pairs = []

    for (let i = 1; i <= pairsInfoLength; i++) {
      tokens0.push(pairsInfo[i].tokens0);
      tokens1.push(pairsInfo[i].tokens1);
      pairs.push(pairsInfo[i].pairs);
    }

    await lender.addPairs(tokens0, tokens1, pairs);
    await lender.setFlashLoaner(owner.address);
  });

  it("check operator", async function () {
    expect(await lender.operator()).to.equal(owner.address);
    await expect(lender.connect(user).setOperator(user.address)).to.revertedWith('PancakeswapFlashLender: Not operator');
    await lender.setOperator(user.address);
    expect(await lender.operator()).to.equal(user.address);
  });

  it("check flashloaner", async function () {
    expect(await lender.flashloaner()).to.equal(owner.address);
    await expect(lender.connect(user).setFlashLoaner(user.address)).to.revertedWith('PancakeswapFlashLender: Not operator');
    await lender.setFlashLoaner(user.address);
    expect(await lender.flashloaner()).to.equal(user.address);
  });

  it('getFlashLoanInfoListWithCheaperFeePriority', async function () {
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

  it("add/removePairs", async function () {
    //add
    await expect(lender.connect(user).addPairs([ONE_ADDRESS], [ONE_ADDRESS], [ONE_ADDRESS])).to.revertedWith('PancakeswapFlashLender: Not operator');
    await expect(lender.addPairs([ONE_ADDRESS], [ONE_ADDRESS], [ONE_ADDRESS, ONE_ADDRESS])).to.revertedWith('PancakeswapFlashLender: mismatch length of token0, token1, pair');
    await expect(lender.addPairs([ZERO_ADDRESS], [ONE_ADDRESS], [ONE_ADDRESS])).to.revertedWith('PancakeswapFlashLender: _tokens0 is address(0)');
    await expect(lender.addPairs([ONE_ADDRESS], [ZERO_ADDRESS], [ONE_ADDRESS])).to.revertedWith('PancakeswapFlashLender: _tokens1 is address(0)');
    await expect(lender.addPairs([ONE_ADDRESS], [ONE_ADDRESS], [ZERO_ADDRESS])).to.revertedWith('PancakeswapFlashLender: _pairs is address(0)');

    beforeLength = await lender.getPairLength();
    await lender.addPairs([ONE_ADDRESS], [ONE_ADDRESS], [ONE_ADDRESS]);
    afterLength = await lender.getPairLength();
    await expect(beforeLength.add(1)).eq(afterLength);

    beforeLength = await lender.getPairLength();
    await lender.addPairs([ONE_ADDRESS], [ONE_ADDRESS], [ONE_ADDRESS]);
    afterLength = await lender.getPairLength();
    await expect(beforeLength).eq(afterLength);

    //remove
    await expect(lender.connect(user).removePairs([ONE_ADDRESS])).to.revertedWith('PancakeswapFlashLender: Not operator');

    beforeLength = await lender.getPairLength();
    await lender.removePairs([ONE_ADDRESS]);
    afterLength = await lender.getPairLength();
    await expect(beforeLength.sub(1)).eq(afterLength);

    beforeLength = await lender.getPairLength();
    await lender.removePairs([ONE_ADDRESS]);
    afterLength = await lender.getPairLength();
    await expect(beforeLength).eq(afterLength);
  });

  it('flash fee', async function () {
    for (let i = 1; i <= pairsInfoLength; i++) {
      if (wethAddress == pairsInfo[i].tokens0 || wethAddress == pairsInfo[i].tokens1) {
        let tempBal = await weth.balanceOf(pairsInfo[i].pairs)
        tempBal = tempBal.sub(1);
        let tempFee = tempBal.mul(25).div(9975).add(1);
        expect(await lender.flashFee(pairsInfo[i].pairs, weth.address, tempBal)).to.equal(tempFee);
      }
    }
  });

  it('flashLoan', async () => {
    [pairs, maxloans, fees] = await lender.getFlashLoanInfoListWithCheaperFeePriority(weth.address, 1);
    console.log("maxloans.length", maxloans.length);
    let count = 0;
    for (let i = 0; i < maxloans.length; i++) {
      tempBal = maxloans[i];
      await lender.setFlashLoaner(owner.address);
      tempFee = await lender.flashFee(pairs[i], weth.address, tempBal);
      await lender.setFlashLoaner(borrower.address);
      await weth.connect(wethuser).transfer(borrower.address, tempFee);
      await borrower.connect(user).flashBorrow(pairs[i], lender.address, weth.address, tempBal, { gasLimit: 30000000 });
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
    [pairs, maxloans, fees] = await lender.getFlashLoanInfoListWithCheaperFeePriority(weth.address, 1);
    let count = 0;
    for (let i = 0; i < maxloans.length; i++) {
      tempBal = maxloans[i].add(1);
      await lender.setFlashLoaner(owner.address);
      tempFee = await lender.flashFee(pairs[i], weth.address, tempBal);
      await lender.setFlashLoaner(borrower.address);
      await weth.connect(wethuser).transfer(borrower.address, tempFee);
      await expect(borrower.connect(user).flashBorrow(pairs[i], lender.address, weth.address, tempBal, { gasLimit: 30000000 })).to.reverted;
      count++;
      if (count == 2) {
        break;
      }
    }
  });

  it('invalid case - flashLoan', async () => {
    [pairs, maxloans, fees] = await lender.getFlashLoanInfoListWithCheaperFeePriority(weth.address, 1);
    let count = 0;
    for (let i = 0; i < maxloans.length; i++) {
      tempBal = maxloans[i];
      await lender.setFlashLoaner(owner.address);
      tempFee = await lender.flashFee(pairs[i], weth.address, tempBal);
      await lender.setFlashLoaner(borrower.address);
      await weth.connect(wethuser).transfer(borrower.address, tempFee.sub(1));
      await expect(borrower.connect(user).flashBorrow(pairs[i], lender.address, weth.address, tempBal, { gasLimit: 30000000 })).to.reverted;
      count++;
      if (count == 2) {
        break;
      }
    }
  });
});
