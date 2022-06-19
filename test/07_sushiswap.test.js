const { expect } = require('chai');
const { ethers } = require('hardhat');
const { BigNumber } = require('ethers');

const {
    getBigNumber,
    createFixture,
    advanceTime,
} = require('./utilities')
// extreme volumes to explicitly test flashmint overflow vectors
const bigInt = require('big-integer')
const extremeValidVolume = bigInt(2).pow(127)
const bentoProtocolLimit = bigInt(2).pow(128).minus(1)
const computationalLimit = bigInt(2).pow(256).minus(1)

describe('Sushiswap flashloan', () => {
    let cmd, fixture

    before(async function () {
        fixture = await createFixture(deployments, this, async (cmd) => {
            await cmd.deploy('weth9', 'WETH9Mock')
            await cmd.deploy('bentoBox', 'BentoBoxMock', this.weth9.address)
            await cmd.deploy('lender', 'SushiSwapERC3156', this.bentoBox.address, this.carol.address)
            await cmd.deploy('borrower', 'FlashBorrowerSushi')

            await cmd.addToken('a', 'Token A', 'A', 18)
            // await cmd.addToken('b', 'Token B', 'B', 6, 'RevertingERC20Mock')
            // await cmd.addToken('c', 'Token C', 'C', 8, 'RevertingERC20Mock')

            await cmd.deploy('flashLoaner', 'FlashLoanerMock')
            await cmd.deploy('sneakyFlashLoaner', 'SneakyFlashLoanerMock')
            // await cmd.deploy('strategy', 'SimpleStrategyMock', this.bentoBox.address, this.a.address)

            // await this.bentoBox.setStrategy(this.a.address, this.strategy.address)
            // await advanceTime(1209600, ethers)
            // await this.bentoBox.setStrategy(this.a.address, this.strategy.address)
            // await this.bentoBox.setStrategyTargetPercentage(this.a.address, 20)

            // await cmd.deploy('erc20', 'ERC20Mockk', 10000000)
            // await cmd.deploy('masterContractMock', 'MasterContractMock', this.bentoBox.address)

            this.a.approve = function (...params) {
                console.log(params)
                this.a.approve(...params)
            }
            await this.a.connect(this.fred).approve(this.bentoBox.address, getBigNumber(100))
            await expect(
                this.bentoBox
                    .connect(this.fred)
                    .deposit(this.a.address, this.fred.address, this.fred.address, getBigNumber(100), 0)
            )
                .to.emit(this.a, 'Transfer')
                .withArgs(this.fred.address, this.bentoBox.address, getBigNumber(100))
                .to.emit(this.bentoBox, 'LogDeposit')
                .withArgs(this.a.address, this.fred.address, this.fred.address, getBigNumber(100), getBigNumber(100))

            // this.bentoBox.connect(this.fred).addProfit(this.a.address, getBigNumber(30))

            // await this.b.connect(this.fred).approve(this.bentoBox.address, getBigNumber(400, 6))
            // await expect(
            //     this.bentoBox
            //         .connect(this.fred)
            //         .deposit(this.b.address, this.fred.address, this.fred.address, getBigNumber(200, 6), 0)
            // )
            //     .to.emit(this.b, 'Transfer')
            //     .withArgs(this.fred.address, this.bentoBox.address, getBigNumber(200, 6))
            //     .to.emit(this.bentoBox, 'LogDeposit')
            //     .withArgs(this.b.address, this.fred.address, this.fred.address, getBigNumber(200, 6), getBigNumber(200, 6))

            // this.bentoBox.connect(this.fred).addProfit(this.b.address, getBigNumber(200, 6))

            // await this.bentoBox.harvest(this.a.address, true, 0)
        })
    })

    beforeEach(async function () {
        cmd = await fixture()
    })

    it("Revert if sender is not owner", async function () {
        await expect(this.lender.connect(this.fred).setFeeTo(this.fred.address)).to.revertedWith('Ownable: caller is not the owner');
    });

    it("Should update feeTo", async function () {
        await this.lender.setFeeTo(this.fred.address);
        expect(await this.lender.FEETO()).to.equal(this.fred.address);
    });

    it('flash supply', async function () {
        expect(await this.lender.maxFlashLoan(this.a.address)).to.equal(getBigNumber(100));
    });

    it('flash fee', async function () {
        expect(await this.lender.flashFee(this.a.address, getBigNumber(100))).to.equal(getBigNumber(100).mul(550).div(100000));
    });

    it('flash loan', async function () {
        let fee = await this.lender.flashFee(this.a.address, getBigNumber(100));

        const balanceBeforeFeeTo = await this.a.balanceOf(this.carol.address);

        await this.a.connect(this.bob).transfer(this.borrower.address, fee);
        expect(await this.a.balanceOf(this.borrower.address)).to.equal(fee);
        await this.borrower.connect(this.bob).flashBorrow(this.lender.address, this.a.address, getBigNumber(100));

        const balanceAfter = await this.a.balanceOf(this.dirk.address);
        expect(balanceAfter).to.equal(BigNumber.from('0'));
        const flashBalance = await this.borrower.flashBalance();
        expect(flashBalance).to.equal(getBigNumber(100).add(fee));
        const flashToken = await this.borrower.flashToken();
        expect(flashToken).to.equal(this.a.address);
        const flashAmount = await this.borrower.flashAmount();
        expect(flashAmount).to.equal(getBigNumber(100));
        const flashFee = await this.borrower.flashFee();
        expect(flashFee).to.equal(fee);
        const flashSender = await this.borrower.flashSender();
        expect(flashSender).to.equal(this.borrower.address);

        const balanceAfterFeeTo = await this.a.balanceOf(this.carol.address);
        expect(balanceAfterFeeTo.sub(balanceBeforeFeeTo)).to.equal(getBigNumber(100).mul(500).div(100000));

    });

    it('should revert on batch flashloan if not enough funds are available', async function () {
        const param = this.bentoBox.interface.encodeFunctionData('toShare', [this.a.address, 1, false])
        await expect(
            this.bentoBox.batchFlashLoan(
                this.flashLoaner.address,
                [this.flashLoaner.address],
                [this.a.address],
                [getBigNumber(1)],
                param
            )
        ).to.be.revertedWith('BoringERC20: Transfer failed')
    })

    it('should revert on flashloan if fee can not be paid', async function () {
        await this.a.transfer(this.bentoBox.address, getBigNumber(2))
        await this.a.approve(this.bentoBox.address, getBigNumber(2))
        await this.bentoBox.deposit(this.a.address, this.alice.address, this.alice.address, getBigNumber(1), 0)
        const param = this.bentoBox.interface.encodeFunctionData('toShare', [this.a.address, 1, false])
        await expect(
            this.bentoBox.batchFlashLoan(
                this.flashLoaner.address,
                [this.flashLoaner.address],
                [this.a.address],
                [getBigNumber(1)],
                param
            )
        ).to.be.revertedWith('BoringERC20: Transfer failed')
    })

    it('should revert on flashloan if amount is not paid back', async function () {
        await this.a.approve(this.bentoBox.address, getBigNumber(2))
        await this.bentoBox.deposit(this.a.address, this.alice.address, this.alice.address, getBigNumber(1), 0)
        const param = this.bentoBox.interface.encodeFunctionData('toShare', [this.a.address, 1, false])
        await expect(
            this.bentoBox.flashLoan(
                this.sneakyFlashLoaner.address,
                this.sneakyFlashLoaner.address,
                this.a.address,
                getBigNumber(1),
                param
            )
        ).to.be.revertedWith('BentoBox: Wrong amount')
    })

    it('should revert on batch flashloan if amount is not paid back', async function () {
        await this.a.approve(this.bentoBox.address, getBigNumber(2))
        await this.bentoBox.deposit(this.a.address, this.alice.address, this.alice.address, getBigNumber(1), 0)
        const param = this.bentoBox.interface.encodeFunctionData('toShare', [this.a.address, 1, false])
        await expect(
            this.bentoBox.batchFlashLoan(
                this.sneakyFlashLoaner.address,
                [this.sneakyFlashLoaner.address],
                [this.a.address],
                [getBigNumber(1)],
                param
            )
        ).to.be.revertedWith('BentoBox: Wrong amount')
    })

    it('should allow flashloan', async function () {
        await this.a.transfer(this.flashLoaner.address, getBigNumber(2))
        // const maxLoan = (await this.a.balanceOf(this.bentoBox.address)).div(2)
        const maxLoan = (await this.a.balanceOf(this.bentoBox.address)).div(2)
        await this.bentoBox.flashLoan(this.flashLoaner.address, this.flashLoaner.address, this.a.address, maxLoan, '0x')
        expect(await this.bentoBox.toAmount(this.a.address, getBigNumber(100), false)).to.be.equal(
            getBigNumber(100).add(maxLoan.mul(5).div(10000))
        )
    })

    it('revert on request to flashloan at bento protocol limit', async function () {
        await this.a.transfer(this.flashLoaner.address, getBigNumber(2))
        const maxLoan = bentoProtocolLimit.toString()
        await expect(
            this.bentoBox.flashLoan(this.flashLoaner.address, this.flashLoaner.address, this.a.address, maxLoan, '0x')
        ).to.be.revertedWith('BoringERC20: Transfer failed')
    })

    it('revert on request to flashloan at computational limit', async function () {
        await this.a.transfer(this.flashLoaner.address, getBigNumber(2))
        const maxLoan = computationalLimit.toString()
        await expect(
            this.bentoBox.flashLoan(this.flashLoaner.address, this.flashLoaner.address, this.a.address, maxLoan, '0x')
        ).to.be.revertedWith('BoringMath: Mul Overflow')
    })

    it('should allow flashloan with skimable amount on BentoBox', async function () {
        await this.a.transfer(this.flashLoaner.address, getBigNumber(2))
        await this.a.transfer(this.bentoBox.address, getBigNumber(20))
        const maxLoan = getBigNumber(130).div(2)
        await this.bentoBox.flashLoan(this.flashLoaner.address, this.flashLoaner.address, this.a.address, maxLoan, '0x')
        expect(await this.bentoBox.toAmount(this.a.address, getBigNumber(100), false)).to.be.equal(
            getBigNumber(100).add(maxLoan.mul(5).div(10000))
        )
    })

    it('should allow batch flashloan', async function () {
        await this.a.transfer(this.flashLoaner.address, getBigNumber(2))
        const maxLoan = (await this.a.balanceOf(this.bentoBox.address)).div(2)
        await this.bentoBox.batchFlashLoan(
            this.flashLoaner.address,
            [this.flashLoaner.address],
            [this.a.address],
            [maxLoan],
            '0x'
        )
        expect(await this.bentoBox.toAmount(this.a.address, getBigNumber(100), false)).to.be.equal(
            getBigNumber(100).add(maxLoan.mul(5).div(10000))
        )
    })

    it('revert on request to batch flashloan at bento protocol limit', async function () {
        await this.a.transfer(this.flashLoaner.address, getBigNumber(2))
        const maxLoan = bentoProtocolLimit.toString()
        await expect(
            this.bentoBox.batchFlashLoan(
                this.flashLoaner.address,
                [this.flashLoaner.address],
                [this.a.address],
                [maxLoan],
                '0x'
            )
        ).to.be.revertedWith('BoringERC20: Transfer failed')
    })

    it('revert on request to batch flashloan at computational limit', async function () {
        await this.a.transfer(this.flashLoaner.address, getBigNumber(2))
        const maxLoan = computationalLimit.toString()
        await expect(
            this.bentoBox.batchFlashLoan(
                this.flashLoaner.address,
                [this.flashLoaner.address],
                [this.a.address],
                [maxLoan],
                '0x'
            )
        ).to.be.revertedWith('BoringMath: Mul Overflow')
    })
});