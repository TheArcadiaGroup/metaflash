const { expect } = require('chai');
const { ethers } = require('hardhat');
const { BigNumber } = require('ethers');

describe('CreamFinance', () => {
  let user, feeTo;
  let weth, dai, usdc, wethDaiPair, wethUsdcPair, lender;
  let borrower;
  const bal = BigNumber.from(100000);

  let baseRate = 0;
  let multiplier = ethers.utils.parseEther('0.23');
  let jump = ethers.utils.parseEther('8');
  let kink1 = ethers.utils.parseEther('0.8');
  let kink2 = ethers.utils.parseEther('0.9');
  let roof = ethers.utils.parseEther('1.5');

  const exchangeRate = '0.02';
  const initialExchangeRate = ethers.utils.parseUnits(exchangeRate, 18 + 18 - 8);

  beforeEach(async () => {
    [owner, feeTo, user] = await ethers.getSigners();

    const ERC20Currency = await ethers.getContractFactory('CreamFinanceERC20');
    weth = await ERC20Currency.deploy('WETH', 'WETH');
    dai = await ERC20Currency.deploy('DAI', 'DAI');

    const Comptroller = await ethers.getContractFactory('Comptroller');
    comptroller = await Comptroller.deploy();

    const CreamFinanceERC3156 = await ethers.getContractFactory('CreamFinanceERC3156');
    const FlashBorrower = await ethers.getContractFactory('FlashBorrower');

    const InterestRateModel = await ethers.getContractFactory('TripleSlopeRateModel');
    interestratemodel = await InterestRateModel.deploy(
      baseRate,
      multiplier.mul(kink1).div(ethers.utils.parseEther('1')),
      jump,
      kink1,
      kink2,
      roof,
      owner.address
    );
    
    const CTokenAdmin = await ethers.getContractFactory('CTokenAdmin');
    ctokenadmin = await CTokenAdmin.deploy(owner.address);

    const CCollateralCapErc20Delegate = await ethers.getContractFactory('CCollateralCapErc20Delegate');
    ccollateralcaperc20delegate = await CCollateralCapErc20Delegate.deploy();

    const CErc20Delegator = await ethers.getContractFactory('CErc20Delegator');
    cerc20delegator = await CErc20Delegator.deploy(dai.address, comptroller.address, interestratemodel.address, initialExchangeRate, "crDAI", "crDAI", 18, ctokenadmin.address, ccollateralcaperc20delegate.address, "0x", {gasLimit : "30000000"});

    const CWrappedNativeDelegate = await ethers.getContractFactory('CWrappedNativeDelegate');
    cwrappednativedelegate = await CWrappedNativeDelegate.deploy();
    
    const CWrappedNativeDelegator = await ethers.getContractFactory('CWrappedNativeDelegator');
    cwrappednativedelegator = await CWrappedNativeDelegator.deploy(weth.address, comptroller.address, interestratemodel.address, 1, "crETH", "crETH", 18, ctokenadmin.address, cwrappednativedelegate.address, "0x", {gasLimit : "30000000"});

    // await ccollateralcaperc20delegate["initialize(address,address,address,uint256,string,string,uint8)"](dai.address, comptroller.address, interestratemodel.address, 0, "crDAI", "crDAI", 18);

    // await ccollateralcaperc20delegate.initialize(dai.address, comptroller, interestratemodel, 0, "crDAI", "crDAI", 18);
    // await cwrappednativedelegate.initialize(weth.address, comptroller, interestratemodel, 0, "crWETH", "crWETH", 18);

    await comptroller._supportMarket(cerc20delegator.address, 1)
    await comptroller._supportMarket(cwrappednativedelegator.address, 2)

    lender = await CreamFinanceERC3156.deploy(owner.address, feeTo.address);
    borrower = await FlashBorrower.deploy();

    await dai.mint(cerc20delegator.address, bal);
    
    await cerc20delegator.mint(bal)

    await weth.mint(cwrappednativedelegator.address, bal);
    await cwrappednativedelegator.mint(bal-1)

    await lender.addCTokens([cwrappednativedelegator.address], [weth.address]);
  });

  it("feeTo: Revert if sender is not owner", async function () {
    await expect(lender.connect(user).setFeeTo(user.address)).to.revertedWith('CreamFinanceERC3156: Not factory');
  });

  // it("feeTo: Should update", async function () {
  //   await lender.setFeeTo(user.address);
  //   expect(await lender.FEETO()).to.equal(user.address);
  // });

  // it('addCTokens: Revert if sender is not owner', async function () {
  //   await expect(lender.connect(user).addCTokens([cerc20delegator.address], [weth.address])).to.revertedWith('CreamFinanceERC3156: Not factory');
  // });

  // it("addCTokens: Should update", async function () {
  //   await expect(lender.maxFlashLoan(dai.address)).to.revertedWith('CreamFinanceERC3156: Unsupported currency');
  //   await lender.addCTokens([cerc20delegator.address], [dai.address]);
  //   expect(await lender.maxFlashLoan(dai.address)).to.equal(bal);
  // });

  // it('removeCTokens: Revert if sender is not owner', async function () {
  //   await expect(lender.connect(user).removeCTokens([cerc20delegator.address])).to.revertedWith('CreamFinanceERC3156: Not factory');
  // });

  // it("removeCTokens: Should update", async function () {
  //   await lender.addCTokens([cerc20delegator.address], [dai.address]);
  //   expect(await lender.maxFlashLoan(dai.address)).to.equal(bal);
  //   await lender.removeCTokens([cerc20delegator.address]);
  //   await expect(lender.maxFlashLoan(dai.address)).to.revertedWith('CreamFinanceERC3156: Unsupported currency');
  // });

  // it('flash supply', async function () {
  //   expect(await lender.maxFlashLoan(weth.address)).to.equal(bal);
  //   expect(await lender.maxFlashLoan(dai.address)).to.equal(bal);
  //   await expect(lender.maxFlashLoan(lender.address)).to.revertedWith('CreamFinanceERC3156: Unsupported currency');
  // });

  // it('flash fee', async function () {
  //   let wethFee = await cwrappednativedelegator.flashFee(weth.address, bal)
  //   let daiFee = await cerc20delegator.flashFee(dai.address, bal)
  //   expect(await lender.flashFee(weth.address, bal)).to.equal(wethFee.add(reserves.mul(5).div(1000)));
  //   expect(await lender.flashFee(dai.address, bal)).to.equal(daiFee.add(reserves.mul(5).div(1000)));
  //   await expect(lender.flashFee(lender.address, reserves)).to.revertedWith('CreamFinanceERC3156: Unsupported currency');
  // });

  // it('weth flash loan', async () => {
  //   const loan = await lender.maxFlashLoan(weth.address);
  //   const fee = await lender.flashFee(weth.address, loan);

  //   const balanceBeforeFeeTo = await weth.balanceOf(feeTo.address);

  //   await weth.connect(user).mint(borrower.address, fee);
  //   await borrower.connect(user).flashBorrow(lender.address, weth.address, loan);

  //   const balanceAfter = await weth.balanceOf(await user.getAddress());
  //   expect(balanceAfter).to.equal(BigNumber.from('0'));
  //   const flashBalance = await borrower.flashBalance();
  //   expect(flashBalance).to.equal(loan.add(fee));
  //   const flashAmount = await borrower.flashAmount();
  //   expect(flashAmount).to.equal(loan);
  //   const flashFee = await borrower.flashFee();
  //   expect(flashFee).to.equal(fee);
  //   const flashSender = await borrower.flashSender();
  //   expect(flashSender).to.equal(borrower.address);

  //   const balanceAfterFeeTo = await weth.balanceOf(feeTo.address);
  //   expect(balanceAfterFeeTo.sub(balanceBeforeFeeTo)).to.equal(loan.mul(5).div(1000));
  // });

  // it('dai flash loan', async () => {
  //   const loan = await lender.maxFlashLoan(dai.address);
  //   const fee = await lender.flashFee(dai.address, loan);

  //   const balanceBeforeFeeTo = await dai.balanceOf(feeTo.address);

  //   await dai.connect(user).mint(borrower.address, fee);
  //   await borrower.connect(user).flashBorrow(lender.address, dai.address, loan);

  //   const balanceAfter = await dai.balanceOf(await user.getAddress());
  //   expect(balanceAfter).to.equal(BigNumber.from('0'));
  //   const flashBalance = await borrower.flashBalance();
  //   expect(flashBalance).to.equal(loan.add(fee));
  //   const flashAmount = await borrower.flashAmount();
  //   expect(flashAmount).to.equal(loan);
  //   const flashFee = await borrower.flashFee();
  //   expect(flashFee).to.equal(fee);
  //   const flashSender = await borrower.flashSender();
  //   expect(flashSender).to.equal(borrower.address);

  //   const balanceAfterFeeTo = await dai.balanceOf(feeTo.address);
  //   expect(balanceAfterFeeTo.sub(balanceBeforeFeeTo)).to.equal(loan.mul(5).div(1000));
  // });
});
