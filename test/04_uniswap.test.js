const { expect } = require('chai');
const { ethers } = require('hardhat');
const { BigNumber } = require('ethers');

describe('UniswapERC3156', () => {
  let user, feeTo;
  let weth, dai, usdc, wethDaiPair, wethUsdcPair, uniswapFactory, lender;
  let borrower;
  const reserves = BigNumber.from(100000);

  beforeEach(async () => {
    [_, feeTo, user] = await ethers.getSigners();

    const ERC20Currency = await ethers.getContractFactory('ERC20Mock');
    const UniswapV2Factory = await ethers.getContractFactory('UniswapV2FactoryMock');
    const UniswapV2Pair = await ethers.getContractFactory('UniswapV2PairMock');
    const UniswapERC3156 = await ethers.getContractFactory('UniswapERC3156');
    const FlashBorrower = await ethers.getContractFactory('FlashBorrower');

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

    // lender = await UniswapERC3156.deploy(uniswapFactory.address, weth.address, dai.address);
    lender = await UniswapERC3156.deploy(uniswapFactory.address, feeTo.address);

    borrower = await FlashBorrower.deploy();

    await weth.mint(wethDaiPair.address, reserves);
    await dai.mint(wethDaiPair.address, reserves);
    await wethDaiPair.mint();

    await weth.mint(wethUsdcPair.address, reserves);
    await usdc.mint(wethUsdcPair.address, reserves);
    await wethUsdcPair.mint();

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
