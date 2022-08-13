const { expect } = require('chai');
const { ethers } = require('hardhat');
const { BigNumber } = require('ethers');
const fs = require('fs')
const rawPairsInfo = fs.readFileSync('./config/defiswappair.json');
const pairsInfo =  JSON.parse(rawPairsInfo);
const pairsInfoLength = Object.keys(pairsInfo).length;
const ERC20_ABI = require('../contracts/providers/defiswap/abi/IERC20.json');
const FACTORY_ABI = require('../contracts/providers/defiswap/abi/Factory.json');
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'
const ONE_ADDRESS = '0x1111111111111111111111111111111111111111'

describe('defiswap', () => {
  let owner, user;
  let weth, wethAddress, totalFeeBasisPoint;
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

    wethHolderAddress = "0x06920C9fC643De77B99cB7670A944AD31eaAA260";
    wethAddress = "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2";
    factoryAddress = "0x9deb29c9a4c7a88a3c0257393b7f3335338d9a9d";
    weth = await ethers.getContractAt(ERC20_ABI, wethAddress);
    factory = await ethers.getContractAt(FACTORY_ABI, factoryAddress);

    await hre.network.provider.request({
      method: 'hardhat_impersonateAccount',
      params: [wethHolderAddress]
    })

    wethuser = await hre.ethers.provider.getSigner(wethHolderAddress)

    const CroDefiSwapFlashLender = await ethers.getContractFactory('CroDefiSwapFlashLender');
    const CroDefiSwapFlashBorrower = await ethers.getContractFactory('CroDefiSwapFlashBorrower');

    lender = await CroDefiSwapFlashLender.deploy(factoryAddress);
    borrower = await CroDefiSwapFlashBorrower.deploy();

    let tokens0 = []
    let tokens1 = []
    let pairs = []

    for (let i = 1; i <= pairsInfoLength; i++) {
      tokens0.push(pairsInfo[i].tokens0);
      tokens1.push(pairsInfo[i].tokens1);
      pairs.push(pairsInfo[i].pairs);
    }

    await lender.addPairs(tokens0, tokens1, pairs);
    totalFeeBasisPoint = await factory.totalFeeBasisPoint()
    await lender.setFlashLoaner(owner.address);
  });

  it("check operator", async function () {
    expect(await lender.operator()).to.equal(owner.address);
    await expect(lender.connect(user).setOperator(user.address)).to.revertedWith('CroDefiSwapFlashLender: Not operator');
    await lender.setOperator(user.address);
    expect(await lender.operator()).to.equal(user.address);
  });

  it("check flashloaner", async function () {
    expect(await lender.flashloaner()).to.equal(owner.address);
    await expect(lender.connect(user).setFlashLoaner(user.address)).to.revertedWith('CroDefiSwapFlashLender: Not operator');
    await lender.setFlashLoaner(user.address);
    expect(await lender.flashloaner()).to.equal(user.address);
  });

  it('getFlashLoanInfoListWithCheaperFeePriority', async function () {
    await expect(lender.connect(user).getFlashLoanInfoListWithCheaperFeePriority(weth.address, 1)).to.revertedWith('CroDefiSwapFlashLender: Not flashloaner');

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
    await expect(lender.connect(user).addPairs([ONE_ADDRESS], [ONE_ADDRESS], [ONE_ADDRESS])).to.revertedWith('CroDefiSwapFlashLender: Not operator');
    await expect(lender.addPairs([ONE_ADDRESS], [ONE_ADDRESS], [ONE_ADDRESS, ONE_ADDRESS])).to.revertedWith('CroDefiSwapFlashLender: mismatch length of token0, token1, pair');
    await expect(lender.addPairs([ZERO_ADDRESS], [ONE_ADDRESS], [ONE_ADDRESS])).to.revertedWith('CroDefiSwapFlashLender: _tokens0 is address(0)');
    await expect(lender.addPairs([ONE_ADDRESS], [ZERO_ADDRESS], [ONE_ADDRESS])).to.revertedWith('CroDefiSwapFlashLender: _tokens1 is address(0)');
    await expect(lender.addPairs([ONE_ADDRESS], [ONE_ADDRESS], [ZERO_ADDRESS])).to.revertedWith('CroDefiSwapFlashLender: _pairs is address(0)');

    beforeLength = await lender.getPairLength();
    await lender.addPairs([ONE_ADDRESS], [ONE_ADDRESS], [ONE_ADDRESS]);
    afterLength = await lender.getPairLength();
    await expect(beforeLength.add(1)).eq(afterLength);

    beforeLength = await lender.getPairLength();
    await lender.addPairs([ONE_ADDRESS], [ONE_ADDRESS], [ONE_ADDRESS]);
    afterLength = await lender.getPairLength();
    await expect(beforeLength).eq(afterLength);

    //remove
    await expect(lender.connect(user).removePairs([ONE_ADDRESS])).to.revertedWith('CroDefiSwapFlashLender: Not operator');

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
    await expect(lender.connect(user).flashFee(ZERO_ADDRESS, wethAddress, "1000")).to.revertedWith('CroDefiSwapFlashLender: Not flashloaner');
    for (let i = 1; i <= pairsInfoLength; i++) {
      if (wethAddress == pairsInfo[i].tokens0 || wethAddress == pairsInfo[i].tokens1) {
        let tempBal = await weth.balanceOf(pairsInfo[i].pairs)
        tempBal = tempBal.sub(1);
        let tempFee = tempBal.mul(totalFeeBasisPoint).div(BigNumber.from(10000).sub(totalFeeBasisPoint)).add(1);
        expect(await lender.flashFee(pairsInfo[i].pairs, weth.address, tempBal)).to.equal(tempFee);
      }
    }
  });

  it('flashLoan', async () => {
    await expect(lender.connect(user).flashLoan(ZERO_ADDRESS, borrower.address, wethAddress, "1000", "0x00000000000000000000000000000000000000000000000000000000000000")).to.revertedWith('CroDefiSwapFlashLender: Not flashloaner');
    [pairs, maxloans, fees] = await lender.getFlashLoanInfoListWithCheaperFeePriority(weth.address, 1);
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
      await expect(borrower.connect(user).flashBorrow(pairs[i], lender.address, weth.address, tempBal, { gasLimit: 30000000 })).to.revertedWith('CroDefiSwap: INSUFFICIENT_LIQUIDITY');
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
      await expect(borrower.connect(user).flashBorrow(pairs[i], lender.address, weth.address, tempBal, { gasLimit: 30000000 })).to.revertedWith('CroDefiSwapFlashLender: Transfer failed');
      count++;
      if (count == 2) {
        break;
      }
    }
  });
});
