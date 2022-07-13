const { expect } = require('chai');
const { ethers } = require('hardhat');
const { BigNumber } = require('ethers');

describe('PancakeswapERC3156', () => {
  let user;
  let weth, dai, usdc, wethDaiPair, wethUsdcPair, uniswapFactory, lender;
  let borrower;
  const reserves = BigNumber.from(100000);

  beforeEach(async () => {
    [owner, user] = await ethers.getSigners();

    const ERC20Currency = await ethers.getContractFactory('PancakeswapERC20');
    const PancakeFactory = await ethers.getContractFactory('PancakeFactory');
    const PancakePair = await ethers.getContractFactory('PancakePair');
    const PancakeswapERC3156 = await ethers.getContractFactory('PancakeswapERC3156');
    const FlashBorrower = await ethers.getContractFactory('ERC3156FlashBorrower');

    weth = await ERC20Currency.deploy('WETH', 'WETH');
    dai = await ERC20Currency.deploy('DAI', 'DAI');
    usdc = await ERC20Currency.deploy('USDC', 'USDC');

    pancakeFactory = await PancakeFactory.deploy(owner.address);

    // First we do a .callStatic to retrieve the pair address, which is deterministic because of create2. Then we create the pair.
    wethDaiPairAddress = await pancakeFactory.callStatic.createPair(weth.address, dai.address);
    await pancakeFactory.createPair(weth.address, dai.address);
    wethDaiPair = await PancakePair.attach(wethDaiPairAddress);

    wethUsdcPairAddress = await pancakeFactory.callStatic.createPair(weth.address, usdc.address);
    await pancakeFactory.createPair(weth.address, usdc.address);
    wethUsdcPair = await PancakePair.attach(wethUsdcPairAddress);

    lender = await PancakeswapERC3156.deploy(owner.address);

    borrower = await FlashBorrower.deploy();

    await weth.mint(wethDaiPair.address, reserves);
    await dai.mint(wethDaiPair.address, reserves);
    await wethDaiPair.mint(wethDaiPair.address);

    await weth.mint(wethUsdcPair.address, reserves);
    await usdc.mint(wethUsdcPair.address, reserves);
    await wethUsdcPair.mint(wethUsdcPair.address);

    await lender.addPairs([weth.address], [dai.address], [wethDaiPairAddress]);
  });

  it('addPair: Revert if sender is not owner', async function () {
    await expect(lender.connect(user).addPairs([weth.address], [usdc.address], [wethUsdcPairAddress])).to.revertedWith('PancakeswapERC3156: Not factory');
  });

  it("addPair: Should update", async function () {
    expect(await lender.maxFlashLoan(usdc.address)).to.equal(0);
    await lender.addPairs([weth.address], [usdc.address], [wethUsdcPairAddress]);
    expect(await lender.maxFlashLoan(usdc.address)).to.equal(reserves.sub(1));
  });

  it('removePair: Revert if sender is not owner', async function () {
    await expect(lender.connect(user).removePairs([wethDaiPairAddress])).to.revertedWith('PancakeswapERC3156: Not factory');
  });

  it("removePair: Should update", async function () {
    await lender.addPairs([weth.address], [usdc.address], [wethUsdcPairAddress]);
    expect(await lender.maxFlashLoan(usdc.address)).to.equal(reserves.sub(1));
    await lender.removePairs([wethUsdcPairAddress]);
    expect(await lender.maxFlashLoan(usdc.address)).to.equal(0);
  });

  it('flash supply', async function () {
    expect(await lender.maxFlashLoan(weth.address)).to.equal(reserves.sub(1));
    expect(await lender.maxFlashLoan(dai.address)).to.equal(reserves.sub(1));
    expect(await lender.maxFlashLoan(lender.address)).to.equal(0);
    // await expect(lender.maxFlashLoan(lender.address)).to.revertedWith('Unsupported currency');
  });

  it('flash fee', async function () {
    expect(await lender.flashFee(weth.address, reserves)).to.equal((reserves.mul(25).div(9975).add(1)));
    expect(await lender.flashFee(dai.address, reserves)).to.equal((reserves.mul(25).div(9975).add(1)));
    // await expect(lender.flashFee(lender.address, reserves)).to.revertedWith('Unsupported currency');
  });

  it('weth flash loan', async () => {
    const loan = await lender.maxFlashLoan(weth.address);
    const fee = await lender.flashFee(weth.address, loan);

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
  });

  it('dai flash loan', async () => {
    const loan = await lender.maxFlashLoan(dai.address);
    const fee = await lender.flashFee(dai.address, loan);

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
  });
});
