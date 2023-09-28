import chai, { expect } from 'chai'
import { solidity, MockProvider, createFixtureLoader, deployContract } from 'ethereum-waffle'
import { Contract } from 'ethers'
import { BigNumber, bigNumberify } from 'ethers/utils'
import { MaxUint256 } from 'ethers/constants'
import IUniswapV2Pair from '@uniswap/v2-core/build/IUniswapV2Pair.json'
import FewWrappedToken from './shared/contractBuild/FewWrappedToken.json'

import { v2Fixture } from './shared/fixtures'
import { expandTo18Decimals } from './shared/utilities'

import DeflatingERC20 from '../build/DeflatingERC20.json'
import Core from './shared/contractBuild/Core.json'

chai.use(solidity)

const overrides = {
  gasLimit: 9999999
}

describe('UniswapV2Router02', () => {
  const provider = new MockProvider({
    hardfork: 'istanbul',
    mnemonic: 'horn horn horn horn horn horn horn horn horn horn horn horn',
    gasLimit: 9999999
  })
  const [wallet] = provider.getWallets()
  const loadFixture = createFixtureLoader(provider, [wallet])

  let token0: Contract
  let fewWrappedToken0: Contract
  let token1: Contract
  let fewWrappedToken1: Contract
  let router: Contract
  let WETH: Contract
  let WETHPartner: Contract
  let factory: Contract
  let fewFactory: Contract
  let core: Contract
  let pair: Contract
  let WETHPair: Contract
  let fewRouterFeeOnTransfer: Contract
  beforeEach(async function() {
    const fixture = await loadFixture(v2Fixture)
    token0 = fixture.token0
    fewWrappedToken0= fixture.fewWrappedToken0
    token1 = fixture.token1
    fewWrappedToken1 = fixture.fewWrappedToken1
    WETH = fixture.WETH
    WETHPartner = fixture.WETHPartner
    factory = fixture.factoryV2
    router = fixture.fewRouter
    fewRouterFeeOnTransfer = fixture.fewRouterFeeOnTransfer
    pair = fixture.pair
    WETHPair = fixture.WETHPair
    fewFactory = fixture.fewFactory

    core = await deployContract(wallet, Core, [], overrides)
    await core.init() // initialize the core
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

  it('getAmountsOut', async () => {
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

    await expect(router.getAmountsOut(bigNumberify(2), [fewWrappedToken0.address])).to.be.revertedWith(
      'UniswapV2Library: INVALID_PATH'
    )
    const path = [fewWrappedToken0.address, fewWrappedToken1.address]
    expect(await router.getAmountsOut(bigNumberify(2), path)).to.deep.eq([bigNumberify(2), bigNumberify(1)])
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

    await expect(router.getAmountsIn(bigNumberify(1), [fewWrappedToken0.address])).to.be.revertedWith(
      'UniswapV2Library: INVALID_PATH'
    )
    const path = [fewWrappedToken0.address, fewWrappedToken1.address]
    expect(await router.getAmountsIn(bigNumberify(1), path)).to.deep.eq([bigNumberify(2), bigNumberify(1)])
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
  let wrappedDTT: Contract
  let WETH: Contract
  let fwWETH: Contract
  let router: Contract
  let fewRouterFeeOnTransfer: Contract
  let fewRouter: Contract
  let fewFactory: Contract
  let pair: Contract
  let wrappedPair: Contract
  beforeEach(async function() {
    const fixture = await loadFixture(v2Fixture)

    WETH = fixture.WETH
    fwWETH = fixture.fwWETH
    router = fixture.router02
    fewRouter = fixture.fewRouter
    fewFactory = fixture.fewFactory
    fewRouterFeeOnTransfer = fixture.fewRouterFeeOnTransfer

    DTT = await deployContract(wallet, DeflatingERC20, [expandTo18Decimals(10000)])
    await fewFactory.createToken(DTT.address);
    const wrappedDTTAddress = await fewFactory.getWrappedToken(DTT.address)
    wrappedDTT = new Contract(wrappedDTTAddress, JSON.stringify(FewWrappedToken.abi), provider).connect(wallet)

    // make a DTT<>WETH pair
    await fixture.factoryV2.createPair(wrappedDTT.address, fwWETH.address)
    const pairAddress = await fixture.factoryV2.getPair(DTT.address, WETH.address)
    const wrappedpairAddress = await fixture.factoryV2.getPair(wrappedDTT.address, fwWETH.address)

    pair = new Contract(pairAddress, JSON.stringify(IUniswapV2Pair.abi), provider).connect(wallet)
    wrappedPair = new Contract(wrappedpairAddress, JSON.stringify(IUniswapV2Pair.abi), provider).connect(wallet)
  })

  afterEach(async function() {
    expect(await provider.getBalance(fewRouter.address)).to.eq(0)
  })

  async function addLiquidity(DTTAmount: BigNumber, fwWETHAmount: BigNumber) {
    await WETH.deposit({ value: fwWETHAmount })

    await DTT.approve(wrappedDTT.address, DTTAmount, overrides)
    await WETH.approve(fwWETH.address, fwWETHAmount, overrides)
    
    await wrappedDTT.wrap(DTTAmount, overrides)
    await fwWETH.wrap(fwWETHAmount, overrides)

    await wrappedDTT.transfer(wrappedPair.address, DTTAmount)
    await fwWETH.transfer(wrappedPair.address, fwWETHAmount)

    await wrappedDTT.approve(wrappedPair.address, MaxUint256)
    await fwWETH.approve(wrappedPair.address, MaxUint256)

    await wrappedPair.mint(wallet.address, overrides)
  }

  it('removeLiquidityETHSupportingFeeOnTransferTokens', async () => {
    const wrappedDTTAmount = expandTo18Decimals(1)
    const fwWETHAmount = expandTo18Decimals(4)

    await addLiquidity(wrappedDTTAmount, fwWETHAmount)

    const wrappedDTTInPair = await wrappedDTT.balanceOf(wrappedPair.address)
    const wrappedWETHInPair = await fwWETH.balanceOf(wrappedPair.address)
    const wrappedLiquidity = await wrappedPair.balanceOf(wallet.address)

    const wrappedTotalSupply = await wrappedPair.totalSupply()
    const wrappedNaiveDTTExpected = wrappedDTTInPair.mul(wrappedLiquidity).div(wrappedTotalSupply)
    const wrappedWETHExpected = wrappedWETHInPair.mul(wrappedLiquidity).div(wrappedTotalSupply)

    await wrappedPair.approve(fewRouter.address, MaxUint256)
    await wrappedPair.approve(fewRouterFeeOnTransfer.address, MaxUint256)

    await wrappedDTT.approve(fewRouter.address, MaxUint256)
    await wrappedDTT.approve(fewRouterFeeOnTransfer.address, MaxUint256)

    await fwWETH.approve(fewRouter.address, MaxUint256)
    await fwWETH.approve(fewRouterFeeOnTransfer.address, MaxUint256)

    await WETH.approve(fewRouter.address, MaxUint256)
    await DTT.approve(fewRouterFeeOnTransfer.address, MaxUint256)

    await WETH.deposit({ value: fwWETHAmount })

    await fewRouterFeeOnTransfer.removeLiquidityETHSupportingFeeOnTransferTokens(
      wrappedDTT.address,
      wrappedLiquidity,
      wrappedNaiveDTTExpected,
      wrappedWETHExpected,
      wallet.address,
      MaxUint256,
      overrides
    )
  })

  describe('swapExactTokensForTokensSupportingFeeOnTransferTokens', () => {
    const DTTAmount = expandTo18Decimals(5)
      .mul(100)
      .div(99)
    const ETHAmount = expandTo18Decimals(10)
    const amountIn = expandTo18Decimals(1)

    beforeEach(async () => {
      await addLiquidity(DTTAmount, ETHAmount)
    })

    it('DTT -> WETH', async () => {
      await DTT.approve(fewRouterFeeOnTransfer.address, MaxUint256)
      await wrappedDTT.approve(fewRouterFeeOnTransfer.address, MaxUint256)

      await fewRouterFeeOnTransfer.swapExactTokensForTokensSupportingFeeOnTransferTokens(
        amountIn,
        0,
        [wrappedDTT.address, fwWETH.address],
        wallet.address,
        MaxUint256,
        overrides
      )
    })

    // WETH -> DTT
    it('WETH -> DTT', async () => {
      
      await WETH.deposit({ value: amountIn }) // mint WETH
      await WETH.approve(fewRouterFeeOnTransfer.address, MaxUint256)

      await WETH.approve(fewRouterFeeOnTransfer.address, MaxUint256)
      await fwWETH.approve(fewRouterFeeOnTransfer.address, MaxUint256)

      await fewRouterFeeOnTransfer.swapExactTokensForTokensSupportingFeeOnTransferTokens(
        amountIn,
        0,
        [fwWETH.address, wrappedDTT.address],
        wallet.address,
        MaxUint256,
        overrides
      )
    })
  })

  // ETH -> DTT
  it('swapExactETHForTokensSupportingFeeOnTransferTokens', async () => {
    const DTTAmount = expandTo18Decimals(10)
      .mul(100)
      .div(99)
    const ETHAmount = expandTo18Decimals(5)
    const swapAmount = expandTo18Decimals(1)
    await addLiquidity(DTTAmount, ETHAmount)

    await fewRouterFeeOnTransfer.swapExactETHForTokensSupportingFeeOnTransferTokens(
      0,
      [fwWETH.address, wrappedDTT.address],
      wallet.address,
      MaxUint256,
      {
        ...overrides,
        value: swapAmount
      }
    )
  })

  // DTT -> ETH
  it('swapExactTokensForETHSupportingFeeOnTransferTokens', async () => {
    const DTTAmount = expandTo18Decimals(5)
      .mul(100)
      .div(99)
    const ETHAmount = expandTo18Decimals(10)
    const swapAmount = expandTo18Decimals(1)

    await addLiquidity(DTTAmount, ETHAmount)
    await wrappedDTT.approve(fewRouterFeeOnTransfer.address, MaxUint256)
    await DTT.approve(fewRouterFeeOnTransfer.address, MaxUint256)

    await fewRouterFeeOnTransfer.swapExactTokensForETHSupportingFeeOnTransferTokens(
      swapAmount,
      0,
      [wrappedDTT.address, fwWETH.address],
      wallet.address,
      MaxUint256,
      overrides
    )
  })
})

describe('fee-on-transfer tokens: reloaded', () => {
  const provider = new MockProvider({
    hardfork: 'istanbul',
    mnemonic: 'horn horn horn horn horn horn horn horn horn horn horn horn',
    gasLimit: 9999999
  })
  const [wallet] = provider.getWallets()
  const loadFixture = createFixtureLoader(provider, [wallet])

  let DTT: Contract
  let DTT2: Contract
  let fewWrappedDTT: Contract
  let fewWrappedDTT2: Contract
  let router: Contract
  let fewRouterFeeOnTransfer: Contract
  let fewFactory:Contract
  beforeEach(async function() {
    const fixture = await loadFixture(v2Fixture)

    router = fixture.router02
    fewRouterFeeOnTransfer = fixture.fewRouterFeeOnTransfer

    DTT = await deployContract(wallet, DeflatingERC20, [expandTo18Decimals(10000)])
    DTT2 = await deployContract(wallet, DeflatingERC20, [expandTo18Decimals(10000)])

    fewFactory = fixture.fewFactory

    await fewFactory.createToken(DTT.address)
    await fewFactory.createToken(DTT2.address)

    const wrappedDTTAddress = await fewFactory.getWrappedToken(DTT.address)
    const wrappedDTT2Address = await fewFactory.getWrappedToken(DTT2.address)

    fewWrappedDTT = new Contract(wrappedDTTAddress, JSON.stringify(FewWrappedToken.abi), provider).connect(wallet)
    fewWrappedDTT2 = new Contract(wrappedDTT2Address, JSON.stringify(FewWrappedToken.abi), provider).connect(wallet)

    // make a DTT<>WETH pair
    await fixture.factoryV2.createPair(DTT.address, DTT2.address)
    const pairAddress = await fixture.factoryV2.getPair(DTT.address, DTT2.address)
    const wrappedDTTPairAddress = await fixture.factoryV2.getPair(fewWrappedDTT.address, fewWrappedDTT2.address)
  })

  afterEach(async function() {
    expect(await provider.getBalance(fewRouterFeeOnTransfer.address)).to.eq(0)
  })

  async function addLiquidity(DTTAmount: BigNumber, DTT2Amount: BigNumber) {
    await DTT.approve(fewRouterFeeOnTransfer.address, MaxUint256)
    await DTT2.approve(fewRouterFeeOnTransfer.address, MaxUint256)
    await fewWrappedDTT.approve(fewRouterFeeOnTransfer.address, MaxUint256)
    await fewWrappedDTT2.approve(fewRouterFeeOnTransfer.address, MaxUint256)

    await fewRouterFeeOnTransfer.addLiquidity(
      DTT.address,
      DTT2.address,
      DTTAmount,
      DTT2Amount,
      DTTAmount,
      DTT2Amount,
      wallet.address,
      MaxUint256,
      overrides
    )
  }

  describe('swapExactTokensForTokensSupportingFeeOnTransferTokens', () => {
    const DTTAmount = expandTo18Decimals(5)
      .mul(100)
      .div(99)
    const DTT2Amount = expandTo18Decimals(5)
    const amountIn = expandTo18Decimals(1)
    
    beforeEach(async () => {
      await addLiquidity(DTTAmount, DTT2Amount)
    })

    it('DTT -> DTT2', async () => {
      await DTT.approve(fewRouterFeeOnTransfer.address, MaxUint256)
      await DTT2.approve(fewRouterFeeOnTransfer.address, MaxUint256)
      await fewWrappedDTT.approve(fewRouterFeeOnTransfer.address, MaxUint256)
      await fewWrappedDTT2.approve(fewRouterFeeOnTransfer.address, MaxUint256)

      await fewRouterFeeOnTransfer.swapExactTokensForTokensSupportingFeeOnTransferTokens(
        amountIn,
        0,
        [fewWrappedDTT.address, fewWrappedDTT2.address],
        wallet.address,
        MaxUint256,
        overrides
      )
    })
  })
})
