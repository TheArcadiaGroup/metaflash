const { expect } = require('chai');
const { ethers } = require('hardhat');
const { BigNumber } = require('ethers');

describe('UniswapV2', () => {
  let owner, user;
  let weth, dai, usdc, wethDaiPair, wethUsdcPair, uniswapFactory, lender, daiUsdcPairAddress;
  let borrower;
  const reserves = BigNumber.from("1000000000000000000");
  const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'
  const ONE_ADDRESS = '0x1111111111111111111111111111111111111111'

  beforeEach(async () => {
    [owner, user] = await ethers.getSigners();

    const ERC20Currency = await ethers.getContractFactory('ERC20Mock');
    const UniswapV2Factory = await ethers.getContractFactory('UniswapV2FactoryMock');
    const UniswapV2Pair = await ethers.getContractFactory('UniswapV2PairMock');
    const UniswapERC3156 = await ethers.getContractFactory('UniswapV2FlashLender');
    const FlashBorrower = await ethers.getContractFactory('UniswapV2FlashBorrower');

    weth = await ERC20Currency.deploy('WETH', 'WETH');
    dai = await ERC20Currency.deploy('DAI', 'DAI');
    usdc = await ERC20Currency.deploy('USDC', 'USDC');

    uniswapFactory = await UniswapV2Factory.deploy();

    // First we do a .callStatic to retrieve the pair address, which is deterministic because of create2. Then we create the pair.
    wethDaiPairAddress = await uniswapFactory.callStatic.createPair(weth.address, dai.address);
    await uniswapFactory.createPair(weth.address, dai.address);
    wethDaiPair = await UniswapV2Pair.attach(wethDaiPairAddress);

    wethUsdcPairAddress = await uniswapFactory.callStatic.createPair(weth.address, usdc.address);
    await uniswapFactory.createPair(weth.address, usdc.address);
    wethUsdcPair = await UniswapV2Pair.attach(wethUsdcPairAddress);

    daiUsdcPairAddress = await uniswapFactory.callStatic.createPair(dai.address, usdc.address);
    await uniswapFactory.createPair(dai.address, usdc.address);
    daiUsdcPair = await UniswapV2Pair.attach(daiUsdcPairAddress);

    lender = await UniswapERC3156.deploy();

    borrower = await FlashBorrower.deploy();

    await weth.mint(wethDaiPair.address, reserves);
    await dai.mint(wethDaiPair.address, reserves);
    await wethDaiPair.mint();

    await weth.mint(wethUsdcPair.address, reserves.mul(2));
    await usdc.mint(wethUsdcPair.address, reserves.mul(2));
    await wethUsdcPair.mint();

    await dai.mint(daiUsdcPair.address, reserves.mul(3));
    await usdc.mint(daiUsdcPair.address, reserves.mul(3));
    await daiUsdcPair.mint();

    await lender.addPairs([weth.address], [dai.address], [wethDaiPairAddress]);
    await lender.addPairs([weth.address], [usdc.address], [wethUsdcPairAddress]);
    await lender.setFlashLoaner(owner.address);
  });

  it("check operator", async function () {
    expect(await lender.operator()).to.equal(owner.address);
    await expect(lender.connect(user).setOperator(user.address)).to.revertedWith('UniswapV2FlashLender: Not operator');
    await lender.setOperator(user.address);
    expect(await lender.operator()).to.equal(user.address);
  });

  it("check flashloaner", async function () {
    expect(await lender.flashloaner()).to.equal(owner.address);
    await expect(lender.connect(user).setFlashLoaner(user.address)).to.revertedWith('UniswapV2FlashLender: Not operator');
    await lender.setFlashLoaner(user.address);
    expect(await lender.flashloaner()).to.equal(user.address);
  });

  it('getFlashLoanInfoListWithCheaperFeePriority', async function () {
    await expect(lender.connect(user).getFlashLoanInfoListWithCheaperFeePriority(weth.address, 1)).to.revertedWith('UniswapV2FlashLender: Not flashloaner');
    [pairs, maxloans, fees] = await lender.getFlashLoanInfoListWithCheaperFeePriority(weth.address, 1);
    if(maxloans.length > 1){
      for (let i = 0; i < maxloans.length - 1 ; i++) {
        expect(fees[i]).to.lte(fees[i+1]);
        if(fees[i] == fees[i+1]){
          expect(maxloans[i]).to.gte(maxloans[i+1]);
        }
      }
    }
  });

  it("add/removePairs", async function () {
    //add
    await expect(lender.connect(user).addPairs([dai.address], [usdc.address], [daiUsdcPairAddress])).to.revertedWith('UniswapV2FlashLender: Not operator');
    await expect(lender.addPairs([dai.address], [usdc.address], [daiUsdcPairAddress, daiUsdcPairAddress])).to.revertedWith('UniswapV2FlashLender: mismatch length of token0, token1, pair');
    await expect(lender.addPairs([ZERO_ADDRESS], [usdc.address], [daiUsdcPairAddress])).to.revertedWith('UniswapV2FlashLender: _tokens0 is address(0)');
    await expect(lender.addPairs([dai.address], [ZERO_ADDRESS], [daiUsdcPairAddress])).to.revertedWith('UniswapV2FlashLender: _tokens1 is address(0)');
    await expect(lender.addPairs([dai.address], [usdc.address], [ZERO_ADDRESS])).to.revertedWith('UniswapV2FlashLender: _pairs is address(0)');

    beforeLength = await lender.getPairLength();
    await lender.addPairs([dai.address], [usdc.address], [daiUsdcPairAddress]);
    afterLength = await lender.getPairLength();
    await expect(beforeLength.add(1)).eq(afterLength);

    beforeLength = await lender.getPairLength();
    await lender.addPairs([dai.address], [usdc.address], [daiUsdcPairAddress]);
    afterLength = await lender.getPairLength();
    await expect(beforeLength).eq(afterLength);

    //remove
    await expect(lender.connect(user).removePairs([wethDaiPairAddress])).to.revertedWith('UniswapV2FlashLender: Not operator');

    beforeLength = await lender.getPairLength();
    await lender.removePairs([daiUsdcPairAddress]);
    afterLength = await lender.getPairLength();
    await expect(beforeLength.sub(1)).eq(afterLength);

    beforeLength = await lender.getPairLength();
    await lender.removePairs([daiUsdcPairAddress]);
    afterLength = await lender.getPairLength();
    await expect(beforeLength).eq(afterLength);

  });

  it('flash fee', async function () {
    await expect(lender.connect(user).flashFee(wethDaiPairAddress, weth.address,reserves)).to.revertedWith('UniswapV2FlashLender: Not flashloaner');
    expect(await lender.flashFee(wethDaiPairAddress, weth.address, reserves)).to.equal((reserves.mul(3).div(997).add(1)));
    expect(await lender.flashFee(wethUsdcPairAddress, usdc.address, reserves)).to.equal((reserves.mul(3).div(997).add(1)));
  });

  it('flashLoan', async () => {
    await expect(lender.connect(user).flashLoan(ZERO_ADDRESS, borrower.address, weth.address, "1000", "0x00000000000000000000000000000000000000000000000000000000000000")).to.revertedWith('UniswapV2FlashLender: Not flashloaner');
    [pairs, maxloans, fees] = await lender.getFlashLoanInfoListWithCheaperFeePriority(weth.address, 1);
    let count = 0;
    for (let i = 0; i < maxloans.length; i++) {
      tempBal = maxloans[i];
      await lender.setFlashLoaner(owner.address);
      tempFee = await lender.flashFee(pairs[i], weth.address, tempBal);
      await lender.setFlashLoaner(borrower.address);
      await weth.connect(user).mint(borrower.address, tempFee);
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
      await weth.connect(user).mint(borrower.address, tempFee);
      await expect(borrower.connect(user).flashBorrow(pairs[i], lender.address, weth.address, tempBal, { gasLimit: 30000000 })).to.revertedWith('UniswapV2: INSUFFICIENT_LIQUIDITY');
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
      await weth.connect(user).mint(borrower.address, tempFee.sub(1));
      await expect(borrower.connect(user).flashBorrow(pairs[i], lender.address, weth.address, tempBal, { gasLimit: 30000000 })).to.revertedWith('UniswapV2FlashLender: Transfer failed');
      count++;
      if (count == 2) {
        break;
      }
    }
  });
});
