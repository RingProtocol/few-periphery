import { Wallet, Contract } from 'ethers'
import { Web3Provider } from 'ethers/providers'
import { deployContract } from 'ethereum-waffle'

import { expandTo18Decimals } from './utilities'

import UniswapV2Factory from '@uniswap/v2-core/build/UniswapV2Factory.json'
import FewFactory from './contractBuild/FewFactory.json'
import IUniswapV2Pair from '@uniswap/v2-core/build/IUniswapV2Pair.json'
import IFewWrappedToken from './contractBuild/IFewWrappedToken.json'
import FewWrappedToken from './contractBuild/FewWrappedToken.json'

import ERC20 from '../../build/ERC20.json'
import WETH9 from '../../build/WETH9.json'
import UniswapV1Exchange from '../../build/UniswapV1Exchange.json'
import UniswapV1Factory from '../../build/UniswapV1Factory.json'
import UniswapV2Router01 from '../../build/UniswapV2Router01.json'
import UniswapV2Migrator from '../../build/UniswapV2Migrator.json'
import UniswapV2Router02 from '../../build/UniswapV2Router02.json'
import FewV1Router from '../../build/FewV1Router.json'
import FewV1RouterFeeOnTransfer from '../../build/FewV1RouterFeeOnTransfer.json'
import RouterEventEmitter from '../../build/RouterEventEmitter.json'

const overrides = {
  gasLimit: 9999999
}

interface FactoryFixture {
  fewFactory: Contract
}

export async function factoryFixture(_: Web3Provider, [wallet]: Wallet[]): Promise<FactoryFixture> {
  const fewFactory = await deployContract(wallet, FewFactory, [wallet.address], overrides)
  return { fewFactory }
}

interface V2Fixture {
  token0: Contract
  token1: Contract
  token: Contract
  WETH: Contract
  WETHPartner: Contract
  fewWrappedWETHPartner: Contract
  factoryV1: Contract
  factoryV2: Contract
  fewFactory: Contract
  router01: Contract
  router02: Contract
  fewRouter: Contract
  fewRouterFeeOnTransfer: Contract
  fwWETH: Contract
  routerEventEmitter: Contract
  router: Contract
  migrator: Contract
  WETHExchangeV1: Contract
  pair: Contract
  WETHPair: Contract
  wrappedTokenAddress: string
  fewWrappedToken: Contract
  fewWrappedToken0: Contract
  fewWrappedToken1: Contract
  wrappedPair: Contract
  wrappedWETHPair: Contract
}

