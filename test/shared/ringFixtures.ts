import { Wallet, Contract } from 'ethers'
import { Web3Provider } from 'ethers/providers'
import { deployContract } from 'ethereum-waffle'

import { expandTo18Decimals } from './utilities'

import RingV2Factory from './contractBuild/RingV2Factory.json'
import FewFactory from './contractBuild/FewFactory.json'
import IUniswapV2Pair from '@uniswap/v2-core/build/IUniswapV2Pair.json'
import IFewWrappedToken from './contractBuild/IFewWrappedToken.json'
import FewWrappedToken from './contractBuild/FewWrappedToken.json'

import ERC20 from '../../build/ERC20.json'
import WETH9 from '../../build/WETH9.json'
import DeflatingERC20 from '../../build/DeflatingERC20.json'
import RingRouter from '../../build/RingRouter.json'
import FewETHWrapper from '../../build/FewETHWrapper.json'

import RouterEventEmitter from '../../build/RouterEventEmitter.json'

const overrides = {
  gasLimit: 9999999
}

interface V2Fixture {
  token0: Contract
  token1: Contract
  tokenB: Contract
  tokenC: Contract
  tokenD: Contract
  DTT: Contract
  WETH: Contract
  WETHPartner: Contract
  fewWrappedWETHPartner: Contract
  factoryV2: Contract
  fewFactory: Contract
  ringRouter: Contract
  fewETHWrapper: Contract
  fwWETH: Contract
  routerEventEmitter: Contract
  pair: Contract
  WETHPair: Contract
  fewWrappedToken0: Contract
  fewWrappedToken1: Contract
  fewWrappedTokenB: Contract
  fewWrappedDTT: Contract
  fewWrappedTokenABPair: Contract
  fewWrappedWETHPair: Contract
  fewWrappedDTTPair: Contract
  fewWrappedWETHDTTPair: Contract
  fewWrappedToken0OriginalToken: Contract
  fewWrappedToken1OriginalToken: Contract
  fewWrappedDTTPairDTT: Contract
  fewWrappedDTTPairOriginalToken1: Contract
}

