import chai, { expect } from 'chai'
import { Contract } from 'ethers'
import { AddressZero, Zero, MaxUint256 } from 'ethers/constants'
import { BigNumber, bigNumberify } from 'ethers/utils'
import { solidity, MockProvider, createFixtureLoader } from 'ethereum-waffle'
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
  // UniswapV2Router01 = 'UniswapV2Router01',
  // UniswapV2Router02 = 'UniswapV2Router02',
  FewV1Router = 'FewV1Router',
  // FewV1RouterFeeOnTransfer = 'FewV1RouterFeeOnTransfer'
}

describe('UniswapV2Router{01,02}, FewV1Router', () => {
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
    let pair: Contract
    let wrappedPair: Contract
    let WETHPair: Contract
    let wrappedWETHPair: Contract
    let routerEventEmitter: Contract
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
        // [RouterVersion.UniswapV2Router01]: fixture.router01,
        // [RouterVersion.UniswapV2Router02]: fixture.router02,
        [RouterVersion.FewV1Router]: fixture.fewRouter,
        // [RouterVersion.FewV1RouterFeeOnTransfer]: fixture.fewRouterFeeOnTransfer
      }[routerVersion as RouterVersion]
      pair = fixture.pair
      wrappedPair = fixture.wrappedPair
      WETHPair = fixture.WETHPair
      wrappedWETHPair = fixture.wrappedWETHPair

      routerEventEmitter = fixture.routerEventEmitter
    })
    
    describe(routerVersion, () => {
      // async function getwrappedPairAddress() {
      //   await factory.createPair(fewWrappedToken0.address, fewWrappedToken1.address)
      //   const wrappedPairAddress = await factory.getPair(fewWrappedToken0.address, fewWrappedToken1.address)
      //   console.log(wrappedPairAddress, 'wrappedPairAddress')
      // }

      it('factory, WETH', async () => {
        // getwrappedPairAddress()
        expect(await router.factory()).to.eq(factory.address)
        expect(await router.fewFactory()).to.eq(fewFactory.address)
        expect(await router.WETH()).to.eq(WETH.address)
      })

      it('addLiquidity', async () => {
        const token0Amount = expandTo18Decimals(1)
        const token1Amount = expandTo18Decimals(4)

        const expectedLiquidity = expandTo18Decimals(2)

        await token0.approve(router.address, MaxUint256)
        await token1.approve(router.address, MaxUint256)
        await expect(
          router.addLiquidity(
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
        )
          .to.emit(token0, 'Transfer')
          .withArgs(wallet.address, router.address, token0Amount)
          .to.emit(token1, 'Transfer')
          .withArgs(wallet.address, router.address, token1Amount)
          .to.emit(wrappedPair, 'Transfer')
          .withArgs(AddressZero, AddressZero, MINIMUM_LIQUIDITY)
          .to.emit(fewWrappedToken0, 'Wrap')
          .withArgs(router.address, token0Amount, wrappedPair.address)
          .to.emit(fewWrappedToken1, 'Wrap')
          .withArgs(router.address, token1Amount, wrappedPair.address)
          .to.emit(wrappedPair, 'Sync')
          .withArgs(token0Amount, token1Amount)
          .to.emit(wrappedPair, 'Mint')
          .withArgs(router.address, token0Amount, token1Amount)

        expect(await wrappedPair.balanceOf(wallet.address)).to.eq(expectedLiquidity.sub(MINIMUM_LIQUIDITY))
      })

      it('addLiquidityETH', async () => {
        const WETHPartnerAmount = expandTo18Decimals(1)
        const ETHAmount = expandTo18Decimals(4)

        const expectedLiquidity = expandTo18Decimals(2)
        const wrappedWETHPairToken0 = await wrappedWETHPair.token0()
        await WETHPartner.approve(router.address, MaxUint256)
        await expect(
          router.addLiquidityETH(
            WETHPartner.address,
            WETHPartnerAmount,
            WETHPartnerAmount,
            ETHAmount,
            wallet.address,
            MaxUint256,
            { ...overrides, value: ETHAmount }
          )
        )
          .to.emit(wrappedWETHPair, 'Transfer')
          .withArgs(AddressZero, AddressZero, MINIMUM_LIQUIDITY)
          .to.emit(wrappedWETHPair, 'Transfer')
          .withArgs(AddressZero, wallet.address, expectedLiquidity.sub(MINIMUM_LIQUIDITY))
          .to.emit(wrappedWETHPair, 'Sync')
          .withArgs(
            wrappedWETHPairToken0 === fewWrappedWETHPartner.address ? WETHPartnerAmount : ETHAmount,
            wrappedWETHPairToken0 === fewWrappedWETHPartner.address ? ETHAmount : WETHPartnerAmount
          )
          .to.emit(wrappedWETHPair, 'Mint')
          .withArgs(
            router.address,
            wrappedWETHPairToken0 === fewWrappedWETHPartner.address ? WETHPartnerAmount : ETHAmount,
            wrappedWETHPairToken0 === fewWrappedWETHPartner.address ? ETHAmount : WETHPartnerAmount
          )

        expect(await wrappedWETHPair.balanceOf(wallet.address)).to.eq(expectedLiquidity.sub(MINIMUM_LIQUIDITY))
      })

      // async function newAddLiquidity(token0Amount: BigNumber, token1Amount: BigNumber) {
      //   await fewFactory.createToken(tokenC.address)
      //   const wrappedTokenCAddress = await fewFactory.getWrappedToken(tokenC.address)
      //   const wrappedTokenC = new Contract(wrappedTokenCAddress, JSON.stringify(IFewWrappedToken.abi), provider).connect(wallet)

      //   await fewFactory.createToken(tokenD.address)
      //   const wrappedTokenDAddress = await fewFactory.getWrappedToken(tokenD.address)
      //   const wrappedTokenD = new Contract(wrappedTokenDAddress, JSON.stringify(IFewWrappedToken.abi), provider).connect(wallet)

      //   // await token0.approve(fewWrappedToken0.address, token0Amount, overrides)
      //   // await token1.approve(fewWrappedToken1.address, token1Amount, overrides)
      //   await tokenC.approve(wrappedTokenCAddress.address, token0Amount, overrides)
      //   await tokenD.approve(wrappedTokenDAddress.address, token1Amount, overrides)

      //   // await fewWrappedToken0.wrap(token0Amount, overrides)
      //   // await fewWrappedToken1.wrap(token1Amount, overrides)
      //   await wrappedTokenC.wrap(token0Amount, overrides)
      //   await wrappedTokenD.wrap(token1Amount, overrides)

      //   const wrappedPairAddress = await factory.getPair(wrappedTokenC.address, wrappedTokenD.address)
      //   const wrappedPair = new Contract(wrappedPairAddress, JSON.stringify(IUniswapV2Pair.abi), provider).connect(wallet)

      //   // await fewWrappedToken0.transfer(wrappedPair.address, token0Amount)
      //   // await fewWrappedToken1.transfer(wrappedPair.address, token1Amount)
      //   await wrappedTokenC.transfer(wrappedPair.address, token0Amount)
      //   await wrappedTokenD.transfer(wrappedPair.address, token1Amount)

      //   // await fewWrappedToken0.approve(wrappedPair.address, MaxUint256)
      //   // await fewWrappedToken1.approve(wrappedPair.address, MaxUint256)
      //   await wrappedTokenC.approve(wrappedPair.address, MaxUint256)
      //   await wrappedTokenD.approve(wrappedPair.address, MaxUint256)
        
      //   await wrappedPair.mint(wallet.address, overrides)
      // }

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
            [RouterVersion.FewV1Router]: 5845425
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
            [RouterVersion.FewV1Router]: 367293
          }[routerVersion as RouterVersion]
        )
      }).retries(3)

      async function addLiquidity(token0Amount: BigNumber, token1Amount: BigNumber) {

        await token0.approve(fewWrappedToken0.address, token0Amount, overrides)
        await token1.approve(fewWrappedToken1.address, token1Amount, overrides);
        
        await fewWrappedToken0.wrap(token0Amount, overrides)
        await fewWrappedToken1.wrap(token1Amount, overrides)

        await fewWrappedToken0.transfer(wrappedPair.address, token0Amount)
        await fewWrappedToken1.transfer(wrappedPair.address, token1Amount)

        await fewWrappedToken0.approve(wrappedPair.address, MaxUint256)
        await fewWrappedToken1.approve(wrappedPair.address, MaxUint256)

        await wrappedPair.mint(wallet.address, overrides)
      }

      it('removeLiquidity', async () => {
        const token0Amount = expandTo18Decimals(1)
        const token1Amount = expandTo18Decimals(4)

        await addLiquidity(token0Amount, token1Amount)

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
          .withArgs(wrappedPair.address, router.address, token0Amount.sub(500))
          .to.emit(fewWrappedToken1, 'Transfer')
          .withArgs(wrappedPair.address, router.address, token1Amount.sub(2000))
          .to.emit(wrappedPair, 'Sync')
          .withArgs(500, 2000)
          .to.emit(wrappedPair, 'Burn')
          .withArgs(router.address, token0Amount.sub(500), token1Amount.sub(2000), router.address)

        expect(await wrappedPair.balanceOf(wallet.address)).to.eq(0)
        const totalSupplyToken0 = await fewWrappedToken0.totalSupply()
        const totalSupplyToken1 = await fewWrappedToken1.totalSupply()
        expect(await fewWrappedToken0.balanceOf(wallet.address)).to.eq(totalSupplyToken0.sub(500))
        expect(await fewWrappedToken1.balanceOf(wallet.address)).to.eq(totalSupplyToken1.sub(2000))
      })

      async function addLiquidityWrappedETH(WETHPartnerAmount: BigNumber, fwWETHAmount: BigNumber) {

        await WETHPartner.approve(fewWrappedWETHPartner.address, WETHPartnerAmount, overrides)

        await WETH.deposit({ value: fwWETHAmount })
        // await WETH.transfer(WETHPair.address, fwWETHAmount)
        await WETH.approve(fwWETH.address, fwWETHAmount, overrides)
        
        await fewWrappedWETHPartner.wrap(WETHPartnerAmount, overrides)
        await fwWETH.wrap(fwWETHAmount, overrides)

        const fwWETHBalance = await fwWETH.balanceOf(wallet.address)
        const fewWrappedWETHPartnerBalance = await fewWrappedWETHPartner.balanceOf(wallet.address)

        // console.log(fwWETHBalance.toString(), '1fwWETHBalance.toString()')
        // console.log(fewWrappedWETHPartnerBalance.toString(), '1fewWrappedWETHPartnerBalance.toString()')

        await fewWrappedWETHPartner.transfer(wrappedWETHPair.address, WETHPartnerAmount)
        await fwWETH.transfer(wrappedWETHPair.address, fwWETHAmount)

        await fewWrappedWETHPartner.approve(wrappedWETHPair.address, MaxUint256)
        await fwWETH.approve(wrappedWETHPair.address, MaxUint256)

        const fwWETHwrappedWETHPairBalance = await fwWETH.balanceOf(wrappedWETHPair.address)
        const fewWrappedWETHPartnerwrappedWETHPairBalance = await fewWrappedWETHPartner.balanceOf(wrappedWETHPair.address)

        // console.log(fwWETHwrappedWETHPairBalance.toString(), 'fwWETHwrappedWETHPairBalance.toString()')
        // console.log(fewWrappedWETHPartnerwrappedWETHPairBalance.toString(), 'fewWrappedWETHPartnerwrappedWETHPairBalance.toString()')

        await wrappedWETHPair.mint(wallet.address, overrides)
        await wrappedWETHPair.approve(router.address, MaxUint256, overrides)

        const wrappedWETHPairBalance = await wrappedWETHPair.balanceOf(wallet.address)
        // console.log(wrappedWETHPairBalance.toString(), '1wrappedWETHPairBalance')

        await fewWrappedToken0.approve(router.address, MaxUint256)
        await token0.approve(router.address, MaxUint256)
        await fewWrappedWETHPartner.approve(router.address, MaxUint256)
        await fwWETH.approve(router.address, MaxUint256)
        await WETH.approve(router.address, MaxUint256)
        await WETHPartner.approve(router.address, MaxUint256)
      }

      it('removeLiquidityETH', async () => {
        const wrappedWETHPartnerAmount = expandTo18Decimals(1)
        const fwWETHAmount = expandTo18Decimals(4)
        // await fewWrappedWETHPartner.transfer(wrappedWETHPair.address, wrappedWETHPartnerAmount)
        // await WETH.deposit({ value: ETHAmount })
        // await WETH.transfer(wrappedWETHPair.address, ETHAmount)
        // await wrappedWETHPair.mint(wallet.address, overrides)

        await addLiquidityWrappedETH(wrappedWETHPartnerAmount, fwWETHAmount)
        const expectedLiquidity = expandTo18Decimals(2)
        const wrappedWETHPairToken0 = await wrappedWETHPair.token0()
        // console.log(wrappedWETHPairToken0, 'wrappedWETHPairToken0')

        // const fwWETHBalance = await fwWETH.balanceOf(wallet.address)
        // const fwWETHRouterBalance = await fwWETH.balanceOf(router.address)
        // const wrappedWETHRouterBalance = await wrappedWETHPair.balanceOf(router.address)
        const wrappedWETHBalance = await wrappedWETHPair.balanceOf(wallet.address)

        // console.log(fwWETHBalance.toString(), 'fwWETHBalance.toString()')
        // console.log(fwWETHRouterBalance.toString(), 'fwWETHRouterBalance.toString()')
        // console.log(wrappedWETHRouterBalance.toString(), 'wrappedWETHRouterBalance.toString()')
        // console.log(wrappedWETHBalance.toString(), '2wrappedWETHBalance.toString()')

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
          .withArgs(wrappedWETHPair.address, router.address, fwWETHAmount.sub(2000))
          .to.emit(fewWrappedWETHPartner, 'Transfer')
          .withArgs(wrappedWETHPair.address, router.address, wrappedWETHPartnerAmount.sub(500))
          // .to.emit(WETHPartner.address, 'Transfer')
          // .withArgs(router.address, wallet.address, wrappedWETHPartnerAmount.sub(500))
          .to.emit(wrappedWETHPair, 'Sync')
          .withArgs(
            wrappedWETHPairToken0 === fewWrappedWETHPartner.address ? 500 : 2000,
            wrappedWETHPairToken0 === fewWrappedWETHPartner.address ? 2000 : 500
          )
          .to.emit(wrappedWETHPair, 'Burn')
          .withArgs(
            router.address,
            wrappedWETHPairToken0 === fewWrappedWETHPartner.address ? wrappedWETHPartnerAmount.sub(500) : fwWETHAmount.sub(2000),
            wrappedWETHPairToken0 === fewWrappedWETHPartner.address ? fwWETHAmount.sub(2000) : wrappedWETHPartnerAmount.sub(500),
            router.address
          )

        expect(await wrappedWETHPair.balanceOf(wallet.address)).to.eq(0)
        const totalSupplyfwWETHPartner = await fewWrappedWETHPartner.totalSupply()
        const totalSupplyfwWETH = await fwWETH.totalSupply()
        expect(await fewWrappedWETHPartner.balanceOf(wallet.address)).to.eq(totalSupplyfwWETHPartner.sub(500))
        expect(await fwWETH.balanceOf(wallet.address)).to.eq(totalSupplyfwWETH.sub(2000))
      })

      it('removeLiquidityWithPermit', async () => {
        const token0Amount = expandTo18Decimals(1)
        const token1Amount = expandTo18Decimals(4)
        await addLiquidity(token0Amount, token1Amount)

        const expectedLiquidity = expandTo18Decimals(2)

        const nonce = await wrappedPair.nonces(wallet.address)
        const name = await pair.name()
        console.log(await wrappedPair.name(), 'wrappedPair')
        console.log(name, 'namename')
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
        const fwWETHAmount = expandTo18Decimals(4)
        // await WETHPartner.transfer(WETHPair.address, WETHPartnerAmount)
        // await WETH.deposit({ value: ETHAmount })
        // await WETH.transfer(WETHPair.address, ETHAmount)
        // await WETHPair.mint(wallet.address, overrides)

        await addLiquidityWrappedETH(wrappedWETHPartnerAmount, fwWETHAmount)

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
        const token0Amount = expandTo18Decimals(5)
        const token1Amount = expandTo18Decimals(10)
        const swapAmount = expandTo18Decimals(1)
        const expectedOutputAmount = bigNumberify('1662497915624478906')

        beforeEach(async () => {
          await addLiquidity(token0Amount, token1Amount)
          await token0.approve(router.address, MaxUint256)
          await fewWrappedToken0.approve(router.address, MaxUint256)
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
            .withArgs(token0Amount.add(swapAmount), token1Amount.sub(expectedOutputAmount))
            .to.emit(wrappedPair, 'Swap')
            .withArgs(router.address, swapAmount, 0, 0, expectedOutputAmount, router.address)
        })

        it('amounts', async () => {
          await token0.approve(routerEventEmitter.address, MaxUint256)
          await fewWrappedToken0.approve(routerEventEmitter.address, MaxUint256)
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

          await token0.approve(router.address, MaxUint256)
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
              [RouterVersion.FewV1Router]: 179129
            }[routerVersion as RouterVersion]
          )
        }).retries(3)
      })

      describe('swapTokensForExactTokens', () => {
        const token0Amount = expandTo18Decimals(5)
        const token1Amount = expandTo18Decimals(10)
        const expectedSwapAmount = bigNumberify('557227237267357629')
        const outputAmount = expandTo18Decimals(1)

        beforeEach(async () => {
          await addLiquidity(token0Amount, token1Amount)
        })

        it('happy path', async () => {
          await token0.approve(router.address, MaxUint256)
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
            // .withArgs(pair.address, wallet.address, outputAmount)
            .to.emit(wrappedPair, 'Sync')
            .withArgs(token0Amount.add(expectedSwapAmount), token1Amount.sub(outputAmount))
            .to.emit(wrappedPair, 'Swap')
            .withArgs(router.address, expectedSwapAmount, 0, 0, outputAmount, router.address)
        })

        it('amounts', async () => {
          await token0.approve(routerEventEmitter.address, MaxUint256)
          await fewWrappedToken0.approve(routerEventEmitter.address, MaxUint256)
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
        const WETHPartnerAmount = expandTo18Decimals(10)
        const ETHAmount = expandTo18Decimals(5)
        // const swapAmount = expandTo18Decimals(1)
        // const expectedOutputAmount = bigNumberify('1662497915624478906')
        const wrappedWETHPartnerAmount = expandTo18Decimals(10)
        const fwWETHAmount = expandTo18Decimals(5)
        const swapAmount = expandTo18Decimals(1)
        const expectedOutputAmount = bigNumberify('1662497915624478906')

        beforeEach(async () => {
          // await WETHPartner.transfer(WETHPair.address, WETHPartnerAmount)
          // await WETH.deposit({ value: ETHAmount })
          // await WETH.transfer(WETHPair.address, ETHAmount)
          // await WETHPair.mint(wallet.address, overrides)

          await addLiquidityWrappedETH(wrappedWETHPartnerAmount, fwWETHAmount)
          const wrappedWETHPairBalance = await wrappedWETHPair.balanceOf(wallet.address)
          console.log(wrappedWETHPairBalance.toString(), 'aaawrappedWETHPairBalance')
        })

        it('happy path', async () => {
      //     const WETHPairToken0 = await WETHPair.token0()
          const wrappedWETHPairToken0 = await wrappedWETHPair.token0()

      //     await fewWrappedWETHPartner.approve(router.address, MaxUint256)
      //     await fwWETH.approve(router.address, MaxUint256)
      //     await fewWrappedToken0.approve(router.address, MaxUint256)
      //     await token0.approve(router.address, MaxUint256)
      //     await fewWrappedWETHPartner.approve(router.address, MaxUint256)
      //     await fwWETH.approve(router.address, MaxUint256)
      //     await WETH.approve(router.address, MaxUint256)
      //     await WETHPartner.approve(router.address, MaxUint256)
            await expect(
              router.swapExactETHForTokens(0, [fwWETH.address, fewWrappedWETHPartner.address], wallet.address, MaxUint256, {
                ...overrides,
                value: swapAmount
              })
            )
            .to.emit(fwWETH, 'Transfer')
            .withArgs(AddressZero, wrappedWETHPair.address, swapAmount)
            .to.emit(fewWrappedWETHPartner, 'Transfer')
            .withArgs(wrappedWETHPair.address, router.address, expectedOutputAmount)
            .to.emit(wrappedWETHPair, 'Sync')
            .withArgs(
              wrappedWETHPairToken0 === fewWrappedWETHPartner.address
                ? WETHPartnerAmount.sub(expectedOutputAmount)
                : ETHAmount.add(swapAmount),
              wrappedWETHPairToken0 === fewWrappedWETHPartner.address
                ? ETHAmount.add(swapAmount)
                : WETHPartnerAmount.sub(expectedOutputAmount)
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
          const WETHPartnerAmount = expandTo18Decimals(10)
          const ETHAmount = expandTo18Decimals(5)
          const wrappedWETHPartnerAmount = expandTo18Decimals(10)
          const fwWETHAmount = expandTo18Decimals(5)
          // await WETHPartner.transfer(WETHPair.address, WETHPartnerAmount)
          // await WETH.deposit({ value: ETHAmount })
          // await WETH.transfer(WETHPair.address, ETHAmount)
          // await WETHPair.mint(wallet.address, overrides)
          await addLiquidityWrappedETH(wrappedWETHPartnerAmount, fwWETHAmount)

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
              // [RouterVersion.UniswapV2Router01]: 138770,
              // [RouterVersion.UniswapV2Router02]: 138770
              [RouterVersion.FewV1Router]: 206449
            }[routerVersion as RouterVersion]
          )
        }).retries(3)
      })

      describe('swapTokensForExactETH', () => {
        const wrappedWETHPartnerAmount = expandTo18Decimals(5)
        const fwWETHAmount = expandTo18Decimals(10)
        const expectedSwapAmount = bigNumberify('557227237267357629')
        const outputAmount = expandTo18Decimals(1)

        beforeEach(async () => {
          // await WETHPartner.transfer(WETHPair.address, WETHPartnerAmount)
          // await WETH.deposit({ value: ETHAmount })
          // await WETH.transfer(WETHPair.address, ETHAmount)
          // await WETHPair.mint(wallet.address, overrides)
          await addLiquidityWrappedETH(wrappedWETHPartnerAmount, fwWETHAmount)
        })

        it('happy path', async () => {
          await WETHPartner.approve(router.address, MaxUint256)
          await fewWrappedWETHPartner.approve(router.address, MaxUint256)

          const WETHPairToken0 = await WETHPair.token0()
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
                : fwWETHAmount.sub(outputAmount),
              wrappedWETHPairToken0 === fewWrappedWETHPartner.address
                ? fwWETHAmount.sub(outputAmount)
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

        // it('amounts', async () => {
        //   await fewWrappedWETHPartner.approve(routerEventEmitter.address, MaxUint256)
        //   await expect(
        //     routerEventEmitter.swapTokensForExactETH(
        //       router.address,
        //       outputAmount,
        //       MaxUint256,
        //       [fewWrappedWETHPartner.address, fwWETH.address],
        //       wallet.address,
        //       MaxUint256,
        //       overrides
        //     )
        //   )
        //     .to.emit(routerEventEmitter, 'Amounts')
        //     .withArgs([expectedSwapAmount, outputAmount])
        // })
      })

      describe('swapExactTokensForETH', () => {
        const wrappedWETHPartnerAmount = expandTo18Decimals(5)
        const fwWETHAmount = expandTo18Decimals(10)
      //   const WETHPartnerAmount = expandTo18Decimals(5)
      //   const ETHAmount = expandTo18Decimals(10)
        const swapAmount = expandTo18Decimals(1)
        const expectedOutputAmount = bigNumberify('1662497915624478906')

        beforeEach(async () => {
          await addLiquidityWrappedETH(wrappedWETHPartnerAmount, fwWETHAmount)
          // await WETHPartner.transfer(WETHPair.address, WETHPartnerAmount)
          // await WETH.deposit({ value: ETHAmount })
          // await WETH.transfer(WETHPair.address, ETHAmount)
          // await WETHPair.mint(wallet.address, overrides)
        })

        it('happy path', async () => {
          await WETHPartner.approve(router.address, MaxUint256)
          await fewWrappedWETHPartner.approve(router.address, MaxUint256)

          const WETHPairToken0 = await WETHPair.token0()
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
                : fwWETHAmount.sub(expectedOutputAmount),
              wrappedWETHPairToken0 === fewWrappedWETHPartner.address
                ? fwWETHAmount.sub(expectedOutputAmount)
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

        // it('amounts', async () => {
        //   await fewWrappedWETHPartner.approve(routerEventEmitter.address, MaxUint256)
        //   await expect(
        //     routerEventEmitter.swapExactTokensForETH(
        //       router.address,
        //       swapAmount,
        //       0,
        //       [fewWrappedWETHPartner.address, fwWETH.address],
        //       wallet.address,
        //       MaxUint256,
        //       overrides
        //     )
        //   )
        //     .to.emit(routerEventEmitter, 'Amounts')
        //     .withArgs([swapAmount, expectedOutputAmount])
        // })
      })

      describe('swapETHForExactTokens', () => {
        // const WETHPartnerAmount = expandTo18Decimals(10)
        // const ETHAmount = expandTo18Decimals(5)
        const wrappedWETHPartnerAmount = expandTo18Decimals(10)
        const fwWETHAmount = expandTo18Decimals(5)
        const expectedSwapAmount = bigNumberify('557227237267357629')
        const outputAmount = expandTo18Decimals(1)

        beforeEach(async () => {
          // await WETHPartner.transfer(WETHPair.address, WETHPartnerAmount)
          // await WETH.deposit({ value: ETHAmount })
          // await WETH.transfer(WETHPair.address, ETHAmount)
          // await WETHPair.mint(wallet.address, overrides)
          await addLiquidityWrappedETH(wrappedWETHPartnerAmount, fwWETHAmount)
        })

        it('happy path', async () => {
          // const WETHPairToken0 = await WETHPair.token0()
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
                : fwWETHAmount.add(expectedSwapAmount),
              wrappedWETHPairToken0 === fewWrappedWETHPartner.address
                ? fwWETHAmount.add(expectedSwapAmount)
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
