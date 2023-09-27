import chai, { expect } from 'chai'
import { Contract } from 'ethers'
import { AddressZero, MaxUint256 } from 'ethers/constants'
import { BigNumber } from 'ethers/utils'
import { solidity, MockProvider, createFixtureLoader, deployContract } from 'ethereum-waffle'
import { ecsign } from 'ethereumjs-util'

import { expandTo18Decimals, getApprovalDigest, getFewWrappedTokenApprovalDigest, mineBlock, MINIMUM_LIQUIDITY } from './shared/utilities'
import { v2Fixture } from './shared/fixtures'

chai.use(solidity)

const overrides = {
  gasLimit: 9999999
}

enum RouterVersion {
  fewV2Router = 'fewV2Router'
}

describe('FewV2Router{01,02}, FewV1Router', () => {
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
    let fewWrappedTokenB: Contract
    let fewWrappedDTT: Contract
    let fewWrappedDTTPairDTT: Contract
    let fewWrappedDTTPairOriginalToken1: Contract
    let WETH: Contract
    let fwWETH: Contract
    let WETHPartner: Contract
    let fewWrappedWETHPartner: Contract
    let wrappedWETHDTTPair: Contract
    let factory: Contract
    let fewFactory: Contract
    let router: Contract
    let DTT: Contract
    let fewWrappedDTTPair: Contract
    beforeEach(async function() {
      const fixture = await loadFixture(v2Fixture)
      token0 = fixture.token0
      token1 = fixture.token1
      DTT = fixture.DTT
      fewWrappedTokenB = fixture.fewWrappedTokenB
      fewWrappedDTT = fixture.fewWrappedDTT
      fewWrappedDTTPairDTT = fixture.fewWrappedDTTPairDTT
      fewWrappedDTTPairOriginalToken1 = fixture.fewWrappedDTTPairOriginalToken1
      WETH = fixture.WETH
      fwWETH = fixture.fwWETH
      WETHPartner = fixture.WETHPartner
      fewWrappedWETHPartner = fixture.fewWrappedWETHPartner
      wrappedWETHDTTPair = fixture.fewWrappedWETHDTTPair

      factory = fixture.factoryV2
      fewFactory = fixture.fewFactory
      router = {
        [RouterVersion.fewV2Router]: fixture.fewV2Router,
      }[routerVersion as RouterVersion]
      fewWrappedDTTPair = fixture.fewWrappedDTTPair
    })
    
    describe(routerVersion, () => {

      it('factory, WETH', async () => {
        expect(await router.factory()).to.eq(factory.address)
        expect(await router.fewFactory()).to.eq(fewFactory.address)
        expect(await router.WETH()).to.eq(WETH.address)
      })

      it('addLiquidityDTT', async () => {
        const wrappedToken0Amount = expandTo18Decimals(1)
        const wrappedToken1Amount = expandTo18Decimals(4)

        await fewWrappedDTTPairDTT.approve(router.address, MaxUint256)
        await fewWrappedDTTPairOriginalToken1.approve(router.address, MaxUint256)
        await expect(
          router.addLiquidity(
            fewWrappedDTTPairDTT.address,
            fewWrappedDTTPairOriginalToken1.address,
            wrappedToken0Amount,
            wrappedToken1Amount,
            0,
            0,
            wallet.address,
            MaxUint256,
            overrides
          )
        )
        .to.emit(fewWrappedDTTPairDTT, 'Transfer')
        .withArgs(wallet.address, router.address, wrappedToken0Amount)
        .to.emit(fewWrappedDTTPairOriginalToken1, 'Transfer')
        .withArgs(wallet.address, router.address, wrappedToken1Amount.sub(wrappedToken1Amount.div(100)))
        .to.emit(fewWrappedDTTPair, 'Transfer')
        .withArgs(AddressZero, AddressZero, MINIMUM_LIQUIDITY)
        .to.emit(fewWrappedDTT, 'Wrap')
        .withArgs(router.address, wrappedToken1Amount.sub(wrappedToken1Amount.div(100)), fewWrappedDTTPair.address)
        .to.emit(fewWrappedTokenB, 'Wrap')
        .withArgs(router.address, wrappedToken0Amount, fewWrappedDTTPair.address)
        .to.emit(fewWrappedDTTPair, 'Sync')
        .withArgs(wrappedToken1Amount.sub(wrappedToken1Amount.div(100)), wrappedToken0Amount)
        .to.emit(fewWrappedDTTPair, 'Mint')
        .withArgs(router.address, wrappedToken1Amount.sub(wrappedToken1Amount.div(100)), wrappedToken0Amount)
      })

      it('addLiquidityDTTETH', async () => {
        const fewWrappedDTTAmount = expandTo18Decimals(1)
        const wrappedETHAmount = expandTo18Decimals(4)

        const transferDTTAmount = fewWrappedDTTAmount.sub(fewWrappedDTTAmount.div(100))

        const pairDTTAmount = transferDTTAmount.sub(transferDTTAmount.div(100))
        const expectedLiquidity = expandTo18Decimals(2)
        const wrappedWETHDTTPairToken0 = await wrappedWETHDTTPair.token0()
        await DTT.approve(router.address, MaxUint256)

        expectedLiquidity.sub(MINIMUM_LIQUIDITY)
        await expect(
          router.addLiquidityETH(
            DTT.address,
            fewWrappedDTTAmount,
            fewWrappedDTTAmount,
            wrappedETHAmount,
            wallet.address,
            MaxUint256,
            { ...overrides, value: wrappedETHAmount }
          )
        )
          .to.emit(wrappedWETHDTTPair, 'Transfer')
          .withArgs(AddressZero, AddressZero, MINIMUM_LIQUIDITY)
          .to.emit(wrappedWETHDTTPair, 'Sync')
          .withArgs(
            wrappedWETHDTTPairToken0 === fewWrappedWETHPartner.address ? pairDTTAmount : wrappedETHAmount,
            wrappedWETHDTTPairToken0 === fewWrappedWETHPartner.address ? wrappedETHAmount : pairDTTAmount
          )
          .to.emit(wrappedWETHDTTPair, 'Mint')
          .withArgs(
            router.address,
            wrappedWETHDTTPairToken0 === fewWrappedWETHPartner.address ? pairDTTAmount : wrappedETHAmount,
            wrappedWETHDTTPairToken0 === fewWrappedWETHPartner.address ? wrappedETHAmount : pairDTTAmount
          )
      })

      async function addDTTLiquidity(wrappedDTTAmount: BigNumber, wrappedToken1Amount: BigNumber) {
        await DTT.approve(fewWrappedDTT.address, wrappedDTTAmount, overrides)
        await token1.approve(fewWrappedTokenB.address, wrappedToken1Amount, overrides);
        
        await fewWrappedDTT.wrap(wrappedDTTAmount, overrides)
        await fewWrappedTokenB.wrap(wrappedToken1Amount, overrides)

        await fewWrappedDTT.transfer(fewWrappedDTTPair.address, wrappedDTTAmount)
        await fewWrappedTokenB.transfer(fewWrappedDTTPair.address, wrappedToken1Amount)

        await fewWrappedDTT.approve(fewWrappedDTTPair.address, MaxUint256)
        await fewWrappedTokenB.approve(fewWrappedDTTPair.address, MaxUint256)

        await fewWrappedDTTPair.mint(wallet.address, overrides)
      }

      it('removeDTTLiquidity', async () => {
        const wrappedDTTAmount = expandTo18Decimals(1)
        const wrappedToken1Amount = expandTo18Decimals(4)

        await addDTTLiquidity(wrappedDTTAmount, wrappedToken1Amount)

        const expectedLiquidity = expandTo18Decimals(2)

        await fewWrappedDTTPair.approve(router.address, MaxUint256)

        await expect(
          router.removeLiquidity(
            fewWrappedDTT.address,
            fewWrappedTokenB.address,
            expectedLiquidity.sub(MINIMUM_LIQUIDITY),
            0,
            0,
            wallet.address,
            MaxUint256,
            overrides
          )
        )
          .to.emit(fewWrappedDTTPair, 'Transfer')
          .withArgs(wallet.address, fewWrappedDTTPair.address, expectedLiquidity.sub(MINIMUM_LIQUIDITY))
          .to.emit(fewWrappedDTTPair, 'Transfer')
          .withArgs(fewWrappedDTTPair.address, AddressZero, expectedLiquidity.sub(MINIMUM_LIQUIDITY))
          .to.emit(fewWrappedDTT, 'Transfer')
          .withArgs(fewWrappedDTTPair.address, router.address, wrappedDTTAmount.sub(500))
          .to.emit(fewWrappedTokenB, 'Transfer')
          .withArgs(fewWrappedDTTPair.address, router.address, wrappedToken1Amount.sub(2000))
          .to.emit(fewWrappedDTTPair, 'Sync')
          .withArgs(500, 2000)
          .to.emit(fewWrappedDTTPair, 'Burn')
          .withArgs(router.address, wrappedDTTAmount.sub(500), wrappedToken1Amount.sub(2000), router.address)

        expect(await fewWrappedDTTPair.balanceOf(wallet.address)).to.eq(0)
        const totalSupplyToken1 = await fewWrappedTokenB.totalSupply()
        expect(await fewWrappedTokenB.balanceOf(wallet.address)).to.eq(totalSupplyToken1.sub(2000))
      })

      async function addLiquidityWrappedDTTWETH(fewWrappedDTTAmount: BigNumber, wrappedWETHAmount: BigNumber) {

        await DTT.approve(fewWrappedDTT.address, fewWrappedDTTAmount, overrides)

        await WETH.deposit({ value: wrappedWETHAmount })
        await WETH.approve(fwWETH.address, wrappedWETHAmount, overrides)
        
        await fewWrappedDTT.wrap(fewWrappedDTTAmount, overrides)
        await fwWETH.wrap(wrappedWETHAmount, overrides)

        await fewWrappedDTT.transfer(wrappedWETHDTTPair.address, fewWrappedDTTAmount)
        await fwWETH.transfer(wrappedWETHDTTPair.address, wrappedWETHAmount)

        await fewWrappedDTT.approve(wrappedWETHDTTPair.address, MaxUint256)
        await fwWETH.approve(wrappedWETHDTTPair.address, MaxUint256)

        await wrappedWETHDTTPair.mint(wallet.address, overrides)
        await wrappedWETHDTTPair.approve(router.address, MaxUint256, overrides)
      }

      it('removeLiquidityETHDTT', async () => {
        const wrappedWETHDTTPairAmount = expandTo18Decimals(1)
        const wrappedWETHAmount = expandTo18Decimals(4)

        await addLiquidityWrappedDTTWETH(wrappedWETHDTTPairAmount, wrappedWETHAmount)
        const expectedLiquidity = expandTo18Decimals(2)
        const wrappedWETHDTTPairToken0 = await wrappedWETHDTTPair.token0()

        await wrappedWETHDTTPair.approve(router.address, MaxUint256, overrides)

        await expect(
          router.removeLiquidityETH(
            fewWrappedDTT.address,
            expectedLiquidity.sub(MINIMUM_LIQUIDITY),
            0,
            0,
            wallet.address,
            MaxUint256,
            overrides
          )
        )
          .to.emit(wrappedWETHDTTPair, 'Transfer')
          .withArgs(wallet.address, wrappedWETHDTTPair.address, expectedLiquidity.sub(MINIMUM_LIQUIDITY))
          .to.emit(wrappedWETHDTTPair, 'Transfer')
          .withArgs(wrappedWETHDTTPair.address, AddressZero, expectedLiquidity.sub(MINIMUM_LIQUIDITY))
          .to.emit(fwWETH, 'Transfer')
          .withArgs(wrappedWETHDTTPair.address, router.address, wrappedWETHAmount.sub(2000))
          .to.emit(fewWrappedDTT, 'Transfer')
          .withArgs(wrappedWETHDTTPair.address, router.address, wrappedWETHDTTPairAmount.sub(500))
          .to.emit(wrappedWETHDTTPair, 'Sync')
          .withArgs(
            wrappedWETHDTTPairToken0 === fewWrappedDTT.address ? 500 : 2000,
            wrappedWETHDTTPairToken0 === fewWrappedDTT.address ? 2000 : 500
          )
          .to.emit(wrappedWETHDTTPair, 'Burn')
          .withArgs(
            router.address,
            wrappedWETHDTTPairToken0 === fewWrappedDTT.address ? wrappedWETHDTTPairAmount.sub(500) : wrappedWETHAmount.sub(2000),
            wrappedWETHDTTPairToken0 === fewWrappedDTT.address ? wrappedWETHAmount.sub(2000) : wrappedWETHDTTPairAmount.sub(500),
            router.address
          )

        expect(await wrappedWETHDTTPair.balanceOf(wallet.address)).to.eq(0)
        const totalSupplyfwWETH = await fwWETH.totalSupply()
        expect(await fwWETH.balanceOf(wallet.address)).to.eq(totalSupplyfwWETH.sub(2000))
      })

      it('removeLiquidityETHWithPermit', async () => {
        const wrappedWETHPartnerAmount = expandTo18Decimals(1)
        const wrappedWETHAmount = expandTo18Decimals(4)

        await addLiquidityWrappedDTTWETH(wrappedWETHPartnerAmount, wrappedWETHAmount)

        const expectedLiquidity = expandTo18Decimals(2)

        const nonce = await wrappedWETHDTTPair.nonces(wallet.address)
        const digest = await getApprovalDigest(
          wrappedWETHDTTPair,
          { owner: wallet.address, spender: router.address, value: expectedLiquidity.sub(MINIMUM_LIQUIDITY) },
          nonce,
          MaxUint256
        )

        const { v, r, s } = ecsign(Buffer.from(digest.slice(2), 'hex'), Buffer.from(wallet.privateKey.slice(2), 'hex'))

        await router.removeLiquidityETHWithPermit(
          fewWrappedDTT.address,
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
    })
  }
})
