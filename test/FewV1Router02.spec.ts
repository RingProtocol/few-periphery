import chai, { expect } from 'chai'
import { Contract } from 'ethers'
import { AddressZero, Zero, MaxUint256 } from 'ethers/constants'
import { BigNumber, bigNumberify } from 'ethers/utils'
import { solidity, MockProvider, createFixtureLoader, deployContract } from 'ethereum-waffle'
import { ecsign } from 'ethereumjs-util'

import { expandTo18Decimals, getApprovalDigest, getFewWrappedTokenApprovalDigest, mineBlock, MINIMUM_LIQUIDITY } from './shared/utilities'
import { v2Fixture } from './shared/fixtures'
import IUniswapV2Pair from '@uniswap/v2-core/build/IUniswapV2Pair.json'
import IFewWrappedToken from './shared/contractBuild/IFewWrappedToken.json'

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
    let fewWrappedToken0: Contract
    let fewWrappedToken1: Contract
    let fewWrappedDTT: Contract
    let WETH: Contract
    let fwWETH: Contract
    let WETHPartner: Contract
    let fewWrappedWETHPartner: Contract
    let wrappedWETHDTTPair: Contract
    let factory: Contract
    let fewFactory: Contract
    let router: Contract
    let DTT: Contract
    let DTTToken1Pair: Contract
    beforeEach(async function() {
      const fixture = await loadFixture(v2Fixture)
      token0 = fixture.token0
      token1 = fixture.token1
      DTT = fixture.DTT
      fewWrappedToken0 = fixture.fewWrappedToken0
      fewWrappedToken1 = fixture.fewWrappedToken1
      fewWrappedDTT = fixture.fewWrappedDTT
      WETH = fixture.WETH
      fwWETH = fixture.fwWETH
      WETHPartner = fixture.WETHPartner
      fewWrappedWETHPartner = fixture.fewWrappedWETHPartner
      wrappedWETHDTTPair = fixture.wrappedWETHDTTPair

      factory = fixture.factoryV2
      fewFactory = fixture.fewFactory
      router = {
        [RouterVersion.fewV2Router]: fixture.fewV2Router,
      }[routerVersion as RouterVersion]
      DTTToken1Pair = fixture.DTTToken1Pair
    })
    
    describe(routerVersion, () => {

      it('factory, WETH', async () => {
        expect(await router.factory()).to.eq(factory.address)
        expect(await router.fewFactory()).to.eq(fewFactory.address)
        expect(await router.WETH()).to.eq(WETH.address)
      })

      it('addLiquidityDTT', async () => {
        const token0Amount = expandTo18Decimals(1)
        const token1Amount = expandTo18Decimals(4)

        await token0.approve(router.address, MaxUint256)
        await DTT.approve(router.address, MaxUint256)
        await token1.approve(router.address, MaxUint256)
        await expect(
          router.addLiquidity(
            DTT.address,
            token1.address,
            token0Amount,
            token1Amount,
            0,
            0,
            wallet.address,
            MaxUint256,
            overrides
          )
        )
          .to.emit(DTT, 'Transfer')
          .withArgs(wallet.address, router.address, token0Amount.sub(token0Amount.div(100)))
          .to.emit(token1, 'Transfer')
          .withArgs(wallet.address, router.address, token1Amount)
          .to.emit(DTTToken1Pair, 'Transfer')
          .withArgs(AddressZero, AddressZero, MINIMUM_LIQUIDITY)
          .to.emit(fewWrappedDTT, 'Wrap')
          .withArgs(router.address, token0Amount.sub(token0Amount.div(100)), DTTToken1Pair.address)
          .to.emit(fewWrappedToken1, 'Wrap')
          .withArgs(router.address, token1Amount, DTTToken1Pair.address)
          .to.emit(DTTToken1Pair, 'Sync')
          .withArgs(token0Amount.sub(token0Amount.div(100)), token1Amount)
          .to.emit(DTTToken1Pair, 'Mint')
          .withArgs(router.address, token0Amount.sub(token0Amount.div(100)), token1Amount)
      })

      it('addLiquidityDTTETH', async () => {
        const DTTAmount = expandTo18Decimals(1)
        const ETHAmount = expandTo18Decimals(4)

        const transferDTTAmount = DTTAmount.sub(DTTAmount.div(100))

        const pairDTTAmount = transferDTTAmount.sub(transferDTTAmount.div(100))
        const expectedLiquidity = expandTo18Decimals(2)
        const wrappedWETHDTTPairToken0 = await wrappedWETHDTTPair.token0()
        await DTT.approve(router.address, MaxUint256)
        
        expectedLiquidity.sub(MINIMUM_LIQUIDITY)
        await expect(
          router.addLiquidityETH(
            DTT.address,
            DTTAmount,
            DTTAmount,
            ETHAmount,
            wallet.address,
            MaxUint256,
            { ...overrides, value: ETHAmount }
          )
        )
          .to.emit(wrappedWETHDTTPair, 'Transfer')
          .withArgs(AddressZero, AddressZero, MINIMUM_LIQUIDITY)
          .to.emit(wrappedWETHDTTPair, 'Sync')
          .withArgs(
            wrappedWETHDTTPairToken0 === fewWrappedWETHPartner.address ? pairDTTAmount : ETHAmount,
            wrappedWETHDTTPairToken0 === fewWrappedWETHPartner.address ? ETHAmount : pairDTTAmount
          )
          .to.emit(wrappedWETHDTTPair, 'Mint')
          .withArgs(
            router.address,
            wrappedWETHDTTPairToken0 === fewWrappedWETHPartner.address ? pairDTTAmount : ETHAmount,
            wrappedWETHDTTPairToken0 === fewWrappedWETHPartner.address ? ETHAmount : pairDTTAmount
          )
      })

      async function addDTTLiquidity(DTTAmount: BigNumber, token1Amount: BigNumber) {

        await DTT.approve(fewWrappedDTT.address, DTTAmount, overrides)
        await token1.approve(fewWrappedToken1.address, token1Amount, overrides);
        
        await fewWrappedDTT.wrap(DTTAmount, overrides)
        await fewWrappedToken1.wrap(token1Amount, overrides)

        await fewWrappedDTT.transfer(DTTToken1Pair.address, DTTAmount)
        await fewWrappedToken1.transfer(DTTToken1Pair.address, token1Amount)

        await fewWrappedDTT.approve(DTTToken1Pair.address, MaxUint256)
        await fewWrappedToken1.approve(DTTToken1Pair.address, MaxUint256)

        await DTTToken1Pair.mint(wallet.address, overrides)
      }

      it('removeDTTLiquidity', async () => {
        const DTTAmount = expandTo18Decimals(1)
        const token1Amount = expandTo18Decimals(4)

        await addDTTLiquidity(DTTAmount, token1Amount)

        const expectedLiquidity = expandTo18Decimals(2)

        await DTTToken1Pair.approve(router.address, MaxUint256)

        await expect(
          router.removeLiquidity(
            fewWrappedDTT.address,
            fewWrappedToken1.address,
            expectedLiquidity.sub(MINIMUM_LIQUIDITY),
            0,
            0,
            wallet.address,
            MaxUint256,
            overrides
          )
        )
          .to.emit(DTTToken1Pair, 'Transfer')
          .withArgs(wallet.address, DTTToken1Pair.address, expectedLiquidity.sub(MINIMUM_LIQUIDITY))
          .to.emit(DTTToken1Pair, 'Transfer')
          .withArgs(DTTToken1Pair.address, AddressZero, expectedLiquidity.sub(MINIMUM_LIQUIDITY))
          .to.emit(fewWrappedDTT, 'Transfer')
          .withArgs(DTTToken1Pair.address, router.address, DTTAmount.sub(500))
          .to.emit(fewWrappedToken1, 'Transfer')
          .withArgs(DTTToken1Pair.address, router.address, token1Amount.sub(2000))
          .to.emit(DTTToken1Pair, 'Sync')
          .withArgs(500, 2000)
          .to.emit(DTTToken1Pair, 'Burn')
          .withArgs(router.address, DTTAmount.sub(500), token1Amount.sub(2000), router.address)

        expect(await DTTToken1Pair.balanceOf(wallet.address)).to.eq(0)
        const totalSupplyToken1 = await fewWrappedToken1.totalSupply()
        expect(await fewWrappedToken1.balanceOf(wallet.address)).to.eq(totalSupplyToken1.sub(2000))
      })

      async function addLiquidityWrappedDTTWETH(fewWrappedDTTAmount: BigNumber, fwWETHAmount: BigNumber) {

        await DTT.approve(fewWrappedDTT.address, fewWrappedDTTAmount, overrides)

        await WETH.deposit({ value: fwWETHAmount })
        await WETH.approve(fwWETH.address, fwWETHAmount, overrides)
        
        await fewWrappedDTT.wrap(fewWrappedDTTAmount, overrides)
        await fwWETH.wrap(fwWETHAmount, overrides)

        await fewWrappedDTT.transfer(wrappedWETHDTTPair.address, fewWrappedDTTAmount)
        await fwWETH.transfer(wrappedWETHDTTPair.address, fwWETHAmount)

        await fewWrappedDTT.approve(wrappedWETHDTTPair.address, MaxUint256)
        await fwWETH.approve(wrappedWETHDTTPair.address, MaxUint256)

        await wrappedWETHDTTPair.mint(wallet.address, overrides)
        await wrappedWETHDTTPair.approve(router.address, MaxUint256, overrides)
      }

      it('removeLiquidityETHDTT', async () => {
        const wrappedWETHDTTPairAmount = expandTo18Decimals(1)
        const fwWETHAmount = expandTo18Decimals(4)

        await addLiquidityWrappedDTTWETH(wrappedWETHDTTPairAmount, fwWETHAmount)
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
          .withArgs(wrappedWETHDTTPair.address, router.address, fwWETHAmount.sub(2000))
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
            wrappedWETHDTTPairToken0 === fewWrappedDTT.address ? wrappedWETHDTTPairAmount.sub(500) : fwWETHAmount.sub(2000),
            wrappedWETHDTTPairToken0 === fewWrappedDTT.address ? fwWETHAmount.sub(2000) : wrappedWETHDTTPairAmount.sub(500),
            router.address
          )

        expect(await wrappedWETHDTTPair.balanceOf(wallet.address)).to.eq(0)
        const totalSupplyfwWETH = await fwWETH.totalSupply()
        expect(await fwWETH.balanceOf(wallet.address)).to.eq(totalSupplyfwWETH.sub(2000))
      })

      it('removeLiquidityETHWithPermit', async () => {
        const wrappedWETHPartnerAmount = expandTo18Decimals(1)
        const fwWETHAmount = expandTo18Decimals(4)

        await addLiquidityWrappedDTTWETH(wrappedWETHPartnerAmount, fwWETHAmount)

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
