import chai, { expect } from 'chai'
import { Wallet, Contract } from 'ethers'
import { BigNumber, bigNumberify, defaultAbiCoder, formatEther } from 'ethers/utils'
import { Web3Provider } from 'ethers/providers'
import { solidity, MockProvider, createFixtureLoader, deployContract } from 'ethereum-waffle'
import IUniswapV2Pair from '@uniswap/v2-core/build/IUniswapV2Pair.json'
import { v2Fixture } from './shared/fixtures'
import { expandTo18Decimals, getCreate2Address, mineBlock } from './shared/utilities'
import { AddressZero, Zero, MaxUint256 } from 'ethers/constants'
import FewWrappedToken from './shared/contractBuild/FewWrappedToken.json'
import FewFactory from './shared/contractBuild/FewFactory.json'
import Core from './shared/contractBuild/Core.json'
import ERC20 from '../build/ERC20.json'
import FewV1Router from '../build/FewV1Router.json'
import { zeroAddress } from 'ethereumjs-util'

import DeflatingERC20 from '../build/DeflatingERC20.json'
import UniswapV2Library from '../build/UniswapV2Library.json'

chai.use(solidity)

const overrides = {
  gasLimit: 9999999
}

describe('FewV1Router', () => {
    const provider = new MockProvider({
      hardfork: 'istanbul',
      mnemonic: 'horn horn horn horn horn horn horn horn horn horn horn horn',
      gasLimit: 9999999
    })
    const [wallet] = provider.getWallets()
    const loadFixture = createFixtureLoader(provider, [wallet])
  
    let token0: Contract
    let token1: Contract
    let WETH: Contract
    let WETHPartner: Contract
    let factory: Contract
    let fewFactory: Contract
    let core: Contract
    let router: Contract
    let pair: Contract
    let WETHPair: Contract
    let routerEventEmitter: Contract
    
    beforeEach(async function() {
      const fixture = await loadFixture(v2Fixture)
      token0 = fixture.token0
      token1 = fixture.token1
      WETH = fixture.WETH
      WETHPartner = fixture.WETHPartner
      factory = fixture.factoryV2
      router = fixture.fewRouter
      pair = fixture.pair
      WETHPair = fixture.WETHPair
      routerEventEmitter = fixture.routerEventEmitter
      fewFactory = fixture.fewFactory

      core = await deployContract(wallet, Core, [], overrides)
      await core.init() // initialize the core

      // fewFactory = await deployContract(wallet, FewFactory, [core.address], overrides)
    })

    it('quote', async () => {
      expect(await router.quote(bigNumberify(1), bigNumberify(100), bigNumberify(200))).to.eq(bigNumberify(2))
      expect(await router.quote(bigNumberify(2), bigNumberify(200), bigNumberify(100))).to.eq(bigNumberify(1))
      await expect(router.quote(bigNumberify(0), bigNumberify(100), bigNumberify(200))).to.be.revertedWith(
        'UniswapV2Library: INSUFFICIENT_AMOUNT'
      )
      await expect(router.quote(bigNumberify(1), bigNumberify(0), bigNumberify(200))).to.be.revertedWith(
        'UniswapV2Library: INSUFFICIENT_LIQUIDITY'
      )
      await expect(router.quote(bigNumberify(1), bigNumberify(100), bigNumberify(0))).to.be.revertedWith(
        'UniswapV2Library: INSUFFICIENT_LIQUIDITY'
      )
    })
  
    it('getAmountOut', async () => {
        expect(await router.getAmountOut(bigNumberify(2), bigNumberify(100), bigNumberify(100))).to.eq(bigNumberify(1))
        await expect(router.getAmountOut(bigNumberify(0), bigNumberify(100), bigNumberify(100))).to.be.revertedWith(
            'UniswapV2Library: INSUFFICIENT_INPUT_AMOUNT'
        )
        await expect(router.getAmountOut(bigNumberify(2), bigNumberify(0), bigNumberify(100))).to.be.revertedWith(
            'UniswapV2Library: INSUFFICIENT_LIQUIDITY'
        )
        await expect(router.getAmountOut(bigNumberify(2), bigNumberify(100), bigNumberify(0))).to.be.revertedWith(
            'UniswapV2Library: INSUFFICIENT_LIQUIDITY'
        )
    })

    it('getAmountIn', async () => {
        expect(await router.getAmountIn(bigNumberify(1), bigNumberify(100), bigNumberify(100))).to.eq(bigNumberify(2))
        await expect(router.getAmountIn(bigNumberify(0), bigNumberify(100), bigNumberify(100))).to.be.revertedWith(
            'UniswapV2Library: INSUFFICIENT_OUTPUT_AMOUNT'
        )
        await expect(router.getAmountIn(bigNumberify(1), bigNumberify(0), bigNumberify(100))).to.be.revertedWith(
            'UniswapV2Library: INSUFFICIENT_LIQUIDITY'
        )
        await expect(router.getAmountIn(bigNumberify(1), bigNumberify(100), bigNumberify(0))).to.be.revertedWith(
            'UniswapV2Library: INSUFFICIENT_LIQUIDITY'
        )
    })

    it('getAmountsIn', async () => {
        await token0.approve(router.address, MaxUint256)
        await token1.approve(router.address, MaxUint256)
        await router.addLiquidity(
            token0.address,
            token1.address,
            bigNumberify(10000),
            bigNumberify(10000),
            0,
            0,
            wallet.address,
            MaxUint256,
            overrides
        )

        // await expect(router.getAmountsIn(bigNumberify(1), [token0.address])).to.be.revertedWith(
        //     'UniswapV2Library: INVALID_PATH'
        // )
        // const path = [token0.address, token1.address]
        // expect(await router.getAmountsIn(bigNumberify(1), path)).to.deep.eq([bigNumberify(2), bigNumberify(1)])
    })

    // afterEach(async function() {
    //   expect(await provider.getBalance(router.address)).to.eq(Zero)
    // })
  
    // async function addLiquidity(tokenAmount: BigNumber) {
    //   await fewFactory.createToken(token0.address)
    //   await fewFactory.createToken(token1.address)

    //   const fewWrappedToken0Address = await fewFactory.getWrappedToken(token0.address)
    //   const fewWrappedToken1Address = await fewFactory.getWrappedToken(token1.address)

    //   const fewWrappedToken0 = new Contract(fewWrappedToken0Address, JSON.stringify(FewWrappedToken.abi), provider).connect(wallet)
    //   const fewWrappedToken1 = new Contract(fewWrappedToken1Address, JSON.stringify(FewWrappedToken.abi), provider).connect(wallet)

    //   // await mineBlock(provider, (await provider.getBlock('latest')).timestamp + 1)

    //   await token0.approve(fewWrappedToken0.address, MaxUint256, overrides);
    //   await token1.approve(fewWrappedToken1.address, MaxUint256, overrides);

    //   await fewWrappedToken0.wrap(tokenAmount, overrides)
    //   await fewWrappedToken1.wrap(tokenAmount, overrides)

    //   return { fewWrappedToken0, fewWrappedToken1 }
    // }

    async function getWrappedToken(token: string) {
      const wrappedTokenAddress = await fewFactory.getWrappedToken(token)
      return wrappedTokenAddress
    }

    async function addLiquidity(token0: Contract, token1: Contract, tokenAmount: BigNumber) {
      // addliquidity
      await token0.approve(router.address, MaxUint256)
      await token1.approve(router.address, MaxUint256)
      await router.addLiquidity(
        token0.address,
        token1.address,
        tokenAmount,
        tokenAmount,
        0,
        0,
        wallet.address,
        MaxUint256,
        overrides
      )
    }

    it('addLiquidity', async () => {
      const tokenAmount = expandTo18Decimals(1)

      const tokenA = await deployContract(wallet, ERC20, [expandTo18Decimals(10000)])
      const tokenB = await deployContract(wallet, ERC20, [expandTo18Decimals(10000)])

      let fewWrappedToken0Address: string
      let fewWrappedToken1Address: string
      // before addliquidity
      fewWrappedToken0Address = await getWrappedToken(tokenA.address)
      fewWrappedToken1Address = await getWrappedToken(tokenB.address)
      expect(fewWrappedToken0Address).to.eq(AddressZero)
      expect(fewWrappedToken1Address).to.eq(AddressZero)
      console.log(fewWrappedToken0Address, 'fewWrappedToken0Address')
      console.log(fewWrappedToken1Address, 'fewWrappedToken1Address')

      expect(await tokenA.balanceOf(wallet.address)).to.eq(expandTo18Decimals(10000))
      expect(await tokenB.balanceOf(wallet.address)).to.eq(expandTo18Decimals(10000))
    //   const balanceBeforeA = await tokenA.balanceOf(wallet.address)
    //   const balanceBeforeB = await tokenB.balanceOf(wallet.address)
    //   console.log(balanceBeforeA.toString(), 'a.toString()')
    //   console.log(balanceBeforeB.toString(), 'b.toString()')

      await mineBlock(provider, (await provider.getBlock('latest')).timestamp + 1)
      await addLiquidity(tokenA, tokenB, tokenAmount)
      await mineBlock(provider, (await provider.getBlock('latest')).timestamp + 1)

      const c = await tokenA.balanceOf(wallet.address)
      const d = await tokenB.balanceOf(wallet.address)
      console.log(c.toString(), 'c.toString()')
      console.log(d.toString(), 'd.toString()')

      expect(await tokenA.balanceOf(wallet.address)).to.eq(expandTo18Decimals(10000).sub(tokenAmount))
      expect(await tokenB.balanceOf(wallet.address)).to.eq(expandTo18Decimals(10000).sub(tokenAmount))

      // after addliquidity
      const bytecode = FewWrappedToken.bytecode
      const create2Token0Address = getCreate2Address(fewFactory.address, tokenA.address, bytecode)
      const create2Token1Address = getCreate2Address(fewFactory.address, tokenB.address, bytecode)
      fewWrappedToken0Address = await getWrappedToken(tokenA.address)
      fewWrappedToken1Address = await getWrappedToken(tokenB.address)
      // console.log(fewWrappedToken0Address, 'fewWrappedToken0Address')
      // console.log(fewWrappedToken1Address, 'fewWrappedToken1Address')
      // console.log(create2Token0Address, 'create2Token0Address, fewWrappedToken0Address')
      // console.log(create2Token1Address, 'create2Token1Address, fewWrappedToken1Address')
      expect(create2Token0Address).to.eq(fewWrappedToken0Address)
      expect(create2Token1Address).to.eq(fewWrappedToken1Address)
    })

    
})

