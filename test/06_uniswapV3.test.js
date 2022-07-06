const { expect } = require('chai');
const { ethers } = require('hardhat');
const { BigNumber } = require('ethers');

describe('UniswapV3ERC3156', () => {
  let user, feeTo;
  let weth, dai, usdc, wethDaiPair, wethUsdcPair, uniswapFactory, lender;
  let borrower;
  const reserves = BigNumber.from(100000);

  beforeEach(async () => {
    [owner, feeTo, user] = await ethers.getSigners();

    const ERC20Currency = await ethers.getContractFactory('ERC20MockV3');
    const UniswapV3Factory = await ethers.getContractFactory('UniswapV3Factory');
    const UniswapV3Pool = await ethers.getContractFactory('UniswapV3Pool');
    const UniswapV3ERC3156 = await ethers.getContractFactory('UniswapV3ERC3156');
    const FlashBorrower = await ethers.getContractFactory('FlashBorrower');

    weth = await ERC20Currency.deploy('WETH', 'WETH');
    dai = await ERC20Currency.deploy('DAI', 'DAI');
    usdc = await ERC20Currency.deploy('USDC', 'USDC');

    uniswapFactory = await UniswapV3Factory.deploy();

    // First we do a .callStatic to retrieve the pair address, which is deterministic because of create2. Then we create the pair.
    wethDaiPairAddress = await uniswapFactory.callStatic.createPool(weth.address, dai.address, 500);
    await uniswapFactory.createPool(weth.address, dai.address, 500);
    wethDaiPair = await UniswapV3Pool.attach(wethDaiPairAddress);
    await wethDaiPair.initialize(4295128739);

    wethUsdcPairAddress = await uniswapFactory.callStatic.createPool(weth.address, usdc.address, 500);
    await uniswapFactory.createPool(weth.address, usdc.address, 500);
    wethUsdcPair = await UniswapV3Pool.attach(wethUsdcPairAddress);
    await wethUsdcPair.initialize("4295128739");

    lender = await UniswapV3ERC3156.deploy(feeTo.address);

    borrower = await FlashBorrower.deploy();

    await weth.mint(wethDaiPair.address, reserves);
    await dai.mint(wethDaiPair.address, reserves);
    await wethDaiPair.mint(wethDaiPair.address, -1000, 1000, 3000000, []);

    await weth.mint(wethUsdcPair.address, reserves);
    await usdc.mint(wethUsdcPair.address, reserves);
    await wethUsdcPair.mint(wethUsdcPair.address, -1000, 1000, 3000000, []);

    await lender.addPair([weth.address], [dai.address], [wethDaiPairAddress]);
  });

  it("feeTo: Revert if sender is not owner", async function () {
    await expect(lender.connect(user).setFeeTo(user.address)).to.revertedWith('Ownable: caller is not the owner');
  });

  it("feeTo: Should update", async function () {
    await lender.setFeeTo(user.address);
    expect(await lender.FEETO()).to.equal(user.address);
  });

  it('addPair: Revert if sender is not owner', async function () {
    await expect(lender.connect(user).addPair([weth.address], [usdc.address], [wethUsdcPairAddress])).to.revertedWith('Ownable: caller is not the owner');
  });

  it("addPair: Should update", async function () {
    await expect(lender.maxFlashLoan(usdc.address)).to.revertedWith('Unsupported currency');
    await lender.addPair([weth.address], [usdc.address], [wethUsdcPairAddress]);
    expect(await lender.maxFlashLoan(usdc.address)).to.equal(reserves.sub(1));
  });

  it('removePair: Revert if sender is not owner', async function () {
    await expect(lender.connect(user).removePair([wethDaiPairAddress])).to.revertedWith('Ownable: caller is not the owner');
  });

  it("removePair: Should update", async function () {
    await lender.addPair([weth.address], [usdc.address], [wethUsdcPairAddress]);
    expect(await lender.maxFlashLoan(usdc.address)).to.equal(reserves.sub(1));
    await lender.removePair([wethUsdcPairAddress]);
    await expect(lender.maxFlashLoan(usdc.address)).to.revertedWith('Unsupported currency');
  });

  it('flash supply', async function () {
    expect(await lender.maxFlashLoan(weth.address)).to.equal(reserves.sub(1));
    expect(await lender.maxFlashLoan(dai.address)).to.equal(reserves.sub(1));
    await expect(lender.maxFlashLoan(lender.address)).to.revertedWith('Unsupported currency');
  });

  it('flash fee', async function () {
    expect(await lender.flashFee(weth.address, reserves)).to.equal((reserves.mul(3).div(997).add(1)).add(reserves.mul(5).div(1000)));
    expect(await lender.flashFee(dai.address, reserves)).to.equal((reserves.mul(3).div(997).add(1)).add(reserves.mul(5).div(1000)));
    await expect(lender.flashFee(lender.address, reserves)).to.revertedWith('Unsupported currency');
  });

  it('weth flash loan', async () => {
    const loan = await lender.maxFlashLoan(weth.address);
    const fee = await lender.flashFee(weth.address, loan);

    const balanceBeforeFeeTo = await weth.balanceOf(feeTo.address);

    await weth.connect(user).mint(borrower.address, fee);
    await borrower.connect(user).flashBorrow(lender.address, weth.address, loan);

    const balanceAfter = await weth.balanceOf(await user.getAddress());
    expect(balanceAfter).to.equal(BigNumber.from('0'));
    const flashBalance = await borrower.flashBalance();
    expect(flashBalance).to.equal(loan.add(fee));
    const flashAmount = await borrower.flashAmount();
    expect(flashAmount).to.equal(loan);
    const flashFee = await borrower.flashFee();
    expect(flashFee).to.equal(fee);
    const flashSender = await borrower.flashSender();
    expect(flashSender).to.equal(borrower.address);

    const balanceAfterFeeTo = await weth.balanceOf(feeTo.address);
    expect(balanceAfterFeeTo.sub(balanceBeforeFeeTo)).to.equal(loan.mul(5).div(1000));
  });

  it('dai flash loan', async () => {
    const loan = await lender.maxFlashLoan(dai.address);
    const fee = await lender.flashFee(dai.address, loan);

    const balanceBeforeFeeTo = await dai.balanceOf(feeTo.address);

    await dai.connect(user).mint(borrower.address, fee);
    await borrower.connect(user).flashBorrow(lender.address, dai.address, loan);

    const balanceAfter = await dai.balanceOf(await user.getAddress());
    expect(balanceAfter).to.equal(BigNumber.from('0'));
    const flashBalance = await borrower.flashBalance();
    expect(flashBalance).to.equal(loan.add(fee));
    const flashAmount = await borrower.flashAmount();
    expect(flashAmount).to.equal(loan);
    const flashFee = await borrower.flashFee();
    expect(flashFee).to.equal(fee);
    const flashSender = await borrower.flashSender();
    expect(flashSender).to.equal(borrower.address);

    const balanceAfterFeeTo = await dai.balanceOf(feeTo.address);
    expect(balanceAfterFeeTo.sub(balanceBeforeFeeTo)).to.equal(loan.mul(5).div(1000));
  });
});