export async function v2Fixture(provider: Web3Provider, [wallet]: Wallet[]): Promise<V2Fixture> {
  // deploy tokens
  const tokenA = await deployContract(wallet, ERC20, [expandTo18Decimals(10000)])
  const tokenB = await deployContract(wallet, ERC20, [expandTo18Decimals(10000)])
  const tokenC = await deployContract(wallet, ERC20, [expandTo18Decimals(10000)])
  const tokenD = await deployContract(wallet, ERC20, [expandTo18Decimals(10000)])
  const DTT = await deployContract(wallet, DeflatingERC20, [expandTo18Decimals(10000)])
  const WETH = await deployContract(wallet, WETH9)
  const WETHPartner = await deployContract(wallet, ERC20, [expandTo18Decimals(10000)])

  // deploy V2
  const ringFactoryV2 = await deployContract(wallet, RingV2Factory, [wallet.address])

  //deploy Few Factory
  const fewFactory = await deployContract(wallet, FewFactory, [wallet.address])

  await fewFactory.createToken(WETH.address);
  const fwWETHAddress = await fewFactory.getWrappedToken(WETH.address)
  const fwWETH = new Contract(fwWETHAddress, JSON.stringify(IFewWrappedToken.abi), provider).connect(wallet)

  const ringRouter = await deployContract(wallet, RingRouter, [ringFactoryV2.address, WETH.address, fewFactory.address, fwWETH.address], overrides)
  const fewETHWrapper = await deployContract(wallet, FewETHWrapper, [WETH.address, fwWETH.address], overrides)

  // event emitter for testing
  const routerEventEmitter = await deployContract(wallet, RouterEventEmitter, [])

  await ringFactoryV2.setPermittedAccount(ringRouter.address, true)
  await ringFactoryV2.setPermittedAccount(wallet.address, true)
  await ringRouter.setPermittedAccount(wallet.address, true)

  // initialize V2
  await ringFactoryV2.createPair(tokenA.address, tokenB.address)
  const pairAddress = await ringFactoryV2.getPair(tokenA.address, tokenB.address)
  const pair = new Contract(pairAddress, JSON.stringify(IUniswapV2Pair.abi), provider).connect(wallet)

  const token0Address = await pair.token0()
  const token0 = tokenA.address === token0Address ? tokenA : tokenB
  const token1 = tokenA.address === token0Address ? tokenB : tokenA

  await ringFactoryV2.createPair(WETH.address, WETHPartner.address)
  const WETHPairAddress = await ringFactoryV2.getPair(WETH.address, WETHPartner.address)
  const WETHPair = new Contract(WETHPairAddress, JSON.stringify(IUniswapV2Pair.abi), provider).connect(wallet)

  // initialize Few
  await fewFactory.createToken(tokenA.address)
  await fewFactory.createToken(tokenB.address)
  await fewFactory.createToken(WETHPartner.address)
  await fewFactory.createToken(DTT.address)

  const wrappedTokenAAddress = await fewFactory.getWrappedToken(tokenA.address)
  const wrappedTokenBAddress = await fewFactory.getWrappedToken(tokenB.address)
  const wrappedWETHPartnerAddress = await fewFactory.getWrappedToken(WETHPartner.address)
  const wrappedDTTAddress = await fewFactory.getWrappedToken(DTT.address)

  const fewWrappedTokenA = new Contract(wrappedTokenAAddress, JSON.stringify(FewWrappedToken.abi), provider).connect(wallet)
  const fewWrappedTokenB = new Contract(wrappedTokenBAddress, JSON.stringify(FewWrappedToken.abi), provider).connect(wallet)
  const fewWrappedWETHPartner = new Contract(wrappedWETHPartnerAddress, JSON.stringify(FewWrappedToken.abi), provider).connect(wallet)
  const fewWrappedDTT = new Contract(wrappedDTTAddress, JSON.stringify(FewWrappedToken.abi), provider).connect(wallet)

  // crate fewWrapped pairs
  await ringFactoryV2.createPair(fewWrappedTokenA.address, fewWrappedTokenB.address)
  const fewWrappedTokenABPairAddress = await ringFactoryV2.getPair(fewWrappedTokenA.address, fewWrappedTokenB.address)
  const fewWrappedTokenABPair = new Contract(fewWrappedTokenABPairAddress, JSON.stringify(IUniswapV2Pair.abi), provider).connect(wallet)

  await ringFactoryV2.createPair(fwWETH.address, fewWrappedWETHPartner.address)
  const fewWrappedWETHPairAddress = await ringFactoryV2.getPair(fwWETH.address, fewWrappedWETHPartner.address)
  const fewWrappedWETHPair = new Contract(fewWrappedWETHPairAddress, JSON.stringify(IUniswapV2Pair.abi), provider).connect(wallet)

  await ringFactoryV2.createPair(fewWrappedDTT.address, fewWrappedTokenB.address)
  const fewWrappedDTTPairAddress = await ringFactoryV2.getPair(fewWrappedDTT.address, fewWrappedTokenB.address)
  const fewWrappedDTTPair = new Contract(fewWrappedDTTPairAddress, JSON.stringify(IUniswapV2Pair.abi), provider).connect(wallet)

  await ringFactoryV2.createPair(fwWETH.address, fewWrappedDTT.address)
  const fewWrappedWETHDTTPairAddress = await ringFactoryV2.getPair(fwWETH.address, fewWrappedDTT.address)
  const fewWrappedWETHDTTPair = new Contract(fewWrappedWETHDTTPairAddress, JSON.stringify(IUniswapV2Pair.abi), provider).connect(wallet)

  // sort wrappedTokens
  const fewWrappedToken0Address = await fewWrappedTokenABPair.token0()
  const fewWrappedToken0 = fewWrappedTokenA.address === fewWrappedToken0Address ? fewWrappedTokenA : fewWrappedTokenB
  const fewWrappedToken1 = fewWrappedTokenA.address === fewWrappedToken0Address ? fewWrappedTokenB : fewWrappedTokenA

  const fewWrappedToken0OriginalTokenAddress = await fewWrappedToken0.token()
  const fewWrappedToken1OriginalTokenAddress = await fewWrappedToken1.token()

  const fewWrappedToken0OriginalToken = new Contract(fewWrappedToken0OriginalTokenAddress, JSON.stringify(ERC20.abi), provider).connect(wallet)
  const fewWrappedToken1OriginalToken = new Contract(fewWrappedToken1OriginalTokenAddress, JSON.stringify(ERC20.abi), provider).connect(wallet)

  const fewWrappedDTTPairToken0Address = await fewWrappedDTTPair.token0()
  const fewWrappedDTTPairToken0 = fewWrappedDTT.address === fewWrappedDTTPairToken0Address ? fewWrappedDTT : fewWrappedTokenB
  const fewWrappedDTTPairToken1 = fewWrappedDTT.address === fewWrappedDTTPairToken0Address ? fewWrappedTokenB : fewWrappedDTT

  const fewWrappedDTTPairToken0OriginalTokenAddress = await fewWrappedDTTPairToken0.token()
  const fewWrappedDTTPairToken1OriginalTokenAddress = await fewWrappedDTTPairToken1.token()

  const fewWrappedDTTPairOriginalToken1 = new Contract(fewWrappedDTTPairToken0OriginalTokenAddress, JSON.stringify(DeflatingERC20.abi), provider).connect(wallet)
  const fewWrappedDTTPairDTT = new Contract(fewWrappedDTTPairToken1OriginalTokenAddress, JSON.stringify(ERC20.abi), provider).connect(wallet)

  return {
    token0,
    token1,
    tokenB,
    tokenC,
    tokenD,
    DTT,
    WETH,
    WETHPartner,
    fewWrappedWETHPartner,
    factoryV2: ringFactoryV2,
    fewFactory,
    ringRouter,
    fewETHWrapper,
    fwWETH,
    routerEventEmitter,
    pair,
    WETHPair,
    fewWrappedToken0,
    fewWrappedToken1,
    fewWrappedTokenB,
    fewWrappedDTT,
    fewWrappedTokenABPair,
    fewWrappedWETHPair,
    fewWrappedDTTPair,
    fewWrappedWETHDTTPair,
    fewWrappedToken0OriginalToken,
    fewWrappedToken1OriginalToken,
    fewWrappedDTTPairDTT,
    fewWrappedDTTPairOriginalToken1
  }
}
