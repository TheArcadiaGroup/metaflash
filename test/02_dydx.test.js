const { expect } = require('chai');
const { ethers } = require('hardhat');
const { BigNumber } = require('ethers');

describe('DYDXERC3156', () => {
  let user, feeTo;
  let weth, dai, usdc, borrower, solo, lender;
  const soloBalance = BigNumber.from(100000);

  beforeEach(async function () {
    [_, feeTo, user] = await ethers.getSigners();

    const SoloMarginMock = await ethers.getContractFactory('SoloMarginMock');
    const DYDXERC3156 = await ethers.getContractFactory('DYDXERC3156');
    const MockToken = await ethers.getContractFactory('MockToken');
    const FlashBorrower = await ethers.getContractFactory('FlashBorrower');

    weth = await MockToken.deploy('WETH', 'WETH');
    dai = await MockToken.deploy('DAI', 'DAI');
    usdc = await MockToken.deploy('USDC', 'USDC');
    solo = await SoloMarginMock.deploy([0, 1, 2], [weth.address, dai.address, usdc.address]);
    lender = await DYDXERC3156.deploy(solo.address, feeTo.address);

    borrower = await FlashBorrower.deploy();

    await weth.mint(solo.address, soloBalance);
    await dai.mint(solo.address, soloBalance);
    const fee = await lender.flashFee(weth.address, soloBalance);
    await weth.mint(borrower.address, fee);
    await dai.mint(borrower.address, fee);
  });
  it("Revert if sender is not owner", async function () {
    await expect(lender.connect(user).setFeeTo(user.address)).to.revertedWith('Ownable: caller is not the owner');
  });

  it("Should update feeTo", async function () {
    await lender.setFeeTo(user.address);
    expect(await lender.FEETO()).to.equal(user.address);
  });
  
  it('flash supply', async function () {
    expect(await lender.maxFlashLoan(weth.address)).to.equal(soloBalance);
    expect(await lender.maxFlashLoan(usdc.address)).to.equal('0');
    expect(await lender.maxFlashLoan(lender.address)).to.equal('0');
  });

  it('flash fee', async function () {
    expect(await lender.flashFee(weth.address, soloBalance)).to.equal(soloBalance.mul(5).div(1000).add(2));
    expect(await lender.flashFee(usdc.address, soloBalance)).to.equal(soloBalance.mul(5).div(1000).add(2));
    await expect(lender.flashFee(lender.address, soloBalance)).to.revertedWith(
      'Unsupported currency',
    );
  });

  it('weth flash loan', async function () {
    const fee = await lender.flashFee(weth.address, soloBalance);

    const balanceBeforeFeeTo = await weth.balanceOf(feeTo.address);

    await borrower.connect(user).flashBorrow(lender.address, weth.address, soloBalance);
    expect(await weth.balanceOf(solo.address)).to.equal(soloBalance.add(2));

    const balanceAfter = await weth.balanceOf(await user.getAddress());
    expect(balanceAfter).to.equal(BigNumber.from('0'));
    const flashBalance = await borrower.flashBalance();
    expect(flashBalance).to.equal(soloBalance.add(fee));
    const flashToken = await borrower.flashToken();
    expect(flashToken).to.equal(weth.address);
    const flashAmount = await borrower.flashAmount();
    expect(flashAmount).to.equal(soloBalance);
    const flashFee = await borrower.flashFee();
    expect(flashFee).to.equal(fee);
    const flashSender = await borrower.flashSender();
    expect(flashSender).to.equal(borrower.address);

    const balanceAfterFeeTo = await weth.balanceOf(feeTo.address);
    expect(balanceAfterFeeTo.sub(balanceBeforeFeeTo)).to.equal(soloBalance.mul(5).div(1000));
  });

  it('dai flash loan', async function () {
    const fee = await lender.flashFee(dai.address, soloBalance);

    const balanceBeforeFeeTo = await dai.balanceOf(feeTo.address);

    await borrower.connect(user).flashBorrow(lender.address, dai.address, soloBalance);
    expect(await dai.balanceOf(solo.address)).to.equal(soloBalance.add(2));

    const balanceAfter = await dai.balanceOf(await user.getAddress());
    expect(balanceAfter).to.equal(BigNumber.from('0'));
    const flashBalance = await borrower.flashBalance();
    expect(flashBalance).to.equal(soloBalance.add(fee));
    const flashToken = await borrower.flashToken();
    expect(flashToken).to.equal(dai.address);
    const flashAmount = await borrower.flashAmount();
    expect(flashAmount).to.equal(soloBalance);
    const flashFee = await borrower.flashFee();
    expect(flashFee).to.equal(fee);
    const flashSender = await borrower.flashSender();
    expect(flashSender).to.equal(borrower.address);

    const balanceAfterFeeTo = await dai.balanceOf(feeTo.address);
    expect(balanceAfterFeeTo.sub(balanceBeforeFeeTo)).to.equal(soloBalance.mul(5).div(1000));
  });
});
