const { expect } = require('chai');
const { ethers } = require('hardhat');
const { BigNumber } = require('ethers');
const fs = require('fs')
const rawPairsInfo = fs.readFileSync('./config/defiswappair.json');
const pairsInfo =  JSON.parse(rawPairsInfo);
const pairsInfoLength = Object.keys(pairsInfo).length;
const ERC20_ABI = require('../contracts/providers/defiswap/abi/IERC20.json');
const FACTORY_ABI = require('../contracts/providers/defiswap/abi/Factory.json');

describe('defiswap', () => {
  let owner, user;
  let weth, wethAddress, totalFeeBasisPoint;
  let borrower;
  let maxEthBal = BigNumber.from(0), totalEthBal = BigNumber.from(0);

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
    factoryAddress = "0x9deb29c9a4c7a88a3c0257393b7f3335338d9a9d";
    weth = await ethers.getContractAt(ERC20_ABI, wethAddress);
    factory = await ethers.getContractAt(FACTORY_ABI, factoryAddress);

    await hre.network.provider.request({
      method: 'hardhat_impersonateAccount',
      params: [wethHolderAddress]
    })

    wethuser = await hre.ethers.provider.getSigner(wethHolderAddress)

    const CroDefiSwapFlashLender = await ethers.getContractFactory('CroDefiSwapFlashLender');
    const CroDefiSwapFlashBorrower = await ethers.getContractFactory('CroDefiSwapFlashBorrower');

    lender = await CroDefiSwapFlashLender.deploy(factoryAddress);
    borrower = await CroDefiSwapFlashBorrower.deploy();

    let tokens0 = []
    let tokens1 = []
    let pairs = []

    for (let i = 1; i <= pairsInfoLength; i++) {
      tokens0.push(pairsInfo[i].tokens0);
      tokens1.push(pairsInfo[i].tokens1);
      pairs.push(pairsInfo[i].pairs);
    }

    await lender.addPairs(tokens0, tokens1, pairs);
    for (let i = 1; i <= pairsInfoLength; i++) {
      if(wethAddress == pairsInfo[i].tokens0 || wethAddress == pairsInfo[i].tokens1){
        let tempBal = await weth.balanceOf(pairsInfo[i].pairs)
        if(tempBal.gt(BigNumber.from(1))) {
          totalEthBal = totalEthBal.add(tempBal).sub(1);
          if(maxEthBal.lt(tempBal.sub(1))){
            maxEthBal = tempBal.sub(1);        
          }
        }
      }
    }

    totalFeeBasisPoint = await factory.totalFeeBasisPoint()
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
    let maxEthFee = BigNumber.from(maxEthBal).mul(totalFeeBasisPoint).div(BigNumber.from(10000).sub(totalFeeBasisPoint)).add(1)
    beforeETH = await ethers.provider.getBalance(user.address);
    console.log("beforeETH", beforeETH.toString());
    expect(await lender.flashFee(weth.address, maxEthBal)).to.equal(maxEthFee);
    afterETH = await ethers.provider.getBalance(user.address);
    console.log("afterETH", afterETH.toString());
    let feeETH = ethers.BigNumber.from(beforeETH).sub(afterETH);
    console.log("feeETH", feeETH.toString());

    expect(await lender.flashFee(weth.address, maxEthBal.add(1))).to.equal(0);

    let totalEthFee = BigNumber.from(totalEthBal).mul(totalFeeBasisPoint).div(BigNumber.from(10000).sub(totalFeeBasisPoint)).add(1)
    beforeETH2 = await ethers.provider.getBalance(user.address);
    console.log("beforeETH2", beforeETH2.toString());
    [fee, pairCount] = await lender.flashFeeWithManyPairs_OR_ManyPools(weth.address, totalEthBal);
    expect(fee).to.equal(totalEthFee.add(pairCount));
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
