import chai, { expect } from 'chai'
import { Contract } from 'ethers'
import { AddressZero, Zero, MaxUint256 } from 'ethers/constants'
import { BigNumber, bigNumberify } from 'ethers/utils'
import { solidity, MockProvider, createFixtureLoader, loadFixture } from 'ethereum-waffle'
import { ecsign } from 'ethereumjs-util'

import {
  expandTo18Decimals,
  getApprovalDigest,
  getFewWrappedTokenApprovalDigest,
  mineBlock,
  MINIMUM_LIQUIDITY
} from './shared/utilities'
import { v2Fixture } from './shared/fixtures'

chai.use(solidity)

const overrides = {
  gasLimit: 9999999
}

enum RouterVersion {
  FewRouter = 'FewRouter'
}

describe('FewRouter{01,02}, FewRouter', () => {
  for (const routerVersion of Object.keys(RouterVersion)) {
    const provider = new MockProvider({
      hardfork: 'istanbul',
      mnemonic: 'horn horn horn horn horn horn horn horn horn horn horn horn',
      gasLimit: 9999999
    })
    const [wallet] = provider.getWallets()
    const loadFixture = createFixtureLoader(provider, [wallet])

    let token0: Contract
    let token1: Contract
    let tokenC: Contract
    let tokenD: Contract
    let fewWrappedToken0: Contract
    let fewWrappedToken1: Contract
    let WETH: Contract
    let fwWETH: Contract
    let WETHPartner: Contract
    let fewWrappedWETHPartner: Contract
    let factory: Contract
    let fewFactory: Contract
    let router: Contract
    let fewETHWrapper: Contract
    let pair: Contract
    let wrappedPair: Contract
    let WETHPair: Contract
    let wrappedWETHPair: Contract
    let routerEventEmitter: Contract
    let wrappedToken0OriginalToken: Contract
    let wrappedToken1OriginalToken: Contract
    beforeEach(async function() {
      const fixture = await loadFixture(v2Fixture)
      token0 = fixture.token0
      token1 = fixture.token1
      tokenC = fixture.tokenC
      tokenD = fixture.tokenD
      fewWrappedToken0 = fixture.fewWrappedToken0
      fewWrappedToken1 = fixture.fewWrappedToken1
      WETH = fixture.WETH
      fwWETH = fixture.fwWETH
      WETHPartner = fixture.WETHPartner
      fewWrappedWETHPartner = fixture.fewWrappedWETHPartner

      factory = fixture.factoryV2
      fewFactory = fixture.fewFactory
      router = {
        [RouterVersion.FewRouter]: fixture.fewRouter
      }[routerVersion as RouterVersion]
      fewETHWrapper = fixture.fewETHWrapper
      pair = fixture.pair
      wrappedPair = fixture.fewWrappedTokenABPair
      WETHPair = fixture.WETHPair
      wrappedWETHPair = fixture.fewWrappedWETHPair
      wrappedToken0OriginalToken = fixture.fewWrappedToken0OriginalToken
      wrappedToken1OriginalToken = fixture.fewWrappedToken1OriginalToken
      routerEventEmitter = fixture.routerEventEmitter
    })

    describe(routerVersion, () => {
      it('factory, WETH', async () => {
        expect(await router.factory()).to.eq(factory.address)
        expect(await router.fewFactory()).to.eq(fewFactory.address)
        expect(await router.WETH()).to.eq(WETH.address)
      })

      it('addLiquidity', async () => {
        const wrappedToken0Amount = expandTo18Decimals(1)
        const wrappedToken1Amount = expandTo18Decimals(4)

        const expectedLiquidity = expandTo18Decimals(2)

        await wrappedToken0OriginalToken.approve(router.address, MaxUint256)
        await wrappedToken1OriginalToken.approve(router.address, MaxUint256)
        await expect(
          router.addLiquidity(
            wrappedToken0OriginalToken.address,
            wrappedToken1OriginalToken.address,
            wrappedToken0Amount,
            wrappedToken1Amount,
            0,
            0,
            wallet.address,
            MaxUint256,
            overrides
          )
        )
          .to.emit(wrappedToken0OriginalToken, 'Transfer')
          .withArgs(wallet.address, router.address, wrappedToken0Amount)
          .to.emit(wrappedToken1OriginalToken, 'Transfer')
          .withArgs(wallet.address, router.address, wrappedToken1Amount)
          .to.emit(wrappedPair, 'Transfer')
          .withArgs(AddressZero, AddressZero, MINIMUM_LIQUIDITY)
          .to.emit(fewWrappedToken0, 'Wrap')
          .withArgs(router.address, wrappedToken0Amount, wrappedPair.address)
          .to.emit(fewWrappedToken1, 'Wrap')
          .withArgs(router.address, wrappedToken1Amount, wrappedPair.address)
          .to.emit(wrappedPair, 'Sync')
          .withArgs(wrappedToken0Amount, wrappedToken1Amount)
          .to.emit(wrappedPair, 'Mint')
          .withArgs(router.address, wrappedToken0Amount, wrappedToken1Amount)

        expect(await wrappedPair.balanceOf(wallet.address)).to.eq(expectedLiquidity.sub(MINIMUM_LIQUIDITY))
      })

      it('addLiquidityETH', async () => {
        const wrappedWETHPartnerAmount = expandTo18Decimals(1)
        const wrappedWETHAmount = expandTo18Decimals(4)

        const expectedLiquidity = expandTo18Decimals(2)
        const wrappedWETHPairToken0 = await wrappedWETHPair.token0()
        await WETHPartner.approve(router.address, MaxUint256)
        await expect(
          router.addLiquidityETH(
            WETHPartner.address,
            wrappedWETHPartnerAmount,
            wrappedWETHPartnerAmount,
            wrappedWETHAmount,
            wallet.address,
            MaxUint256,
            { ...overrides, value: wrappedWETHAmount }
          )
        )
          .to.emit(wrappedWETHPair, 'Transfer')
          .withArgs(AddressZero, AddressZero, MINIMUM_LIQUIDITY)
          .to.emit(wrappedWETHPair, 'Transfer')
          .withArgs(AddressZero, wallet.address, expectedLiquidity.sub(MINIMUM_LIQUIDITY))
          .to.emit(wrappedWETHPair, 'Sync')
          .withArgs(
            wrappedWETHPairToken0 === fewWrappedWETHPartner.address ? wrappedWETHPartnerAmount : wrappedWETHAmount,
            wrappedWETHPairToken0 === fewWrappedWETHPartner.address ? wrappedWETHAmount : wrappedWETHPartnerAmount
          )
          .to.emit(wrappedWETHPair, 'Mint')
          .withArgs(
            router.address,
            wrappedWETHPairToken0 === fewWrappedWETHPartner.address ? wrappedWETHPartnerAmount : wrappedWETHAmount,
            wrappedWETHPairToken0 === fewWrappedWETHPartner.address ? wrappedWETHAmount : wrappedWETHPartnerAmount
          )

        expect(await wrappedWETHPair.balanceOf(wallet.address)).to.eq(expectedLiquidity.sub(MINIMUM_LIQUIDITY))
      })

      it('few gas 1', async () => {
        const token0Amount = expandTo18Decimals(1)
        const token1Amount = expandTo18Decimals(4)

        await tokenC.approve(router.address, MaxUint256)
        await tokenD.approve(router.address, MaxUint256)

        const tx = await router.addLiquidity(
          tokenC.address,
          tokenD.address,
          token0Amount,
          token1Amount,
          0,
          0,
          wallet.address,
          MaxUint256,
          overrides
        )
        const receipt = await tx.wait()
        expect(receipt.gasUsed).to.eq(
          {
            [RouterVersion.FewRouter]: 6049377
          }[routerVersion as RouterVersion]
        )
      }).retries(3)

      it('few gas 2', async () => {
        const token0Amount = expandTo18Decimals(1)
        const token1Amount = expandTo18Decimals(4)

        await token0.approve(router.address, MaxUint256)
        await token1.approve(router.address, MaxUint256)

        const tx = await router.addLiquidity(
          token0.address,
          token1.address,
          token0Amount,
          token1Amount,
          0,
          0,
          wallet.address,
          MaxUint256,
          overrides
        )
        const receipt = await tx.wait()
        expect(receipt.gasUsed).to.eq(
          {
            [RouterVersion.FewRouter]: 352583
          }[routerVersion as RouterVersion]
        )
      }).retries(3)

      async function addLiquidity(wrappedToken0Amount: BigNumber, wrappedToken1Amount: BigNumber) {
        await wrappedToken0OriginalToken.approve(fewWrappedToken0.address, wrappedToken0Amount, overrides)
        await wrappedToken1OriginalToken.approve(fewWrappedToken1.address, wrappedToken1Amount, overrides)

        await fewWrappedToken0.wrap(wrappedToken0Amount, overrides)
        await fewWrappedToken1.wrap(wrappedToken1Amount, overrides)

        await fewWrappedToken0.transfer(wrappedPair.address, wrappedToken0Amount)
        await fewWrappedToken1.transfer(wrappedPair.address, wrappedToken1Amount)

        await fewWrappedToken0.approve(wrappedPair.address, MaxUint256)
        await fewWrappedToken1.approve(wrappedPair.address, MaxUint256)

        await wrappedPair.mint(wallet.address, overrides)
      }

      it('removeLiquidity', async () => {
        const wrappedToken0Amount = expandTo18Decimals(1)
        const wrappedToken1Amount = expandTo18Decimals(4)

        await addLiquidity(wrappedToken0Amount, wrappedToken1Amount)

        const expectedLiquidity = expandTo18Decimals(2)
        await wrappedPair.approve(router.address, MaxUint256)

        await expect(
          router.removeLiquidity(
            fewWrappedToken0.address,
            fewWrappedToken1.address,
            expectedLiquidity.sub(MINIMUM_LIQUIDITY),
            0,
            0,
            wallet.address,
            MaxUint256,
            overrides
          )
        )
          .to.emit(wrappedPair, 'Transfer')
          .withArgs(wallet.address, wrappedPair.address, expectedLiquidity.sub(MINIMUM_LIQUIDITY))
          .to.emit(wrappedPair, 'Transfer')
          .withArgs(wrappedPair.address, AddressZero, expectedLiquidity.sub(MINIMUM_LIQUIDITY))
          .to.emit(fewWrappedToken0, 'Transfer')
          .withArgs(wrappedPair.address, router.address, wrappedToken0Amount.sub(500))
          .to.emit(fewWrappedToken1, 'Transfer')
          .withArgs(wrappedPair.address, router.address, wrappedToken1Amount.sub(2000))
          .to.emit(wrappedPair, 'Sync')
          .withArgs(500, 2000)
          .to.emit(wrappedPair, 'Burn')
          .withArgs(router.address, wrappedToken0Amount.sub(500), wrappedToken1Amount.sub(2000), router.address)

        expect(await wrappedPair.balanceOf(wallet.address)).to.eq(0)
        const totalSupplyToken0 = await fewWrappedToken0.totalSupply()
        const totalSupplyToken1 = await fewWrappedToken1.totalSupply()
        expect(await fewWrappedToken0.balanceOf(wallet.address)).to.eq(totalSupplyToken0.sub(500))
        expect(await fewWrappedToken1.balanceOf(wallet.address)).to.eq(totalSupplyToken1.sub(2000))
      })

      async function addLiquidityWrappedETH(wrappedWETHPartnerAmount: BigNumber, wrappedWETHAmount: BigNumber) {
        await WETHPartner.approve(fewWrappedWETHPartner.address, wrappedWETHPartnerAmount, overrides)

        await WETH.deposit({ value: wrappedWETHAmount })
        await WETH.approve(fwWETH.address, wrappedWETHAmount, overrides)

        await fewWrappedWETHPartner.wrap(wrappedWETHPartnerAmount, overrides)
        await fwWETH.wrap(wrappedWETHAmount, overrides)

        await fewWrappedWETHPartner.transfer(wrappedWETHPair.address, wrappedWETHPartnerAmount)
        await fwWETH.transfer(wrappedWETHPair.address, wrappedWETHAmount)

        await fewWrappedWETHPartner.approve(wrappedWETHPair.address, MaxUint256)
        await fwWETH.approve(wrappedWETHPair.address, MaxUint256)

        await wrappedWETHPair.mint(wallet.address, overrides)
        await wrappedWETHPair.approve(router.address, MaxUint256, overrides)
      }

      it('removeLiquidityETH', async () => {
        const wrappedWETHPartnerAmount = expandTo18Decimals(1)
        const wrappedWETHAmount = expandTo18Decimals(4)

        await addLiquidityWrappedETH(wrappedWETHPartnerAmount, wrappedWETHAmount)
        const expectedLiquidity = expandTo18Decimals(2)
        const wrappedWETHPairToken0 = await wrappedWETHPair.token0()

        await wrappedWETHPair.approve(router.address, MaxUint256, overrides)
        await expect(
          router.removeLiquidityETH(
            fewWrappedWETHPartner.address,
            expectedLiquidity.sub(MINIMUM_LIQUIDITY),
            0,
            0,
            wallet.address,
            MaxUint256,
            overrides
          )
        )
          .to.emit(wrappedWETHPair, 'Transfer')
          .withArgs(wallet.address, wrappedWETHPair.address, expectedLiquidity.sub(MINIMUM_LIQUIDITY))
          .to.emit(wrappedWETHPair, 'Transfer')
          .withArgs(wrappedWETHPair.address, AddressZero, expectedLiquidity.sub(MINIMUM_LIQUIDITY))
          .to.emit(fwWETH, 'Transfer')
          .withArgs(wrappedWETHPair.address, router.address, wrappedWETHAmount.sub(2000))
          .to.emit(fewWrappedWETHPartner, 'Transfer')
          .withArgs(wrappedWETHPair.address, router.address, wrappedWETHPartnerAmount.sub(500))
          .to.emit(wrappedWETHPair, 'Sync')
          .withArgs(
            wrappedWETHPairToken0 === fewWrappedWETHPartner.address ? 500 : 2000,
            wrappedWETHPairToken0 === fewWrappedWETHPartner.address ? 2000 : 500
          )
          .to.emit(wrappedWETHPair, 'Burn')
          .withArgs(
            router.address,
            wrappedWETHPairToken0 === fewWrappedWETHPartner.address
              ? wrappedWETHPartnerAmount.sub(500)
              : wrappedWETHAmount.sub(2000),
            wrappedWETHPairToken0 === fewWrappedWETHPartner.address
              ? wrappedWETHAmount.sub(2000)
              : wrappedWETHPartnerAmount.sub(500),
            router.address
          )

        expect(await wrappedWETHPair.balanceOf(wallet.address)).to.eq(0)
        const totalSupplyfwWETHPartner = await fewWrappedWETHPartner.totalSupply()
        const totalSupplyfwWETH = await fwWETH.totalSupply()
        expect(await fewWrappedWETHPartner.balanceOf(wallet.address)).to.eq(totalSupplyfwWETHPartner.sub(500))
        expect(await fwWETH.balanceOf(wallet.address)).to.eq(totalSupplyfwWETH.sub(2000))
      })

      it('removeLiquidityWithPermit', async () => {
        const wrappedToken0Amount = expandTo18Decimals(1)
        const wrappedToken1Amount = expandTo18Decimals(4)
        await addLiquidity(wrappedToken0Amount, wrappedToken1Amount)

        const expectedLiquidity = expandTo18Decimals(2)

        const nonce = await wrappedPair.nonces(wallet.address)
        const digest = await getApprovalDigest(
          wrappedPair,
          { owner: wallet.address, spender: router.address, value: expectedLiquidity.sub(MINIMUM_LIQUIDITY) },
          nonce,
          MaxUint256
        )

        const { v, r, s } = ecsign(Buffer.from(digest.slice(2), 'hex'), Buffer.from(wallet.privateKey.slice(2), 'hex'))

        await router.removeLiquidityWithPermit(
          fewWrappedToken0.address,
          fewWrappedToken1.address,
          expectedLiquidity.sub(MINIMUM_LIQUIDITY),
          0,
          0,
          wallet.address,
          MaxUint256,
          false,
          v,
          r,
          s,
          overrides
        )
      })

      it('removeLiquidityETHWithPermit', async () => {
        const wrappedWETHPartnerAmount = expandTo18Decimals(1)
        const wrappedWETHAmount = expandTo18Decimals(4)

        await addLiquidityWrappedETH(wrappedWETHPartnerAmount, wrappedWETHAmount)

        const expectedLiquidity = expandTo18Decimals(2)

        const nonce = await wrappedWETHPair.nonces(wallet.address)
        const digest = await getApprovalDigest(
          wrappedWETHPair,
          { owner: wallet.address, spender: router.address, value: expectedLiquidity.sub(MINIMUM_LIQUIDITY) },
          nonce,
          MaxUint256
        )

        const { v, r, s } = ecsign(Buffer.from(digest.slice(2), 'hex'), Buffer.from(wallet.privateKey.slice(2), 'hex'))

        await router.removeLiquidityETHWithPermit(
          fewWrappedWETHPartner.address,
          expectedLiquidity.sub(MINIMUM_LIQUIDITY),
          0,
          0,
          wallet.address,
          MaxUint256,
          false,
          v,
          r,
          s,
          overrides
        )
      })

      describe('swapExactTokensForTokens', () => {
        const wrappedToken0Amount = expandTo18Decimals(5)
        const wrappedToken1Amount = expandTo18Decimals(10)
        const swapAmount = expandTo18Decimals(1)
        const expectedOutputAmount = bigNumberify('1662497915624478906')

        beforeEach(async () => {
          await addLiquidity(wrappedToken0Amount, wrappedToken1Amount)
          await wrappedToken0OriginalToken.approve(router.address, MaxUint256)
        })

        it('happy path', async () => {
          await expect(
            router.swapExactTokensForTokens(
              swapAmount,
              0,
              [fewWrappedToken0.address, fewWrappedToken1.address],
              wallet.address,
              MaxUint256,
              overrides
            )
          )
            .to.emit(fewWrappedToken0, 'Transfer')
            .withArgs(AddressZero, wrappedPair.address, swapAmount)
            .to.emit(fewWrappedToken1, 'Transfer')
            .withArgs(wrappedPair.address, router.address, expectedOutputAmount)
            .to.emit(wrappedPair, 'Sync')
            .withArgs(wrappedToken0Amount.add(swapAmount), wrappedToken1Amount.sub(expectedOutputAmount))
            .to.emit(wrappedPair, 'Swap')
            .withArgs(router.address, swapAmount, 0, 0, expectedOutputAmount, router.address)
        })

        it('amounts', async () => {
          await wrappedToken0OriginalToken.approve(routerEventEmitter.address, MaxUint256)
          await expect(
            routerEventEmitter.swapExactTokensForTokens(
              router.address,
              swapAmount,
              0,
              [fewWrappedToken0.address, fewWrappedToken1.address],
              wallet.address,
              MaxUint256,
              overrides
            )
          )
            .to.emit(routerEventEmitter, 'Amounts')
            .withArgs([swapAmount, expectedOutputAmount])
        })

        it('gas', async () => {
          // ensure that setting price{0,1}CumulativeLast for the first time doesn't affect our gas math
          await mineBlock(provider, (await provider.getBlock('latest')).timestamp + 1)
          await wrappedPair.sync(overrides)

          await fewWrappedToken0.approve(router.address, MaxUint256)

          await mineBlock(provider, (await provider.getBlock('latest')).timestamp + 1)
          const tx = await router.swapExactTokensForTokens(
            swapAmount,
            0,
            [fewWrappedToken0.address, fewWrappedToken1.address],
            wallet.address,
            MaxUint256,
            overrides
          )
          const receipt = await tx.wait()
          expect(receipt.gasUsed).to.eq(
            {
              [RouterVersion.FewRouter]: 164514
            }[routerVersion as RouterVersion]
          )
        }).retries(3)
      })

      describe('swapTokensForExactTokens', () => {
        const wrappedToken0Amount = expandTo18Decimals(5)
        const wrappedToken1Amount = expandTo18Decimals(10)
        const expectedSwapAmount = bigNumberify('557227237267357629')
        const outputAmount = expandTo18Decimals(1)

        beforeEach(async () => {
          await addLiquidity(wrappedToken0Amount, wrappedToken1Amount)
        })

        it('happy path', async () => {
          await wrappedToken0OriginalToken.approve(router.address, MaxUint256)
          await expect(
            router.swapTokensForExactTokens(
              outputAmount,
              MaxUint256,
              [fewWrappedToken0.address, fewWrappedToken1.address],
              wallet.address,
              MaxUint256,
              overrides
            )
          )
            .to.emit(fewWrappedToken0, 'Transfer')
            .withArgs(AddressZero, wrappedPair.address, expectedSwapAmount)
            .to.emit(fewWrappedToken1, 'Transfer')
            .withArgs(wrappedPair.address, router.address, outputAmount)
            .to.emit(wrappedPair, 'Sync')
            .withArgs(wrappedToken0Amount.add(expectedSwapAmount), wrappedToken1Amount.sub(outputAmount))
            .to.emit(wrappedPair, 'Swap')
            .withArgs(router.address, expectedSwapAmount, 0, 0, outputAmount, router.address)
        })

        it('amounts', async () => {
          await wrappedToken0OriginalToken.approve(routerEventEmitter.address, MaxUint256)
          await expect(
            routerEventEmitter.swapTokensForExactTokens(
              router.address,
              outputAmount,
              MaxUint256,
              [fewWrappedToken0.address, fewWrappedToken1.address],
              wallet.address,
              MaxUint256,
              overrides
            )
          )
            .to.emit(routerEventEmitter, 'Amounts')
            .withArgs([expectedSwapAmount, outputAmount])
        })
      })

      describe('swapExactETHForTokens', () => {
        const wrappedWETHPartnerAmount = expandTo18Decimals(10)
        const wrappedWETHAmount = expandTo18Decimals(5)
        const swapAmount = expandTo18Decimals(1)
        const expectedOutputAmount = bigNumberify('1662497915624478906')

        beforeEach(async () => {
          await addLiquidityWrappedETH(wrappedWETHPartnerAmount, wrappedWETHAmount)
        })

        it('happy path', async () => {
          const wrappedWETHPairToken0 = await wrappedWETHPair.token0()
          await expect(
            router.swapExactETHForTokens(
              0,
              [fwWETH.address, fewWrappedWETHPartner.address],
              wallet.address,
              MaxUint256,
              {
                ...overrides,
                value: swapAmount
              }
            )
          )
            .to.emit(fwWETH, 'Transfer')
            .withArgs(AddressZero, wrappedWETHPair.address, swapAmount)
            .to.emit(fewWrappedWETHPartner, 'Transfer')
            .withArgs(wrappedWETHPair.address, router.address, expectedOutputAmount)
            .to.emit(wrappedWETHPair, 'Sync')
            .withArgs(
              wrappedWETHPairToken0 === fewWrappedWETHPartner.address
                ? wrappedWETHPartnerAmount.sub(expectedOutputAmount)
                : wrappedWETHAmount.add(swapAmount),
              wrappedWETHPairToken0 === fewWrappedWETHPartner.address
                ? wrappedWETHAmount.add(swapAmount)
                : wrappedWETHPartnerAmount.sub(expectedOutputAmount)
            )
            .to.emit(wrappedWETHPair, 'Swap')
            .withArgs(
              router.address,
              wrappedWETHPairToken0 === fewWrappedWETHPartner.address ? 0 : swapAmount,
              wrappedWETHPairToken0 === fewWrappedWETHPartner.address ? swapAmount : 0,
              wrappedWETHPairToken0 === fewWrappedWETHPartner.address ? expectedOutputAmount : 0,
              wrappedWETHPairToken0 === fewWrappedWETHPartner.address ? 0 : expectedOutputAmount,
              router.address
            )
        })

        it('amounts', async () => {
          await expect(
            routerEventEmitter.swapExactETHForTokens(
              router.address,
              0,
              [fwWETH.address, fewWrappedWETHPartner.address],
              wallet.address,
              MaxUint256,
              {
                ...overrides,
                value: swapAmount
              }
            )
          )
            .to.emit(routerEventEmitter, 'Amounts')
            .withArgs([swapAmount, expectedOutputAmount])
        })

        it('gas', async () => {
          const wrappedWETHPartnerAmount = expandTo18Decimals(10)
          const wrappedWETHAmount = expandTo18Decimals(5)
          await addLiquidityWrappedETH(wrappedWETHPartnerAmount, wrappedWETHAmount)

          // ensure that setting price{0,1}CumulativeLast for the first time doesn't affect our gas math
          await mineBlock(provider, (await provider.getBlock('latest')).timestamp + 1)
          await wrappedPair.sync(overrides)

          const swapAmount = expandTo18Decimals(1)
          await mineBlock(provider, (await provider.getBlock('latest')).timestamp + 1)
          const tx = await router.swapExactETHForTokens(
            0,
            [fwWETH.address, fewWrappedWETHPartner.address],
            wallet.address,
            MaxUint256,
            {
              ...overrides,
              value: swapAmount
            }
          )
          const receipt = await tx.wait()
          expect(receipt.gasUsed).to.eq(
            {
              [RouterVersion.FewRouter]: 191772
            }[routerVersion as RouterVersion]
          )
        }).retries(3)
      })

      describe('swapTokensForExactETH', () => {
        const wrappedWETHPartnerAmount = expandTo18Decimals(5)
        const wrappedWETHAmount = expandTo18Decimals(10)
        const expectedSwapAmount = bigNumberify('557227237267357629')
        const outputAmount = expandTo18Decimals(1)

        beforeEach(async () => {
          await addLiquidityWrappedETH(wrappedWETHPartnerAmount, wrappedWETHAmount)
        })

        it('happy path', async () => {
          await WETHPartner.approve(router.address, MaxUint256)
          const wrappedWETHPairToken0 = await wrappedWETHPair.token0()

          await expect(
            router.swapTokensForExactETH(
              outputAmount,
              MaxUint256,
              [fewWrappedWETHPartner.address, fwWETH.address],
              wallet.address,
              MaxUint256,
              overrides
            )
          )
            .to.emit(fewWrappedWETHPartner, 'Transfer')
            .withArgs(AddressZero, wrappedWETHPair.address, expectedSwapAmount)
            .to.emit(fwWETH, 'Transfer')
            .withArgs(wrappedWETHPair.address, router.address, outputAmount)
            .to.emit(wrappedWETHPair, 'Sync')
            .withArgs(
              wrappedWETHPairToken0 === fewWrappedWETHPartner.address
                ? wrappedWETHPartnerAmount.add(expectedSwapAmount)
                : wrappedWETHAmount.sub(outputAmount),
              wrappedWETHPairToken0 === fewWrappedWETHPartner.address
                ? wrappedWETHAmount.sub(outputAmount)
                : wrappedWETHPartnerAmount.add(expectedSwapAmount)
            )
            .to.emit(wrappedWETHPair, 'Swap')
            .withArgs(
              router.address,
              wrappedWETHPairToken0 === fewWrappedWETHPartner.address ? expectedSwapAmount : 0,
              wrappedWETHPairToken0 === fewWrappedWETHPartner.address ? 0 : expectedSwapAmount,
              wrappedWETHPairToken0 === fewWrappedWETHPartner.address ? 0 : outputAmount,
              wrappedWETHPairToken0 === fewWrappedWETHPartner.address ? outputAmount : 0,
              router.address
            )
        })

        it('amounts', async () => {
          await WETHPartner.approve(routerEventEmitter.address, MaxUint256)
          await expect(
            routerEventEmitter.swapTokensForExactETH(
              router.address,
              outputAmount,
              MaxUint256,
              [fewWrappedWETHPartner.address, fwWETH.address],
              wallet.address,
              MaxUint256,
              overrides
            )
          )
            .to.emit(routerEventEmitter, 'Amounts')
            .withArgs([expectedSwapAmount, outputAmount])
        })
      })

      async function addLiquidityETH(ETHAmount: BigNumber) {
        await WETH.deposit({ value: ETHAmount })
      }

      it('wrapETHToFWWETH', async () => {
        const wethAmount = expandTo18Decimals(5)
        await addLiquidityETH(wethAmount)
        await expect(fewETHWrapper.wrapETHToFWWETH(wallet.address, { ...overrides, value: wethAmount }))
          .to.emit(WETH, 'Transfer')
          .withArgs(fewETHWrapper.address, fwWETH.address, wethAmount)
          .to.emit(fwWETH, 'Transfer')
          .withArgs(AddressZero, wallet.address, wethAmount)
          .to.emit(fwWETH, 'Wrap')
          .withArgs(fewETHWrapper.address, wethAmount, wallet.address)

        expect(await fwWETH.totalSupply()).to.eq(wethAmount)
        expect(await fwWETH.balanceOf(wallet.address)).to.eq(wethAmount)
      })

      it('unwrapFWWETHToETH', async () => {
        const wethAmount = expandTo18Decimals(5)
        await addLiquidityETH(wethAmount)
        await fewETHWrapper.wrapETHToFWWETH(wallet.address, { ...overrides, value: wethAmount })
        await fwWETH.approve(fewETHWrapper.address, MaxUint256)

        await expect(fewETHWrapper.unwrapFWWETHToETH(wethAmount, wallet.address))
          .to.emit(fwWETH, 'Transfer')
          .withArgs(wallet.address, fewETHWrapper.address, wethAmount)
          .to.emit(WETH, 'Transfer')
          .withArgs(fwWETH.address, fewETHWrapper.address, wethAmount)
          .to.emit(fwWETH, 'Unwrap')
          .withArgs(fewETHWrapper.address, wethAmount, fewETHWrapper.address)

        expect(await fwWETH.balanceOf(wallet.address)).to.eq(0)
        expect(await fwWETH.totalSupply()).to.eq(0)
        expect(await fwWETH.balanceOf(fewETHWrapper.address)).to.eq(0)
      })

      describe('swapExactTokensForETH', () => {
        const wrappedWETHPartnerAmount = expandTo18Decimals(5)
        const wrappedWETHAmount = expandTo18Decimals(10)
        const swapAmount = expandTo18Decimals(1)
        const expectedOutputAmount = bigNumberify('1662497915624478906')

        beforeEach(async () => {
          await addLiquidityWrappedETH(wrappedWETHPartnerAmount, wrappedWETHAmount)
        })

        it('happy path', async () => {
          await WETHPartner.approve(router.address, MaxUint256)
          await fewWrappedWETHPartner.approve(router.address, MaxUint256)

          const wrappedWETHPairToken0 = await wrappedWETHPair.token0()

          await expect(
            router.swapExactTokensForETH(
              swapAmount,
              0,
              [fewWrappedWETHPartner.address, fwWETH.address],
              wallet.address,
              MaxUint256,
              overrides
            )
          )
            .to.emit(fewWrappedWETHPartner, 'Transfer')
            .withArgs(AddressZero, wrappedWETHPair.address, swapAmount)
            .to.emit(fwWETH, 'Transfer')
            .withArgs(wrappedWETHPair.address, router.address, expectedOutputAmount)
            .to.emit(wrappedWETHPair, 'Sync')
            .withArgs(
              wrappedWETHPairToken0 === fewWrappedWETHPartner.address
                ? wrappedWETHPartnerAmount.add(swapAmount)
                : wrappedWETHAmount.sub(expectedOutputAmount),
              wrappedWETHPairToken0 === fewWrappedWETHPartner.address
                ? wrappedWETHAmount.sub(expectedOutputAmount)
                : wrappedWETHPartnerAmount.add(swapAmount)
            )
            .to.emit(wrappedWETHPair, 'Swap')
            .withArgs(
              router.address,
              wrappedWETHPairToken0 === fewWrappedWETHPartner.address ? swapAmount : 0,
              wrappedWETHPairToken0 === fewWrappedWETHPartner.address ? 0 : swapAmount,
              wrappedWETHPairToken0 === fewWrappedWETHPartner.address ? 0 : expectedOutputAmount,
              wrappedWETHPairToken0 === fewWrappedWETHPartner.address ? expectedOutputAmount : 0,
              router.address
            )
        })

        it('amounts', async () => {
          await WETHPartner.approve(routerEventEmitter.address, MaxUint256)
          await expect(
            routerEventEmitter.swapExactTokensForETH(
              router.address,
              swapAmount,
              0,
              [fewWrappedWETHPartner.address, fwWETH.address],
              wallet.address,
              MaxUint256,
              overrides
            )
          )
            .to.emit(routerEventEmitter, 'Amounts')
            .withArgs([swapAmount, expectedOutputAmount])
        })
      })

      describe('swapETHForExactTokens', () => {
        const wrappedWETHPartnerAmount = expandTo18Decimals(10)
        const wrappedWETHAmount = expandTo18Decimals(5)
        const expectedSwapAmount = bigNumberify('557227237267357629')
        const outputAmount = expandTo18Decimals(1)

        beforeEach(async () => {
          await addLiquidityWrappedETH(wrappedWETHPartnerAmount, wrappedWETHAmount)
        })

        it('happy path', async () => {
          const wrappedWETHPairToken0 = await wrappedWETHPair.token0()

          await expect(
            router.swapETHForExactTokens(
              outputAmount,
              [fwWETH.address, fewWrappedWETHPartner.address],
              wallet.address,
              MaxUint256,
              {
                ...overrides,
                value: expectedSwapAmount
              }
            )
          )
            .to.emit(fwWETH, 'Transfer')
            .withArgs(AddressZero, wrappedWETHPair.address, expectedSwapAmount)
            .to.emit(fewWrappedWETHPartner, 'Transfer')
            .withArgs(wrappedWETHPair.address, router.address, outputAmount)
            .to.emit(wrappedWETHPair, 'Sync')
            .withArgs(
              wrappedWETHPairToken0 === fewWrappedWETHPartner.address
                ? wrappedWETHPartnerAmount.sub(outputAmount)
                : wrappedWETHAmount.add(expectedSwapAmount),
              wrappedWETHPairToken0 === fewWrappedWETHPartner.address
                ? wrappedWETHAmount.add(expectedSwapAmount)
                : wrappedWETHPartnerAmount.sub(outputAmount)
            )
            .to.emit(wrappedWETHPair, 'Swap')
            .withArgs(
              router.address,
              wrappedWETHPairToken0 === fewWrappedWETHPartner.address ? 0 : expectedSwapAmount,
              wrappedWETHPairToken0 === fewWrappedWETHPartner.address ? expectedSwapAmount : 0,
              wrappedWETHPairToken0 === fewWrappedWETHPartner.address ? outputAmount : 0,
              wrappedWETHPairToken0 === fewWrappedWETHPartner.address ? 0 : outputAmount,
              router.address
            )
        })

        it('amounts', async () => {
          await expect(
            routerEventEmitter.swapETHForExactTokens(
              router.address,
              outputAmount,
              [fwWETH.address, fewWrappedWETHPartner.address],
              wallet.address,
              MaxUint256,
              {
                ...overrides,
                value: expectedSwapAmount
              }
            )
          )
            .to.emit(routerEventEmitter, 'Amounts')
            .withArgs([expectedSwapAmount, outputAmount])
        })
      })
    })
  }
})
