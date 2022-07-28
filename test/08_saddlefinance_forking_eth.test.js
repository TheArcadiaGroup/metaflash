const { expect } = require('chai');
const { ethers } = require('hardhat');
const { BigNumber } = require('ethers');
const fs = require('fs')
const rawPoolsInfo = fs.readFileSync('./config/saddlefinancepool.json');
const poolsInfo = JSON.parse(rawPoolsInfo);
const poolsInfoLength = Object.keys(poolsInfo).length;
const ERC20_ABI = require('../contracts/providers/saddlefinance/abi/IERC20.json');
const POOL_ABI = require('../contracts/providers/saddlefinance/abi/Pool.json');

describe('SaddleFinance', () => {
  let owner, user;
  let weth, wethAddress;
  let borrower;
  let maxEthBal = BigNumber.from(0), totalEthBal = BigNumber.from(0);
  let maxEthFee = BigNumber.from(0), totalEthFee = BigNumber.from(0);

  beforeEach(async () => {
    [owner, user] = await ethers.getSigners();

    // await network.provider.request({
    //   method: "hardhat_reset",
    //   params: [
    //     {
    //       forking: {
    //         jsonRpcUrl: "https://mainnet.infura.io/v3/51b37822bf064fdb8f0004abcabcfbba"
    //       },
    //     },
    //   ],
    // });

    wethHolderAddress = "0x06920C9fC643De77B99cB7670A944AD31eaAA260";
    wethAddress = "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2";
    weth = await ethers.getContractAt(ERC20_ABI, wethAddress);

    await hre.network.provider.request({
      method: 'hardhat_impersonateAccount',
      params: [wethHolderAddress]
    })

    wethuser = await hre.ethers.provider.getSigner(wethHolderAddress)

    const SaddleFinanceFlashLender = await ethers.getContractFactory('SaddleFinanceFlashLender');
    const SaddleFinanceFlashBorrower = await ethers.getContractFactory('SaddleFinanceFlashBorrower');

    lender = await SaddleFinanceFlashLender.deploy();
    borrower = await SaddleFinanceFlashBorrower.deploy();

    // USD_Pool = "0x3911F80530595fBd01Ab1516Ab61255d75AEb066" // USDT, DAI, USDC
    // vETH2_Pool = "0xdec2157831D6ABC3Ec328291119cc91B337272b5" // WETH, vETH2
    // alETH_Pool = "0xa6018520EAACC06C30fF2e1B3ee2c7c22e64196a" // alETH, WETH, sETH
    // D4_Pool = "0xC69DDcd4DFeF25D8a793241834d4cc4b3668EAD6" // FEI, FRAX, LUSD, alUSD
    // USD_Pool_V2 = "0xaCb83E0633d6605c5001e2Ab59EF3C745547C8C7" // USDT, USDC, DAI
    // BTC_Pool_V2 = "0xdf3309771d2BF82cb2B6C56F9f5365C8bD97c4f2" // WBTC, renBTC, sBTC

    let pools = []
    for (let i = 1; i <= poolsInfoLength; i++) {
      pools.push(poolsInfo[i].pools);
    }

    await lender.addPools(pools);

    maxEthBal = BigNumber.from(0), totalEthBal = BigNumber.from(0);
    maxEthFee = BigNumber.from(0), totalEthFee = BigNumber.from(0);
    for (let i = 1; i <= 6; i++) {
      let tempBal = await weth.balanceOf(poolsInfo[i].pools)
      if (tempBal.gt(0)) {
        let pool = await ethers.getContractAt(POOL_ABI, poolsInfo[i].pools);
        let fee = await pool.flashLoanFeeBPS();
        let tempFee = tempBal.mul(fee).div(10000);
        totalEthBal = totalEthBal.add(tempBal);
        totalEthFee = totalEthFee.add(tempFee);
        if (maxEthBal.lt(tempBal)) {
          maxEthBal = tempBal;
          maxEthFee = tempBal.mul(fee).div(10000);
        }
      }
    }
  });

  it('flash supply', async function () {
    beforeETH = await ethers.provider.getBalance(user.address);
    console.log("beforeETH", beforeETH.toString());
    console.log("maxEthBal", maxEthBal.toString());
    expect(await lender.maxFlashLoan(wethAddress, maxEthBal)).to.equal(maxEthBal);
    afterETH = await ethers.provider.getBalance(user.address);
    console.log("afterETH", afterETH.toString());
    let feeETH = ethers.BigNumber.from(beforeETH).sub(afterETH);
    console.log("feeETH", feeETH.toString());

    expect(await lender.maxFlashLoan(wethAddress, maxEthBal.add(1))).to.equal(0);

    beforeETH2 = await ethers.provider.getBalance(user.address);
    console.log("beforeETH2", beforeETH2.toString());
    expect(await lender.maxFlashLoanWithManyPairs_OR_ManyPools(wethAddress)).to.equal(totalEthBal);
    afterETH2 = await ethers.provider.getBalance(user.address);
    console.log("afterETH2", afterETH2.toString());
    let feeETH2 = ethers.BigNumber.from(beforeETH2).sub(afterETH2);
    console.log("feeETH2", feeETH2.toString());
  });

  it('flash fee', async function () {
    beforeETH = await ethers.provider.getBalance(user.address);
    console.log("beforeETH", beforeETH.toString());
    expect(await lender.flashFee(weth.address, maxEthBal)).to.equal(maxEthFee);
    afterETH = await ethers.provider.getBalance(user.address);
    console.log("afterETH", afterETH.toString());
    let feeETH = ethers.BigNumber.from(beforeETH).sub(afterETH);
    console.log("feeETH", feeETH.toString());

    expect(await lender.flashFee(weth.address, maxEthBal.add(1))).to.equal(0);

    beforeETH2 = await ethers.provider.getBalance(user.address);
    console.log("beforeETH2", beforeETH2.toString());
    [fee, pairCount] = await lender.flashFeeWithManyPairs_OR_ManyPools(weth.address, totalEthBal);
    expect(fee).to.equal(totalEthFee);
    afterETH2 = await ethers.provider.getBalance(user.address);
    console.log("afterETH2", afterETH2.toString());
    let feeETH2 = ethers.BigNumber.from(beforeETH2).sub(afterETH2);
    console.log("feeETH2", feeETH2.toString());
  });

  it('flashLoan', async () => {
    beforeETH = await ethers.provider.getBalance(user.address);
    console.log("beforeETH", beforeETH.toString());
    const maxloan = BigNumber.from(await lender.connect(wethuser).maxFlashLoan(weth.address, 1));
    const fee = BigNumber.from(await lender.connect(wethuser).flashFee(weth.address, maxloan));
    await weth.connect(wethuser).transfer(borrower.address, fee);
    await borrower.connect(user).flashBorrow(lender.address, weth.address, maxloan);
    const totalFlashBalance = await borrower.totalFlashBalance();
    expect(totalFlashBalance).to.equal(maxloan.add(fee));
    afterETH = await ethers.provider.getBalance(user.address);
    console.log("afterETH", afterETH.toString());
    let feeETH = ethers.BigNumber.from(beforeETH).sub(afterETH);
    console.log("feeETH", feeETH.toString());
  });

  it('flashLoanWithManyPairs_OR_ManyPools', async () => {
    beforeETH = await ethers.provider.getBalance(user.address);
    console.log("beforeETH", beforeETH.toString());
    const maxloan = BigNumber.from(await lender.connect(wethuser).maxFlashLoanWithManyPairs_OR_ManyPools(weth.address, {gasLimit: 30000000}));
    [fee, pairCount] = await lender.connect(wethuser).flashFeeWithManyPairs_OR_ManyPools(weth.address, maxloan, {gasLimit: 30000000});
    console.log("fee", fee.toString());
    console.log("pairCount", pairCount.toString());
    await weth.connect(wethuser).transfer(borrower.address, fee, {gasLimit: 30000000});
    await borrower.connect(user).flashBorrowWithManyPairs_OR_ManyPools(lender.address, weth.address, maxloan, {gasLimit: 30000000});
    const totalFlashBalance = await borrower.totalFlashBalance();
    expect(totalFlashBalance).to.lte(maxloan.add(fee));
    expect(totalFlashBalance).to.gte(maxloan.add(fee).sub(pairCount));
    afterETH = await ethers.provider.getBalance(user.address);
    console.log("afterETH", afterETH.toString());
    let feeETH = ethers.BigNumber.from(beforeETH).sub(afterETH);
    console.log("feeETH", feeETH.toString());
  });
});
