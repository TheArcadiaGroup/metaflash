const { expect } = require('chai');
const { ethers } = require('hardhat');
const { BigNumber } = require('ethers');

describe('FlashLoan', () => {
  let user;
  let weth, dai, aWeth, aDai, lendingPool;
  let borrower;
  const bal = BigNumber.from(100000);
  const aaveBal = bal.mul(2);
  const uniswapBal = bal.mul(3);

  beforeEach(async () => {
    [owner, user, feeTo] = await ethers.getSigners();

    // deploy token
    const FlashLoanERC20Mock = await ethers.getContractFactory('FlashLoanERC20Mock');
    weth = await FlashLoanERC20Mock.deploy('WETH', 'WETH');
    dai = await FlashLoanERC20Mock.deploy('DAI', 'DAI');
    usdc = await FlashLoanERC20Mock.deploy('USDC', 'USDC');

    // deploy aave2
    const AToken = await ethers.getContractFactory('ATokenMock');
    aWeth = await AToken.deploy(weth.address, 'AToken1', 'ATST1');
    aDai = await AToken.deploy(dai.address, 'Atoken2', 'ATST2');
    aUsdc = await AToken.deploy(usdc.address, 'Atoken3', 'ATST3');

    const LendingPool = await ethers.getContractFactory('LendingPoolMock');
    lendingPool = await LendingPool.deploy();
    await lendingPool.addReserve(aWeth.address);
    await lendingPool.addReserve(aDai.address);
    await lendingPool.addReserve(aUsdc.address);

    const LendingPoolAddressesProvider = await ethers.getContractFactory(
      'LendingPoolAddressesProviderMock'
    );
    lendingPoolAddressProvider = await LendingPoolAddressesProvider.deploy(lendingPool.address);

    const AaveV2FlashLender = await ethers.getContractFactory('AaveV2FlashLender');
    aave2Lender = await AaveV2FlashLender.deploy(lendingPoolAddressProvider.address);
    await weth.mint(aWeth.address, aaveBal);
    await dai.mint(aDai.address, aaveBal);
    await usdc.mint(aUsdc.address, aaveBal);

    // deploy uniswapv2
    const UniswapV2Factory = await ethers.getContractFactory('UniswapV2FactoryMock');
    uniswapFactory = await UniswapV2Factory.deploy();

    const UniswapV2Pair = await ethers.getContractFactory('UniswapV2PairMock');
    wethDaiPairAddress = await uniswapFactory.callStatic.createPair(weth.address, dai.address);
    await uniswapFactory.createPair(weth.address, dai.address);
    wethDaiPair = await UniswapV2Pair.attach(wethDaiPairAddress);

    wethUsdcPairAddress = await uniswapFactory.callStatic.createPair(weth.address, usdc.address);
    await uniswapFactory.createPair(weth.address, usdc.address);
    wethUsdcPair = await UniswapV2Pair.attach(wethUsdcPairAddress);

    const UniswapV2FlashLender = await ethers.getContractFactory('UniswapV2FlashLender');
    uniswapv2Lender = await UniswapV2FlashLender.deploy();

    await weth.mint(wethDaiPair.address, uniswapBal);
    await dai.mint(wethDaiPair.address, uniswapBal);
    await wethDaiPair.mint();

    await weth.mint(wethUsdcPair.address, uniswapBal.mul(2));
    await usdc.mint(wethUsdcPair.address, uniswapBal.mul(2));
    await wethUsdcPair.mint();

    await uniswapv2Lender.addPairs([weth.address], [dai.address], [wethDaiPairAddress]);
    await uniswapv2Lender.addPairs([weth.address], [usdc.address], [wethUsdcPairAddress]);

    // deploy FlashLoan
    const FlashLender = await ethers.getContractFactory('FlashLender');
    flashlender = await FlashLender.deploy(feeTo.address);

    await flashlender.addProviders([aave2Lender.address, uniswapv2Lender.address])

    // deploy Borrower
    const FlashBorrower = await ethers.getContractFactory('FlashBorrower');
    borrower = await FlashBorrower.deploy();

  });

  it("check factory", async function () {
    expect(await flashlender.factory()).to.equal(owner.address);
    await expect(flashlender.connect(user).setFactory(user.address)).to.revertedWith('FlashLender: Not factory');
    await flashlender.setFactory(user.address);
    expect(await flashlender.factory()).to.equal(user.address);
  });

  it("check feeTo", async function () {
    expect(await flashlender.FEETO()).to.equal(feeTo.address);
    await expect(flashlender.connect(user).setFeeTo(user.address)).to.revertedWith('FlashLender: Not factory');
    await flashlender.setFeeTo(user.address);
    expect(await flashlender.FEETO()).to.equal(user.address);
  });

  it('flash supply', async function () {
    expect(await flashlender.maxFlashLoanWithCheapestProvider(weth.address, aaveBal)).to.equal(aaveBal);
    expect(await flashlender.maxFlashLoanWithCheapestProvider(weth.address, aaveBal.add(1))).to.equal(uniswapBal.mul(2).sub(1));
    expect (await flashlender.maxFlashLoanWithCheapestProvider(weth.address, uniswapBal.mul(2).sub(1))).to.equal(uniswapBal.mul(2).sub(1));
    await expect(flashlender.maxFlashLoanWithCheapestProvider(weth.address, uniswapBal.mul(2))).to.revertedWith('FlashLender: Found no provider');
    // await expect(flashlender.maxFlashLoanWithCheapestProvider(flashlender.address, 1)).to.revertedWith('FlashLender: Found no provider');

    expect(await flashlender.maxFlashLoanWithManyProviders(weth.address)).to.equal((uniswapBal.mul(3).sub(2)).add(aaveBal));
    expect(await flashlender.maxFlashLoanWithManyProviders(dai.address)).to.equal((uniswapBal.sub(1)).add(aaveBal));
    expect(await flashlender.maxFlashLoanWithManyProviders(usdc.address)).to.equal((uniswapBal.mul(2).sub(1)).add(aaveBal));
    // await expect(flashlender.maxFlashLoanWithManyProviders(flashlender.address)).to.revertedWith('FlashLender: Found no provider');
  });

  it('flash fee', async function () {
    let premium = await lendingPool.FLASHLOAN_PREMIUM_TOTAL();

    expect(await flashlender.flashFeeWithCheapestProvider(weth.address, aaveBal)).to.equal((aaveBal.mul(premium).div(10000)).add(aaveBal.mul(5).div(1000)));
    expect(await flashlender.flashFeeWithCheapestProvider(weth.address, uniswapBal.sub(1))).to.equal(((uniswapBal.sub(1)).mul(3).div(997).add(1)).add((uniswapBal.sub(1)).mul(5).div(1000)));
    expect(await flashlender.flashFeeWithCheapestProvider(weth.address, uniswapBal.mul(2).sub(1))).to.equal(((uniswapBal.mul(2).sub(1)).mul(3).div(997).add(1)).add((uniswapBal.mul(2).sub(1)).mul(5).div(1000)));
    await expect(flashlender.flashFeeWithCheapestProvider(weth.address, uniswapBal.mul(2))).to.revertedWith('FlashLender: Found no provider');
    // await expect(flashlender.flashFeeWithCheapestProvider(flashlender.address, 1)).to.revertedWith('FlashLender: Found no provider');

    expect(await flashlender.flashFeeWithManyProviders(weth.address, aaveBal)).to.equal((aaveBal.mul(premium).div(10000)).add(aaveBal.mul(5).div(1000)));

    let aaveFee1 = aaveBal.mul(premium).div(10000)
    let uniswapFee1 = (uniswapBal.sub(aaveBal)).mul(3).div(997).add(1)
    let myFee1 = uniswapBal.mul(5).div(1000)
    let totalFee1 = aaveFee1.add(uniswapFee1).add(myFee1)
    expect(await flashlender.flashFeeWithManyProviders(weth.address, uniswapBal)).to.equal(totalFee1);

    let amount2 = (uniswapBal.mul(3).sub(2)).add(aaveBal)
    let aaveFee2 = aaveBal.mul(premium).div(10000)
    let uniswapFee2 = (uniswapBal.mul(3).sub(2)).mul(3).div(997).add(1)
    let myFee2 = amount2.mul(5).div(1000)
    let totalFee2 = aaveFee2.add(uniswapFee2).add(myFee2)
    expect(await flashlender.flashFeeWithManyProviders(weth.address, amount2)).to.equal(totalFee2);

    let amount3 = (uniswapBal.mul(3).sub(1)).add(aaveBal)
    await expect(flashlender.flashFeeWithManyProviders(weth.address, amount3)).to.revertedWith('FlashLender: Amount is more than maxFlashLoan');
    // await expect(flashlender.flashFeeWithManyProviders(flashlender.address, 1)).to.revertedWith('FlashLender: Found no provider');
  });

  it('flashLoanWithCheapestProvider', async () => {
    const maxloanWithCheapestProvider = await flashlender.maxFlashLoanWithCheapestProvider(weth.address, 1);
    const feeWithCheapestProvider = await flashlender.flashFeeWithCheapestProvider(weth.address, maxloanWithCheapestProvider);
    const balanceBeforeFeeToWithCheapestProvider = await weth.balanceOf(feeTo.address);
    await weth.connect(user).mint(borrower.address, feeWithCheapestProvider);
    await borrower.connect(user).flashBorrowWithCheapestProvider(flashlender.address, weth.address, maxloanWithCheapestProvider);
    const totalFlashBalanceWithCheapestProvider = await borrower.totalFlashBalance();
    expect(totalFlashBalanceWithCheapestProvider).to.equal(maxloanWithCheapestProvider.add(feeWithCheapestProvider));
    const balanceAfterFeeToWithCheapestProvider = await weth.balanceOf(feeTo.address);
    expect(balanceAfterFeeToWithCheapestProvider.sub(balanceBeforeFeeToWithCheapestProvider)).to.equal(maxloanWithCheapestProvider.mul(5).div(1000));
  });

  it('flashLoanWithManyProviders', async () => {
    const maxloanWithManyProviders = await flashlender.maxFlashLoanWithManyProviders(weth.address);
    const feeWithManyProviders = await flashlender.flashFeeWithManyProviders(weth.address, maxloanWithManyProviders);
    const balanceBeforeFeeToWithManyProviders = await weth.balanceOf(feeTo.address);
    await weth.connect(user).mint(borrower.address, feeWithManyProviders);
    await borrower.connect(user).flashBorrowWithManyProviders(flashlender.address, weth.address, maxloanWithManyProviders);
    const totalFlashBalanceWithManyProviders = await borrower.totalFlashBalance();
    expect(totalFlashBalanceWithManyProviders).to.equal(maxloanWithManyProviders.add(feeWithManyProviders).sub(1));
    const balanceAfterFeeToWithManyProviders = await weth.balanceOf(feeTo.address);
    expect(balanceAfterFeeToWithManyProviders.sub(balanceBeforeFeeToWithManyProviders)).to.equal(maxloanWithManyProviders.mul(5).div(1000).sub(1));
  });
});