export async function v2Fixture(provider: Web3Provider, [wallet]: Wallet[]): Promise<V2Fixture> {
  const { fewFactory } = await factoryFixture(provider, [wallet])

  // deploy tokens
  const tokenA = await deployContract(wallet, ERC20, [expandTo18Decimals(10000)])
  const tokenB = await deployContract(wallet, ERC20, [expandTo18Decimals(10000)])
  const token = await deployContract(wallet, ERC20, [expandTo18Decimals(10000)])

  const WETH = await deployContract(wallet, WETH9)
  const WETHPartner = await deployContract(wallet, ERC20, [expandTo18Decimals(10000)])

  // deploy V1
  const factoryV1 = await deployContract(wallet, UniswapV1Factory, [])
  await factoryV1.initializeFactory((await deployContract(wallet, UniswapV1Exchange, [])).address)

  // deploy V2
  const factoryV2 = await deployContract(wallet, UniswapV2Factory, [wallet.address])
  // const fewFactory = await deployContract(wallet, FewFactory, [wallet.address])
  await fewFactory.createToken(WETH.address);
  const fwWETHAddress = await fewFactory.getWrappedToken(WETH.address)
  const fwWETH = new Contract(fwWETHAddress, JSON.stringify(IFewWrappedToken.abi), provider).connect(wallet)

  // deploy routers
  const router01 = await deployContract(wallet, UniswapV2Router01, [factoryV2.address, WETH.address], overrides)
  const router02 = await deployContract(wallet, UniswapV2Router02, [factoryV2.address, WETH.address], overrides)
  const fewRouter = await deployContract(wallet, FewV1Router, [factoryV2.address, WETH.address, fewFactory.address, fwWETH.address], overrides)
  const fewRouterFeeOnTransfer = await deployContract(wallet, FewV1RouterFeeOnTransfer, [factoryV2.address, WETH.address, fewFactory.address, fwWETH.address], overrides)

  // event emitter for testing
  const routerEventEmitter = await deployContract(wallet, RouterEventEmitter, [])

  // deploy migrator
  const migrator = await deployContract(wallet, UniswapV2Migrator, [factoryV1.address, router01.address], overrides)

  // initialize V1
  await factoryV1.createExchange(WETHPartner.address, overrides)
  const WETHExchangeV1Address = await factoryV1.getExchange(WETHPartner.address)
  const WETHExchangeV1 = new Contract(WETHExchangeV1Address, JSON.stringify(UniswapV1Exchange.abi), provider).connect(
    wallet
  )

  // initialize V2
  await factoryV2.createPair(tokenA.address, tokenB.address)
  const pairAddress = await factoryV2.getPair(tokenA.address, tokenB.address)
  const pair = new Contract(pairAddress, JSON.stringify(IUniswapV2Pair.abi), provider).connect(wallet)

  const token0Address = await pair.token0()
  const token0 = tokenA.address === token0Address ? tokenA : tokenB
  const token1 = tokenA.address === token0Address ? tokenB : tokenA

  await factoryV2.createPair(WETH.address, WETHPartner.address)
  const WETHPairAddress = await factoryV2.getPair(WETH.address, WETHPartner.address)
  const WETHPair = new Contract(WETHPairAddress, JSON.stringify(IUniswapV2Pair.abi), provider).connect(wallet)

  // const tx = await fewFactory.createToken(token.address);
  // const receipt = await tx.wait()
  // const wrappedTokenaddress = receipt.events[0].args.wrappedToken
  // console.log(receipt.events[0].args.wrappedToken, 'receipt')
  // console.log(wrappedTokenaddress, token.address, 'wrappedTokenaddress, token.address')
  // const address = await fewFactory.getWrappedToken(token.address)
  // console.log(address, 'address')
  // const fewWrappedToken = new Contract(wrappedTokenaddress, JSON.stringify(FewWrappedToken.abi), provider).connect(wallet)
  // const originalTokenFromContract = await fewWrappedToken.getWrappedToken;
  // console.log("Original Token from WrappedToken contract: ", originalTokenFromContract);

  await fewFactory.createToken(token.address)
  await fewFactory.createToken(token0.address)
  await fewFactory.createToken(token1.address)
  await fewFactory.createToken(WETHPartner.address)

  const wrappedTokenAddress = await fewFactory.getWrappedToken(token.address)
  const wrappedToken0 = await fewFactory.getWrappedToken(token0.address)
  const wrappedToken1 = await fewFactory.getWrappedToken(token1.address)
  const wrappedWETHPartner = await fewFactory.getWrappedToken(WETHPartner.address)

  const fewWrappedToken = new Contract(wrappedToken0, JSON.stringify(FewWrappedToken.abi), provider).connect(wallet)
  const fewWrappedToken0 = new Contract(wrappedToken0, JSON.stringify(FewWrappedToken.abi), provider).connect(wallet)
  const fewWrappedToken1 = new Contract(wrappedToken1, JSON.stringify(FewWrappedToken.abi), provider).connect(wallet)
  const fewWrappedWETHPartner = new Contract(wrappedWETHPartner, JSON.stringify(FewWrappedToken.abi), provider).connect(wallet)

  await factoryV2.createPair(fewWrappedToken0.address, fewWrappedToken1.address)
  const wrappedPairAddress = await factoryV2.getPair(fewWrappedToken0.address, fewWrappedToken1.address)
  const wrappedPair = new Contract(wrappedPairAddress, JSON.stringify(IUniswapV2Pair.abi), provider).connect(wallet)

  await factoryV2.createPair(fwWETH.address, fewWrappedWETHPartner.address)
  const wrappedWETHPairAddress = await factoryV2.getPair(fwWETH.address, fewWrappedWETHPartner.address)
  const wrappedWETHPair = new Contract(wrappedWETHPairAddress, JSON.stringify(IUniswapV2Pair.abi), provider).connect(wallet)

  return {
    token0,
    token1,
    token,
    WETH,
    WETHPartner,
    fewWrappedWETHPartner,
    factoryV1,
    factoryV2,
    fewFactory,
    router01,
    router02,
    fewRouter,
    fewRouterFeeOnTransfer,
    fwWETH,
    router: router02, // the default router, 01 had a minor bug
    routerEventEmitter,
    migrator,
    WETHExchangeV1,
    pair,
    WETHPair,
    wrappedTokenAddress,
    fewWrappedToken,
    fewWrappedToken0,
    fewWrappedToken1,
    wrappedPair,
    wrappedWETHPair
  }
}
