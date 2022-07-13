const { expect } = require('chai');
const { ethers } = require('hardhat');
const { BigNumber } = require('ethers');

describe('DefiSwapERC3156', () => {
  let user;
  let weth, dai, usdc, wethDaiPair, wethUsdcPair, lender;
  let borrower;
  const reserves = BigNumber.from(100000);

  beforeEach(async () => {
    [_, user] = await ethers.getSigners();

    const ERC20Currency = await ethers.getContractFactory('ERC20Mock');
    const CroDefiSwapFactory = await ethers.getContractFactory('CroDefiSwapFactory');
    const CroDefiSwapPair = await ethers.getContractFactory('CroDefiSwapPair');
    const DefiSwapERC3156 = await ethers.getContractFactory('DefiSwapERC3156');
    const FlashBorrower = await ethers.getContractFactory('ERC3156FlashBorrower');

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

    lender = await DefiSwapERC3156.deploy(crodefiswapFactory.address);

    borrower = await FlashBorrower.deploy();

    await weth.mint(wethDaiPair.address, reserves);
    await dai.mint(wethDaiPair.address, reserves);
    await wethDaiPair.mint(wethDaiPair.address);

    await weth.mint(wethUsdcPair.address, reserves);
    await usdc.mint(wethUsdcPair.address, reserves);
    await wethUsdcPair.mint(wethUsdcPair.address);

    await lender.addPair([weth.address], [dai.address], [wethDaiPairAddress]);
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
    let totalFeeBasisPoint = await crodefiswapFactory.totalFeeBasisPoint()
    expect(await lender.flashFee(weth.address, reserves)).to.equal((reserves.mul(totalFeeBasisPoint).div(10000 - totalFeeBasisPoint).add(1)));
    expect(await lender.flashFee(dai.address, reserves)).to.equal((reserves.mul(totalFeeBasisPoint).div(10000- totalFeeBasisPoint).add(1)));
    // return ((amount * totalFeeBasisPoint) / (magnifier - totalFeeBasisPoint) + 1);
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
