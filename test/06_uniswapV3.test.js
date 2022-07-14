const { expect } = require('chai');
const { ethers } = require('hardhat');
const { BigNumber } = require('ethers');

describe('UniswapV3', () => {
  let user;
  let weth, dai, usdc, wethDaiPair, wethUsdcPair, uniswapFactory, lender;
  let borrower;
  const reserves = BigNumber.from(100000);

  beforeEach(async () => {
    [owner, user] = await ethers.getSigners();

    const ERC20Currency = await ethers.getContractFactory('ERC20MockV3');
    const UniswapV3Factory = await ethers.getContractFactory('UniswapV3Factory');
    const UniswapV3Pool = await ethers.getContractFactory('UniswapV3Pool');
    const UniswapV3ERC3156 = await ethers.getContractFactory('UniswapV3FlashLender');
    const FlashBorrower = await ethers.getContractFactory('UniswapV3FlashBorrower');

    weth = await ERC20Currency.deploy('WETH', 'WETH');
    dai = await ERC20Currency.deploy('DAI', 'DAI');
    usdc = await ERC20Currency.deploy('USDC', 'USDC');

    uniswapFactory = await UniswapV3Factory.deploy();

    // First we do a .callStatic to retrieve the pair address, which is deterministic because of create2. Then we create the pair.
    wethDaiPairAddress = await uniswapFactory.callStatic.createPool(weth.address, dai.address, 500);
    await uniswapFactory.createPool(weth.address, dai.address, 500);
    wethDaiPair = await UniswapV3Pool.attach(wethDaiPairAddress);
    await wethDaiPair.initialize("4295128739");

    wethUsdcPairAddress = await uniswapFactory.callStatic.createPool(weth.address, usdc.address, 500);
    await uniswapFactory.createPool(weth.address, usdc.address, 500);
    wethUsdcPair = await UniswapV3Pool.attach(wethUsdcPairAddress);
    await wethUsdcPair.initialize("4295128739");

    daiUsdcPairAddress = await uniswapFactory.callStatic.createPool(dai.address, usdc.address, 500);
    await uniswapFactory.createPool(dai.address, usdc.address, 500);
    daiUsdcPair = await UniswapV3Pool.attach(daiUsdcPairAddress);
    await daiUsdcPair.initialize("4295128739");

    lender = await UniswapV3ERC3156.deploy();

    borrower = await FlashBorrower.deploy();

    await weth.mint(wethDaiPair.address, reserves);
    await dai.mint(wethDaiPair.address, reserves);
    await wethDaiPair.mint(wethDaiPair.address, -1000, 1000, 3000000, []);

    await weth.mint(wethUsdcPair.address, reserves.mul(2));
    await usdc.mint(wethUsdcPair.address, reserves.mul(2));
    await wethUsdcPair.mint(wethUsdcPair.address, -1000, 1000, 3000000, []);

    await dai.mint(daiUsdcPair.address, reserves.mul(3));
    await usdc.mint(daiUsdcPair.address, reserves.mul(3));
    await daiUsdcPair.mint(daiUsdcPair.address, -1000, 1000, 3000000, []);

    await lender.addPairs([weth.address], [dai.address], [wethDaiPairAddress]);
    await lender.addPairs([weth.address], [usdc.address], [wethUsdcPairAddress]);
  });

  it('addPair: Revert if sender is not owner', async function () {
    await expect(lender.connect(user).addPairs([dai.address], [usdc.address], [daiUsdcPairAddress])).to.revertedWith('Ownable: caller is not the owner');
  });

  it("addPair: Should update", async function () {
    expect(await lender.maxFlashLoan(usdc.address, 1)).to.equal(reserves.mul(2).sub(1));
    expect(await lender.maxFlashLoanWithManyPairs_OR_ManyPools(usdc.address)).to.equal(reserves.mul(2).sub(1));
    await lender.addPairs([dai.address], [usdc.address], [daiUsdcPairAddress]);
    expect(await lender.maxFlashLoan(usdc.address, 1)).to.equal(reserves.mul(3).sub(1));
    expect(await lender.maxFlashLoanWithManyPairs_OR_ManyPools(usdc.address)).to.equal(reserves.mul(5).sub(2));
  });

  it('removePair: Revert if sender is not owner', async function () {
    await expect(lender.connect(user).removePairs([wethDaiPairAddress])).to.revertedWith('Ownable: caller is not the owner');
  });

  it("removePair: Should update", async function () {
    await lender.addPairs([dai.address], [usdc.address], [daiUsdcPairAddress]);
    expect(await lender.maxFlashLoan(usdc.address, 1)).to.equal(reserves.mul(3).sub(1));
    expect(await lender.maxFlashLoanWithManyPairs_OR_ManyPools(usdc.address)).to.equal(reserves.mul(5).sub(2));
    await lender.removePairs([daiUsdcPairAddress]);
    expect(await lender.maxFlashLoan(usdc.address, 1)).to.equal(reserves.mul(2).sub(1));
    expect(await lender.maxFlashLoanWithManyPairs_OR_ManyPools(usdc.address)).to.equal(reserves.mul(2).sub(1));
  });

  it('flash supply', async function () {
    expect(await lender.maxFlashLoan(weth.address, 1)).to.equal(reserves.mul(2).sub(1));
    expect(await lender.maxFlashLoan(dai.address, 1)).to.equal(reserves.sub(1));
    expect(await lender.maxFlashLoan(usdc.address, 1)).to.equal(reserves.mul(2).sub(1));
    expect(await lender.maxFlashLoan(lender.address, 1)).to.equal(0);

    expect(await lender.maxFlashLoanWithManyPairs_OR_ManyPools(weth.address)).to.equal(reserves.mul(3).sub(2));
    expect(await lender.maxFlashLoanWithManyPairs_OR_ManyPools(dai.address)).to.equal(reserves.sub(1));
    expect(await lender.maxFlashLoanWithManyPairs_OR_ManyPools(usdc.address)).to.equal(reserves.mul(2).sub(1));
    expect(await lender.maxFlashLoanWithManyPairs_OR_ManyPools(lender.address)).to.equal(0);
  });

  it('flash fee', async function () {
    expect(await lender.flashFee(weth.address, reserves)).to.equal((reserves.mul(3).div(997).add(1)));
    expect(await lender.flashFee(dai.address, reserves.sub(1))).to.equal((reserves.sub(1)).mul(3).div(997).add(1));
    expect(await lender.flashFee(usdc.address, reserves)).to.equal((reserves.mul(3).div(997).add(1)));
    expect(await lender.flashFee(lender.address, reserves)).to.equal(0);

    expect(await lender.flashFeeWithManyPairs_OR_ManyPools(weth.address, reserves)).to.equal((reserves.mul(3).div(997).add(1)));
    expect(await lender.flashFeeWithManyPairs_OR_ManyPools(dai.address, reserves)).to.equal((reserves.mul(3).div(997).add(1)));
    expect(await lender.flashFeeWithManyPairs_OR_ManyPools(usdc.address, reserves)).to.equal((reserves.mul(3).div(997).add(1)));
    expect(await lender.flashFeeWithManyPairs_OR_ManyPools(lender.address, reserves)).to.equal(0);
  });

  it('flashLoan', async () => {
    const maxloan = await lender.maxFlashLoan(weth.address, 1);
    expect(maxloan).to.equal(reserves.mul(2).sub(1));
    const fee = await lender.flashFee(weth.address, maxloan);
    expect(fee).to.equal(maxloan.mul(3).div(997).add(1));
    await weth.connect(user).mint(borrower.address, fee);
    await borrower.connect(user).flashBorrow(lender.address, weth.address, maxloan);
    const totalFlashBalance = await borrower.totalFlashBalance();
    expect(totalFlashBalance).to.equal(maxloan.add(fee));
  });

  it('flashLoanWithManyPairs_OR_ManyPools', async () => {
    const maxloan = await lender.maxFlashLoanWithManyPairs_OR_ManyPools(weth.address);
    const fee = await lender.flashFeeWithManyPairs_OR_ManyPools(weth.address, maxloan);
    await weth.connect(user).mint(borrower.address, fee);
    await borrower.connect(user).flashBorrowWithManyPairs_OR_ManyPools(lender.address, weth.address, maxloan);
    const totalFlashBalance = await borrower.totalFlashBalance();
    expect(totalFlashBalance).to.equal(maxloan.add(fee));
  });
});