describe('fee-on-transfer tokens', () => {
  const provider = new MockProvider({
    hardfork: 'istanbul',
    mnemonic: 'horn horn horn horn horn horn horn horn horn horn horn horn',
    gasLimit: 9999999
  })
  const [wallet] = provider.getWallets()
  const loadFixture = createFixtureLoader(provider, [wallet])

  let DTT: Contract
  let uniswapV2Library: Contract
  let WETH: Contract
  let router: Contract
  let fewRouter: Contract
  let pair: Contract
  let factory: Contract
  let fewFactory: Contract
  beforeEach(async function() {
    const fixture = await loadFixture(v2Fixture)

    WETH = fixture.WETH
    router = fixture.router02
    fewRouter = fixture.fewRouter
    factory = fixture.factoryV2
    fewFactory = fixture.fewFactory
    DTT = await deployContract(wallet, DeflatingERC20, [expandTo18Decimals(10000)])
    uniswapV2Library = await deployContract(wallet, UniswapV2Library, [expandTo18Decimals(10000)])

    await fewFactory.createToken(DTT.address, overrides)
    await fewFactory.createToken(WETH.address, overrides)

    // await factory.createToken(token.address, overrides)
    // const fewWrappedTokenAddress = await factory.getWrappedToken(token.address)
    // const fewWrappedToken = new Contract(fewWrappedTokenAddress, JSON.stringify(FewWrappedToken.abi), provider).connect(wallet)
    const wrappedDTT = fewFactory.getWrappedToken(DTT.address)
    const wrappedWETH = fewFactory.getWrappedToken(WETH.address)

    // make a DTT<>WETH pair

    await fixture.factoryV2.createPair(DTT.address, WETH.address)
    const pairAddress = uniswapV2Library.pairFor(factory, wrappedDTT, wrappedWETH)
    // const pairAddress = await fixture.factoryV2.getPair(DTT.address, WETH.address)
    pair = new Contract(pairAddress, JSON.stringify(IUniswapV2Pair.abi), provider).connect(wallet)
  })

  afterEach(async function() {
    expect(await provider.getBalance(fewRouter.address)).to.eq(0)
  })

  async function addLiquidity(DTTAmount: BigNumber, WETHAmount: BigNumber) {
    await DTT.approve(fewRouter.address, MaxUint256)
    await fewRouter.addLiquidityETH(DTT.address, DTTAmount, DTTAmount, WETHAmount, wallet.address, MaxUint256, {
      ...overrides,
      value: WETHAmount
    })
  }
})
