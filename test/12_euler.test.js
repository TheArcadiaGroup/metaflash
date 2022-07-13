const { expect } = require('chai');
const { ethers } = require('hardhat');
const { BigNumber } = require('ethers');

describe('EulerERC3156', () => {
  let user;
  let weth, dai, aWeth, aDai, lendingPool, lendingPoolAddressProvider, lender, premium, additionalFee;
  let borrower;
  const bal = BigNumber.from(100000);
  const gitCommit = "0x000000000000000000000000c9126e6d1b3fc9a50a2e324bccb8ee3be06ac3ab"

  beforeEach(async () => {
    [_, user, admin, module] = await ethers.getSigners();
    // const AToken = await ethers.getContractFactory('ATokenMock');
    const TestERC20 = await ethers.getContractFactory('TestERC20');


    // const AaveERC3156 = await ethers.getContractFactory('AaveV2ERC3156');
    const FlashBorrower = await ethers.getContractFactory('ERC3156FlashBorrower');

    weth = await TestERC20.deploy('WETH', 'WETH', 18, false);
    dai = await TestERC20.deploy('DAI', 'DAI', 18, false);
    // aWeth = await AToken.deploy(weth.address, 'AToken1', 'ATST1');
    // aDai = await AToken.deploy(dai.address, 'Atoken2', 'ATST2');
    // lendingPool = await LendingPool.deploy();

    const Markets = await ethers.getContractFactory('Markets');
    markets = await Markets.deploy(gitCommit);

    const Exec = await ethers.getContractFactory('Exec');
    exec = await Exec.deploy(gitCommit);

    const Euler = await ethers.getContractFactory('Euler');
    euler = await Euler.deploy(admin.address, module.address);

    const FlashLoan = await ethers.getContractFactory('FlashLoan');
    flashloan = await FlashLoan.deploy(euler.address, exec.address, markets.address);
    
    const EulerERC3156 = await ethers.getContractFactory('EulerERC3156');
    lender = await EulerERC3156.deploy(flashloan.address);

    borrower = await FlashBorrower.deploy();

    await weth.mint(euler.address, bal);
    await dai.mint(euler.address, bal);
    // await markets.activateMarket(weth.address);
    // await markets.activateMarket(dai.address);
  });

  it('flash supply', async function () {
    expect(await lender.maxFlashLoan(weth.address)).to.equal(bal);
    expect(await lender.maxFlashLoan(dai.address)).to.equal(bal);
    expect(await lender.maxFlashLoan(lender.address)).to.equal('0');
  });

  it('flash fee', async function () {
    expect(await lender.flashFee(weth.address, bal)).to.equal(bal.mul(5).div(1000));
    expect(await lender.flashFee(dai.address, bal)).to.equal(bal.mul(5).div(1000));
    // await expect(lender.flashFee(lender.address, bal)).to.revertedWith('Unsupported currency');
  });

  it('weth flash loan', async () => {
    const fee = await lender.flashFee(weth.address, bal);

    await weth.connect(user).mint(borrower.address, fee);
    await borrower.connect(user).flashBorrow(lender.address, weth.address, bal);

    const balanceAfter = await weth.balanceOf(user.address);
    expect(balanceAfter).to.equal(BigNumber.from('0'));
    const flashBalance = await borrower.flashBalance();
    expect(flashBalance).to.equal(bal.add(fee));
    const flashToken = await borrower.flashToken();
    expect(flashToken).to.equal(weth.address);
    const flashAmount = await borrower.flashAmount();
    expect(flashAmount).to.equal(bal);
    const flashFee = await borrower.flashFee();
    expect(flashFee).to.equal(fee);
    const flashSender = await borrower.flashSender();
    expect(flashSender).to.equal(borrower.address);

    const balanceAfterFeeTo = await weth.balanceOf(feeTo.address);
    expect(balanceAfterFeeTo.sub(balanceBeforeFeeTo)).to.equal(bal.mul(5).div(1000));

  });

  it('dai flash loan', async () => {
    const fee = await lender.flashFee(dai.address, bal);

    await dai.connect(user).mint(borrower.address, fee);
    await borrower.connect(user).flashBorrow(lender.address, dai.address, bal);

    const balanceAfter = await dai.balanceOf(user.address);
    expect(balanceAfter).to.equal(BigNumber.from('0'));
    const flashBalance = await borrower.flashBalance();
    expect(flashBalance).to.equal(bal.add(fee));
    const flashToken = await borrower.flashToken();
    expect(flashToken).to.equal(dai.address);
    const flashAmount = await borrower.flashAmount();
    expect(flashAmount).to.equal(bal);
    const flashFee = await borrower.flashFee();
    expect(flashFee).to.equal(fee);
    const flashSender = await borrower.flashSender();
    expect(flashSender).to.equal(borrower.address);
  });
});
