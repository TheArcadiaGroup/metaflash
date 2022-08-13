const { expect } = require('chai');
const { solidityPack } = require("ethers/lib/utils")
// const { ethers } = require('hardhat');
const { BigNumber } = require('ethers');

const { deployments, ethers, upgrades } = require('hardhat')
const {
    getBigNumber
} = require('./utilities')

describe('SaddleFinance', () => {
    let signers, swapFlashLoan, flashLoanExample, DAI, USDC, USDT, SUSD, swapToken, owner, user1, user2, attacker, ownerAddress, user1Address, user2Address
    let fixture, lender, borrower, user, DAI2
    const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'
    const ONE_ADDRESS = '0x1111111111111111111111111111111111111111'
    const INITIAL_A_VALUE = 50
    const SWAP_FEE = 1e7
    const LP_TOKEN_NAME = "Test LP Token Name"
    const LP_TOKEN_SYMBOL = "TESTLP"
    const MAX_UINT256 = ethers.constants.MaxUint256

    before(async function () {
        fixture = deployments.createFixture(async ({ deployments, ethers }) => {
            await deployments.fixture();
            signers = await ethers.getSigners();
            owner = signers[0]
            user1 = signers[1]
            user2 = signers[2]
            feeTo = signers[3]
            user = signers[3]
            attacker = signers[10]
            const erc20Factory = await ethers.getContractFactory('GenericERC20');
            DAI = await erc20Factory.deploy("DAI", "DAI", 18)
            USDC = await erc20Factory.deploy("USDC", "USDC", 6)
            USDT = await erc20Factory.deploy("USDT", "USDT", 6)
            SUSD = await erc20Factory.deploy("SUSD", "SUSD", 18)

            DAI2 = await erc20Factory.deploy("DAI2", "DAI2", 18)

            await DAI.mint(owner.address, String(1e20))
            await USDC.mint(owner.address, String(1e8))
            await USDT.mint(owner.address, String(1e8))
            await SUSD.mint(owner.address, String(1e20))

            await DAI.mint(user1.address, String(1e20))
            await USDC.mint(user1.address, String(1e8))
            await USDT.mint(user1.address, String(1e8))
            await SUSD.mint(user1.address, String(1e20))

            await DAI.mint(user2.address, String(1e20))
            await USDC.mint(user2.address, String(1e8))
            await USDT.mint(user2.address, String(1e8))
            await SUSD.mint(user2.address, String(1e20))

            await DAI.mint(attacker.address, String(1e20))
            await USDC.mint(attacker.address, String(1e8))
            await USDT.mint(attacker.address, String(1e8))
            await SUSD.mint(attacker.address, String(1e20))

            await DAI2.mint(owner.address, String(1e20))
            await USDC.mint(owner.address, String(1e8))
            await USDT.mint(owner.address, String(1e8))
            await SUSD.mint(owner.address, String(1e20))

            const LPToken = await ethers.getContractFactory('LPToken');
            lptoken = await LPToken.deploy()
            await lptoken.initialize("LPTOKEN", "LPTOKEN")

            const LibSwapUtils = await ethers.getContractFactory("SwapUtils");
            const libswaputils = await LibSwapUtils.deploy();
            await libswaputils.deployed();

            const LibAmplificationUtils = await ethers.getContractFactory("AmplificationUtils");
            const libamplificationutils = await LibAmplificationUtils.deploy();
            await libamplificationutils.deployed();

            const SwapFlashLoan = await ethers.getContractFactory('SwapFlashLoan', {
                signer: owner,
                libraries: {
                    SwapUtils: libswaputils.address,
                    AmplificationUtils: libamplificationutils.address,
                }
            });
            swapFlashLoan = await SwapFlashLoan.deploy()
            swapFlashLoan2 = await SwapFlashLoan.deploy()

            await swapFlashLoan.initialize(
                [DAI.address, USDC.address, USDT.address, SUSD.address],
                [18, 6, 6, 18],
                LP_TOKEN_NAME,
                LP_TOKEN_SYMBOL,
                INITIAL_A_VALUE,
                SWAP_FEE,
                0,
                lptoken.address
            )

            await swapFlashLoan2.initialize(
                [DAI2.address, USDC.address, USDT.address, SUSD.address],
                [18, 6, 6, 18],
                LP_TOKEN_NAME,
                LP_TOKEN_SYMBOL,
                INITIAL_A_VALUE,
                SWAP_FEE,
                0,
                lptoken.address
            )

            expect(await swapFlashLoan.getVirtualPrice()).to.be.eq(0)
            expect(await swapFlashLoan2.getVirtualPrice()).to.be.eq(0)

            swapStorage = await swapFlashLoan.swapStorage()
            swapStorage2 = await swapFlashLoan2.swapStorage()

            swapToken = await ethers.getContractAt(
                "LPToken",
                swapStorage.lpToken)

            swapToken2 = await ethers.getContractAt(
                "LPToken",
                swapStorage2.lpToken)

            await DAI.connect(owner).approve(swapFlashLoan.address, MAX_UINT256)
            await USDC.connect(owner).approve(swapFlashLoan.address, MAX_UINT256)
            await USDT.connect(owner).approve(swapFlashLoan.address, MAX_UINT256)
            await SUSD.connect(owner).approve(swapFlashLoan.address, MAX_UINT256)

            await DAI.connect(user1).approve(swapFlashLoan.address, MAX_UINT256)
            await USDC.connect(user1).approve(swapFlashLoan.address, MAX_UINT256)
            await USDT.connect(user1).approve(swapFlashLoan.address, MAX_UINT256)
            await SUSD.connect(user1).approve(swapFlashLoan.address, MAX_UINT256)

            await DAI.connect(user2).approve(swapFlashLoan.address, MAX_UINT256)
            await USDC.connect(user2).approve(swapFlashLoan.address, MAX_UINT256)
            await USDT.connect(user2).approve(swapFlashLoan.address, MAX_UINT256)
            await SUSD.connect(user2).approve(swapFlashLoan.address, MAX_UINT256)

            await DAI.connect(attacker).approve(swapFlashLoan.address, MAX_UINT256)
            await USDC.connect(attacker).approve(swapFlashLoan.address, MAX_UINT256)
            await USDT.connect(attacker).approve(swapFlashLoan.address, MAX_UINT256)
            await SUSD.connect(attacker).approve(swapFlashLoan.address, MAX_UINT256)

            await DAI2.connect(owner).approve(swapFlashLoan2.address, MAX_UINT256)
            await USDC.connect(owner).approve(swapFlashLoan2.address, MAX_UINT256)
            await USDT.connect(owner).approve(swapFlashLoan2.address, MAX_UINT256)
            await SUSD.connect(owner).approve(swapFlashLoan2.address, MAX_UINT256)

            await swapFlashLoan.addLiquidity(
                [String(50e18), String(50e6), String(50e6), String(50e18)],
                0,
                MAX_UINT256,
            )

            await swapFlashLoan2.addLiquidity(
                [String(60e18), String(60e6), String(60e6), String(60e18)],
                0,
                MAX_UINT256,
            )

            expect(await swapFlashLoan.getTokenBalance(0)).to.be.eq(String(50e18))
            expect(await swapFlashLoan.getTokenBalance(1)).to.be.eq(String(50e6))
            expect(await swapFlashLoan.getTokenBalance(2)).to.be.eq(String(50e6))
            expect(await swapFlashLoan.getTokenBalance(3)).to.be.eq(String(50e18))

            expect(await swapFlashLoan2.getTokenBalance(0)).to.be.eq(String(60e18))
            expect(await swapFlashLoan2.getTokenBalance(1)).to.be.eq(String(60e6))
            expect(await swapFlashLoan2.getTokenBalance(2)).to.be.eq(String(60e6))
            expect(await swapFlashLoan2.getTokenBalance(3)).to.be.eq(String(60e18))

            expect(await swapToken.balanceOf(owner.address)).to.be.eq(
                String(200e18),
            )

            expect(await swapToken2.balanceOf(owner.address)).to.be.eq(
                String(240e18),
            )

            const flashLoanExampleFactory = await ethers.getContractFactory(
                "FlashLoanBorrowerExample",
            )
            flashLoanExample = await flashLoanExampleFactory.deploy()

            await swapFlashLoan.setFlashLoanFees(100, 5000)
            await swapFlashLoan2.setFlashLoanFees(150, 5000)


            const SaddleFinanceERC3156 = await ethers.getContractFactory('SaddleFinanceFlashLender');
            const FlashBorrower = await ethers.getContractFactory('SaddleFinanceFlashBorrower');
            lender = await SaddleFinanceERC3156.deploy();
            borrower = await FlashBorrower.deploy();
            await lender.addPools([swapFlashLoan.address]);
            await lender.setFlashLoaner(owner.address);
        })
    })

    beforeEach(async function () {
        await fixture()
    })

    it("check operator", async function () {
        expect(await lender.operator()).to.equal(owner.address);
        await expect(lender.connect(user).setOperator(user.address)).to.revertedWith('SaddleFinanceFlashLender: Not operator');
        await lender.setOperator(user.address);
        expect(await lender.operator()).to.equal(user.address);
      });

      it("check flashloaner", async function () {
        expect(await lender.flashloaner()).to.equal(owner.address);
        await expect(lender.connect(user).setFlashLoaner(user.address)).to.revertedWith('SaddleFinanceFlashLender: Not operator');
        await lender.setFlashLoaner(user.address);
        expect(await lender.flashloaner()).to.equal(user.address);
      });

      it('getFlashLoanInfoListWithCheaperFeePriority', async function () {
        await expect(lender.connect(user).getFlashLoanInfoListWithCheaperFeePriority(DAI.address, 1)).to.revertedWith('SaddleFinanceFlashLender: Not flashloaner');
        [pairs, maxloans, fees] = await lender.getFlashLoanInfoListWithCheaperFeePriority(DAI.address, 1);
        console.log("maxloans.length", maxloans.length);
        if (maxloans.length > 1) {
          for (let i = 0; i < maxloans.length - 1; i++) {
            expect(fees[i]).to.lte(fees[i + 1]);
            if (fees[i] == fees[i + 1]) {
              expect(maxloans[i]).to.gte(maxloans[i + 1]);
            }
          }
        }
      });

      it("add/removePools", async function () {
        //add
        await expect(lender.connect(user).addPools([ONE_ADDRESS])).to.revertedWith('SaddleFinanceFlashLender: Not operator');
        await expect(lender.addPools([ZERO_ADDRESS])).to.revertedWith('SaddleFinanceFlashLender: _pool address is zero address!');

        beforeLength = await lender.getPoolLength();
        await lender.addPools([ONE_ADDRESS]);
        afterLength = await lender.getPoolLength();
        await expect(beforeLength.add(1)).eq(afterLength);

        beforeLength = await lender.getPoolLength();
        await lender.addPools([ONE_ADDRESS]);
        afterLength = await lender.getPoolLength();
        await expect(beforeLength).eq(afterLength);

        //remove
        await expect(lender.connect(user).removePools([ONE_ADDRESS])).to.revertedWith('SaddleFinanceFlashLender: Not operator');

        beforeLength = await lender.getPoolLength();
        await lender.removePools([ONE_ADDRESS]);
        afterLength = await lender.getPoolLength();
        await expect(beforeLength.sub(1)).eq(afterLength);

        beforeLength = await lender.getPoolLength();
        await lender.removePools([ONE_ADDRESS]);
        afterLength = await lender.getPoolLength();
        await expect(beforeLength).eq(afterLength);

      });

    it('flash fee', async function () {
        await expect(lender.connect(user).flashFee(ZERO_ADDRESS, DAI.address, "1000")).to.revertedWith('SaddleFinanceFlashLender: Not flashloaner');
        poolsInfoLength = await lender.getPoolLength();
        let fee = await swapFlashLoan.flashLoanFeeBPS();
        let tempBal = await DAI.balanceOf(swapFlashLoan.address)
        let tempFee = tempBal.mul(fee).div(10000);
        expect(await lender.flashFee(swapFlashLoan.address, DAI.address, tempBal)).to.equal(tempFee);
    });

      it('flashLoan', async () => {
        await expect(lender.connect(user).flashLoan(ZERO_ADDRESS, borrower.address, DAI.address, "1000", "0x00000000000000000000000000000000000000000000000000000000000000")).to.revertedWith('SaddleFinanceFlashLender: Not flashloaner');
        [pools, maxloans, fees] = await lender.getFlashLoanInfoListWithCheaperFeePriority(DAI.address, 1);
        console.log("pools.length", pools.length);
        let count = 0;
        for (let i = 0; i < maxloans.length; i++) {
          tempBal = maxloans[i];
          await lender.setFlashLoaner(owner.address);
          console.log("pools", pools[i]);
          tempFee = await lender.flashFee(pools[i], DAI.address, tempBal);
          await lender.setFlashLoaner(borrower.address);
          await DAI.mint(borrower.address, tempFee);
          await borrower.connect(user).flashBorrow(pools[i], lender.address, DAI.address, tempBal, { gasLimit: 30000000 });
          const flashSender = await borrower.flashSender();
          expect(flashSender.toLowerCase()).to.equal(borrower.address.toLowerCase());
          const flashToken = await borrower.flashToken();
          expect(flashToken.toLowerCase()).to.equal(DAI.address.toLowerCase());
          const flashAmount = await borrower.flashAmount();
          expect(flashAmount).to.equal(tempBal);
          const flashFee = await borrower.flashFee();
          expect(flashFee).to.equal(tempFee);
          count++;
          if (count == 2) {
            break;
          }
        }
      });

      it('invalid case - flashLoan', async () => {
        [pools, maxloans, fees] = await lender.getFlashLoanInfoListWithCheaperFeePriority(DAI.address, 1);
        let count = 0;
        for (let i = 0; i < maxloans.length; i++) {
          tempBal = maxloans[i].add(1);
          await lender.setFlashLoaner(owner.address);
          tempFee = await lender.flashFee(pools[i], DAI.address, tempBal);
          await lender.setFlashLoaner(borrower.address);
          await DAI.mint(borrower.address, tempFee);
          await expect(borrower.connect(user).flashBorrow(pools[i], lender.address, DAI.address, tempBal, { gasLimit: 30000000 })).to.revertedWith('invalid amount');
          count++;
          if (count == 2) {
            break;
          }
        }
      });

      it('invalid case - flashLoan', async () => {
        [pools, maxloans, fees] = await lender.getFlashLoanInfoListWithCheaperFeePriority(DAI.address, 1);
        let count = 0;
        for (let i = 0; i < maxloans.length; i++) {
          tempBal = maxloans[i];
          await lender.setFlashLoaner(owner.address);
          tempFee = await lender.flashFee(pools[i], DAI.address, tempBal);
          await lender.setFlashLoaner(borrower.address);
          await DAI.mint(borrower.address, tempFee);
          expect(borrower.connect(user).flashBorrow(pools[i], lender.address, DAI.address, tempBal, { gasLimit: 30000000 })).to.revertedWith('SaddleFinanceFlashLender: Transfer failed');
          count++;
          if (count == 2) {
            break;
          }
        }
      });

    // it("Reverts when the borrower does not have enough to pay back", async () => {
    //     await expect(
    //         flashLoanExample.flashLoan(swapFlashLoan.address, USDC.address, 1e6, []),
    //     ).to.revertedWith("ERC20: transfer amount exceeds balance")
    // });

    // it("Reverts when flashloan debt is not paid", async () => {
    //     await expect(
    //         flashLoanExample.flashLoan(
    //             swapFlashLoan.address,
    //             USDC.address,
    //             1e6,
    //             solidityPack(["string"], ["dontRepayDebt"]),
    //         ),
    //     ).to.revertedWith("flashLoan fee is not met")
    // })
    // it("Reverts when calling re-entering swap contract via `addLiquidity`", async () => {
    //     await expect(
    //         flashLoanExample.flashLoan(
    //             swapFlashLoan.address,
    //             USDC.address,
    //             1e6,
    //             solidityPack(["string"], ["reentrancy_addLiquidity"]),
    //         ),
    //     ).to.be.revertedWith("ReentrancyGuard: reentrant call")
    // })

    // it("Reverts when calling re-entering swap contract via `swap`", async () => {
    //     await expect(
    //         flashLoanExample.flashLoan(
    //             swapFlashLoan.address,
    //             USDC.address,
    //             1e6,
    //             solidityPack(["string"], ["reentrancy_swap"]),
    //         ),
    //     ).to.be.revertedWith("ReentrancyGuard: reentrant call")
    // })

    // it("Reverts when calling re-entering swap contract via `removeLiquidity`", async () => {
    //     await expect(
    //         flashLoanExample.flashLoan(
    //             swapFlashLoan.address,
    //             USDC.address,
    //             1e6,
    //             solidityPack(["string"], ["reentrancy_removeLiquidity"]),
    //         ),
    //     ).to.be.revertedWith("ReentrancyGuard: reentrant call")
    // })

    // it("Reverts when calling re-entering swap contract via `removeLiquidityOneToken`", async () => {
    //     await expect(
    //         flashLoanExample.flashLoan(
    //             swapFlashLoan.address,
    //             USDC.address,
    //             1e6,
    //             solidityPack(["string"], ["reentrancy_removeLiquidityOneToken"]),
    //         ),
    //     ).to.be.revertedWith("ReentrancyGuard: reentrant call")
    // })

    // it("Succeeds when fee is paid off", async () => {
    //     const flashLoanAmount = BigNumber.from(1e6)
    //     const flashLoanFee = flashLoanAmount
    //         .mul(await swapFlashLoan.flashLoanFeeBPS())
    //         .div(10000)

    //     // Check the initial balance and the virtual price
    //     expect(await swapFlashLoan.getVirtualPrice()).to.eq("1000000000000000000")
    //     expect(await swapFlashLoan.getTokenBalance(1)).to.eq("50000000")

    //     // Since the contract is empty, we need to give the contract some USDC to have enough to pay off the fee
    //     await USDC.connect(user1).transfer(flashLoanExample.address, flashLoanFee)
    //     await expect(
    //         flashLoanExample.flashLoan(swapFlashLoan.address, USDC.address, 1e6, []),
    //     ).to.emit(swapFlashLoan, "FlashLoan")

    //     // Check the borrower contract paid off the balance
    //     expect(await swapFlashLoan.getVirtualPrice()).to.eq("1000024999981618719")
    //     expect(await swapFlashLoan.getTokenBalance(1)).to.eq("50005000")
    //     expect(await swapFlashLoan.getAdminBalance(1)).to.eq("5000")
    //     expect(await USDC.balanceOf(swapFlashLoan.address)).to.eq("50010000")

    //     // Try to do the flashloan again.
    //     await USDC.connect(user1).transfer(flashLoanExample.address, flashLoanFee)
    //     await expect(
    //         flashLoanExample.flashLoan(swapFlashLoan.address, USDC.address, 1e6, []),
    //     ).to.emit(swapFlashLoan, "FlashLoan")

    //     expect(await USDC.balanceOf(flashLoanExample.address)).to.eq(0)
    //     expect(await swapFlashLoan.getVirtualPrice()).to.eq("1000049999926479164")
    //     expect(await swapFlashLoan.getTokenBalance(1)).to.eq("50010000")
    //     expect(await swapFlashLoan.getAdminBalance(1)).to.eq("10000")
    //     expect(await USDC.balanceOf(swapFlashLoan.address)).to.eq("50020000")

    //     // Try to withdraw the protocol fees
    //     await swapFlashLoan.withdrawAdminFees()
    //     expect(await swapFlashLoan.getVirtualPrice()).to.eq("1000049999926479164")
    //     expect(await swapFlashLoan.getTokenBalance(1)).to.eq("50010000")
    //     expect(await swapFlashLoan.getAdminBalance(1)).to.eq("0")
    //     expect(await USDC.balanceOf(swapFlashLoan.address)).to.eq("50010000")
    // })

    // it("Reverts when called by non-owner", async () => {
    //     await expect(
    //         swapFlashLoan.connect(user1).setFlashLoanFees(100, 5000),
    //     ).to.be.revertedWith("Ownable: caller is not the owner")
    // })

    // it("Reverts when fees are not in the range", async () => {
    //     await expect(swapFlashLoan.setFlashLoanFees(0, 5000)).to.be.revertedWith(
    //         "fees are not in valid range",
    //     )
    //     await expect(
    //         swapFlashLoan.setFlashLoanFees(100000, 5000),
    //     ).to.be.revertedWith("fees are not in valid range")
    //     await expect(
    //         swapFlashLoan.setFlashLoanFees(100, 100000),
    //     ).to.be.revertedWith("fees are not in valid range")
    //     await expect(
    //         swapFlashLoan.setFlashLoanFees(100000, 100000),
    //     ).to.be.revertedWith("fees are not in valid range")
    // })

    // it("Succeeds when protocol fee bps is set to 0", async () => {
    //     // Realistic flashloan fee
    //     const newFlashLoanFeeBPS = 8
    //     const newProtocolFeeBPS = 0

    //     await swapFlashLoan.setFlashLoanFees(
    //         newFlashLoanFeeBPS,
    //         newProtocolFeeBPS,
    //     )
    //     expect(await swapFlashLoan.flashLoanFeeBPS()).to.eq(newFlashLoanFeeBPS)
    //     expect(await swapFlashLoan.protocolFeeShareBPS()).to.eq(newProtocolFeeBPS)

    //     const flashLoanAmount = BigNumber.from(1e6)
    //     const flashLoanFee = flashLoanAmount.mul(newFlashLoanFeeBPS).div(10000)

    //     // Check the initial balance and the virtual price
    //     expect(await swapFlashLoan.getVirtualPrice()).to.eq("1000000000000000000")
    //     expect(await swapFlashLoan.getTokenBalance(1)).to.eq("50000000")

    //     // Since the contract is empty, we need to give the contract some USDC to have enough to pay off the fee
    //     await USDC.connect(user1).transfer(flashLoanExample.address, flashLoanFee)
    //     await flashLoanExample.flashLoan(
    //         swapFlashLoan.address,
    //         USDC.address,
    //         1e6,
    //         [],
    //     )

    //     // Check the borrower contract paid off the balance
    //     expect(await USDC.balanceOf(flashLoanExample.address)).to.eq(0)
    //     expect(await swapFlashLoan.getVirtualPrice()).to.eq("1000003999999529416")
    //     expect(await swapFlashLoan.getTokenBalance(1)).to.eq("50000800")
    //     expect(await swapFlashLoan.getAdminBalance(1)).to.eq("0")
    //     expect(await USDC.balanceOf(swapFlashLoan.address)).to.eq("50000800")
    // })

    // it("Succeeds when fees are in the valid range", async () => {
    //     const newFlashLoanFeeBPS = 50
    //     const newProtocolFeeBPS = 100

    //     await swapFlashLoan.setFlashLoanFees(
    //         newFlashLoanFeeBPS,
    //         newProtocolFeeBPS,
    //     )
    //     expect(await swapFlashLoan.flashLoanFeeBPS()).to.eq(newFlashLoanFeeBPS)
    //     expect(await swapFlashLoan.protocolFeeShareBPS()).to.eq(newProtocolFeeBPS)

    //     const flashLoanAmount = BigNumber.from(1e6)
    //     const flashLoanFee = flashLoanAmount.mul(newFlashLoanFeeBPS).div(10000)

    //     // Check the initial balance and the virtual price
    //     expect(await swapFlashLoan.getVirtualPrice()).to.eq("1000000000000000000")
    //     expect(await swapFlashLoan.getTokenBalance(1)).to.eq("50000000")

    //     // Since the contract is empty, we need to give the contract some USDC to have enough to pay off the fee
    //     await USDC.connect(user1).transfer(flashLoanExample.address, flashLoanFee)
    //     await flashLoanExample.flashLoan(
    //         swapFlashLoan.address,
    //         USDC.address,
    //         1e6,
    //         [],
    //     )

    //     // Check the borrower contract paid off the balance
    //     expect(await USDC.balanceOf(flashLoanExample.address)).to.eq(0)
    //     expect(await swapFlashLoan.getVirtualPrice()).to.eq("1000024749981984496")
    //     expect(await swapFlashLoan.getTokenBalance(1)).to.eq("50004950")
    //     expect(await swapFlashLoan.getAdminBalance(1)).to.eq("50")
    //     expect(await USDC.balanceOf(swapFlashLoan.address)).to.eq("50005000")
    // })
});