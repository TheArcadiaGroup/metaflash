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

describe('Sushiswap', () => {
    let cmd, fixture

    before(async function () {
        fixture = await createFixture(deployments, this, async (cmd) => {
            await cmd.deploy('weth9', 'WETH9Mock')
            await cmd.deploy('bentoBox', 'BentoBoxMock', this.weth9.address)
            await cmd.deploy('lender', 'SushiSwapFlashLender', this.bentoBox.address)
            await cmd.deploy('borrower', 'SushiSwapFlashBorrower')

            await cmd.addToken('a', 'Token A', 'A', 18)

            await cmd.deploy('flashLoaner', 'FlashLoanerMock')
            await cmd.deploy('sneakyFlashLoaner', 'SneakyFlashLoanerMock')

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
        })
    })

    beforeEach(async function () {
        cmd = await fixture()
    })

    it('flash supply', async function () {
        expect(await this.lender.maxFlashLoan(this.a.address, 1)).to.equal(getBigNumber(100));
        expect(await this.lender.maxFlashLoanWithManyPairs_OR_ManyPools(this.a.address)).to.equal(getBigNumber(100));
    });

    it('flash fee', async function () {
        expect(await this.lender.flashFee(this.a.address, getBigNumber(100))).to.equal(getBigNumber(100).mul(50).div(100000));
        expect(await this.lender.flashFeeWithManyPairs_OR_ManyPools(this.a.address, getBigNumber(100))).to.equal(getBigNumber(100).mul(50).div(100000));
    });

    it('flashLoan', async function () {
        const maxloan = await this.lender.maxFlashLoan(this.a.address, 1);
        const fee = await this.lender.flashFee(this.a.address, maxloan);
        await this.a.transfer(this.borrower.address, fee);
        await this.borrower.connect(this.bob).flashBorrow(this.lender.address, this.a.address, maxloan);
        const totalFlashBalance = await this.borrower.totalFlashBalance();
        expect(totalFlashBalance).to.equal(maxloan.add(fee));
      });
    
      it('flashLoanWithManyPairs_OR_ManyPools', async function () {
        const maxloan = await this.lender.maxFlashLoanWithManyPairs_OR_ManyPools(this.a.address);
        const fee = await this.lender.flashFeeWithManyPairs_OR_ManyPools(this.a.address, maxloan);
        await this.a.transfer(this.borrower.address, fee);
        await this.borrower.connect(this.bob).flashBorrowWithManyPairs_OR_ManyPools(this.lender.address, this.a.address, maxloan);
        const totalFlashBalance = await this.borrower.totalFlashBalance();
        expect(totalFlashBalance).to.equal(maxloan.add(fee));
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