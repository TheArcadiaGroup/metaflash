const { expect } = require('chai');
const { ethers } = require('hardhat');
const { BigNumber } = require('ethers');

describe('DefiSwap', () => {
  let user;
  let weth, dai, usdc, wethDaiPair, wethUsdcPair, lender;
  let borrower;
  const reserves = BigNumber.from(100000);

  beforeEach(async () => {
    [_, user] = await ethers.getSigners();

    const ERC20Currency = await ethers.getContractFactory('ERC20Mock');
    const CroDefiSwapFactory = await ethers.getContractFactory('CroDefiSwapFactoryMock');
    const CroDefiSwapPair = await ethers.getContractFactory('CroDefiSwapPairMock');
    const DefiSwapERC3156 = await ethers.getContractFactory('CroDefiSwapFlashLender');
    const FlashBorrower = await ethers.getContractFactory('CroDefiSwapFlashBorrower');

    weth = await ERC20Currency.deploy('WETH', 'WETH');
    dai = await ERC20Currency.deploy('DAI', 'DAI');
    usdc = await ERC20Currency.deploy('USDC', 'USDC');

    crodefiswapFactory = await CroDefiSwapFactory.deploy(user.address, 100, 100);

    // First we do a .callStatic to retrieve the pair address, which is deterministic because of create2. Then we create the pair.
    wethDaiPairAddress = await crodefiswapFactory.callStatic.createPair(weth.address, dai.address);
    await crodefiswapFactory.createPair(weth.address, dai.address);
    wethDaiPair = await CroDefiSwapPair.attach(wethDaiPairAddress);

    wethUsdcPairAddress = await crodefiswapFactory.callStatic.createPair(weth.address, usdc.address);
    await crodefiswapFactory.createPair(weth.address, usdc.address);
    wethUsdcPair = await CroDefiSwapPair.attach(wethUsdcPairAddress);

    daiUsdcPairAddress = await crodefiswapFactory.callStatic.createPair(dai.address, usdc.address);
    await crodefiswapFactory.createPair(dai.address, usdc.address);
    daiUsdcPair = await CroDefiSwapPair.attach(daiUsdcPairAddress);

    lender = await DefiSwapERC3156.deploy(crodefiswapFactory.address);

    borrower = await FlashBorrower.deploy();

    await weth.mint(wethDaiPair.address, reserves);
    await dai.mint(wethDaiPair.address, reserves);
    await wethDaiPair.mint(wethDaiPair.address);

    await weth.mint(wethUsdcPair.address, reserves.mul(2));
    await usdc.mint(wethUsdcPair.address, reserves.mul(2));
    await wethUsdcPair.mint(wethUsdcPair.address);

    await dai.mint(daiUsdcPair.address, reserves.mul(3));
    await usdc.mint(daiUsdcPair.address, reserves.mul(3));
    await daiUsdcPair.mint(daiUsdcPair.address);

    await lender.addPairs([weth.address], [dai.address], [wethDaiPairAddress]);
    await lender.addPairs([weth.address], [usdc.address], [wethUsdcPairAddress]);
  });

  it('addPair: Revert if sender is not owner', async function () {
    await expect(lender.connect(user).addPairs([dai.address], [usdc.address], [wethUsdcPairAddress])).to.revertedWith('Ownable: caller is not the owner');
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
    let totalFeeBasisPoint = await crodefiswapFactory.totalFeeBasisPoint()
    // expect(await lender.flashFee(weth.address, reserves)).to.equal((reserves.mul(totalFeeBasisPoint).div(10000 - totalFeeBasisPoint).add(1)));
    // expect(await lender.flashFee(dai.address, reserves)).to.equal((reserves.mul(totalFeeBasisPoint).div(10000- totalFeeBasisPoint).add(1)));
    // return ((amount * totalFeeBasisPoint) / (magnifier - totalFeeBasisPoint) + 1);
    // await expect(lender.flashFee(lender.address, reserves)).to.revertedWith('Unsupported currency');
    expect(await lender.flashFee(weth.address, reserves)).to.equal(reserves.mul(totalFeeBasisPoint).div(10000 - totalFeeBasisPoint).add(1));
    expect(await lender.flashFee(dai.address, reserves.sub(1))).to.equal((reserves.sub(1)).mul(totalFeeBasisPoint).div(10000 - totalFeeBasisPoint).add(1));
    expect(await lender.flashFee(usdc.address, reserves)).to.equal((reserves.mul(totalFeeBasisPoint).div(10000 - totalFeeBasisPoint).add(1)));
    expect(await lender.flashFee(lender.address, reserves)).to.equal(0);

    expect(await lender.flashFeeWithManyPairs_OR_ManyPools(weth.address, reserves)).to.equal((reserves.mul(totalFeeBasisPoint).div(10000 - totalFeeBasisPoint).add(1)));
    expect(await lender.flashFeeWithManyPairs_OR_ManyPools(dai.address, reserves)).to.equal((reserves.mul(totalFeeBasisPoint).div(10000 - totalFeeBasisPoint).add(1)));
    expect(await lender.flashFeeWithManyPairs_OR_ManyPools(usdc.address, reserves)).to.equal((reserves.mul(totalFeeBasisPoint).div(10000 - totalFeeBasisPoint).add(1)));
    expect(await lender.flashFeeWithManyPairs_OR_ManyPools(lender.address, reserves)).to.equal(0);
  });

  it('flashLoan', async () => {
    const maxloan = await lender.maxFlashLoan(weth.address, 1);
    const fee = await lender.flashFee(weth.address, maxloan);
    await weth.connect(user).mint(borrower.address, fee);
    await borrower.connect(user).flashBorrow(lender.address, weth.address, maxloan);
    const totalFlashBalance = await borrower.totalFlashBalance();
    expect(totalFlashBalance).to.equal(maxloan.add(fee));
  });

  it('flashLoanWithManyPairs_OR_ManyPools', async () => {
    const maxloan = await lender.maxFlashLoanWithManyPairs_OR_ManyPools(weth.address);
    const fee = await lender.flashFeeWithManyPairs_OR_ManyPools(weth.address, maxloan);
    await weth.connect(user).mint(borrower.address, fee.add(1));
    await borrower.connect(user).flashBorrowWithManyPairs_OR_ManyPools(lender.address, weth.address, maxloan);
    const totalFlashBalance = await borrower.totalFlashBalance();
    expect(totalFlashBalance).to.equal(maxloan.add(fee.add(1)));
  });
});
