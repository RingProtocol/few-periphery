import chai, { expect } from 'chai'
import { Wallet, Contract } from 'ethers'
import { BigNumber, bigNumberify, defaultAbiCoder, formatEther } from 'ethers/utils'
import { Web3Provider } from 'ethers/providers'
import { MockProvider, createFixtureLoader, deployContract } from 'ethereum-waffle'
import { v2Fixture } from './shared/fixtures'
import { expandTo18Decimals, mineBlock } from './shared/utilities'
import { AddressZero, Zero, MaxUint256 } from 'ethers/constants'
import FewWrappedToken from './shared/contractBuild/FewWrappedToken.json'
import FewFactory from './shared/contractBuild/FewFactory.json'
import Core from './shared/contractBuild/Core.json'
import ERC20 from '../build/ERC20.json'
import FewV1Router from '../build/FewV1Router.json'

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

      core = await deployContract(wallet, Core, [], overrides)
      await core.init() // initialize the core

      fewFactory = await deployContract(wallet, FewFactory, [core.address], overrides)
    })
  
    afterEach(async function() {
      expect(await provider.getBalance(router.address)).to.eq(Zero)
    })
  
    async function addLiquidity(tokenAmount: BigNumber) {
      await fewFactory.createToken(token0.address)
      await fewFactory.createToken(token1.address)

      const fewWrappedToken0Address = await fewFactory.getWrappedToken(token0.address)
      const fewWrappedToken1Address = await fewFactory.getWrappedToken(token1.address)

      const fewWrappedToken0 = new Contract(fewWrappedToken0Address, JSON.stringify(FewWrappedToken.abi), provider).connect(wallet)
      const fewWrappedToken1 = new Contract(fewWrappedToken1Address, JSON.stringify(FewWrappedToken.abi), provider).connect(wallet)

      // await mineBlock(provider, (await provider.getBlock('latest')).timestamp + 1)

      await token0.approve(fewWrappedToken0.address, MaxUint256, overrides);
      await token1.approve(fewWrappedToken1.address, MaxUint256, overrides);

      await fewWrappedToken0.wrap(tokenAmount, overrides)
      await fewWrappedToken1.wrap(tokenAmount, overrides)

      return { fewWrappedToken0, fewWrappedToken1 }
    }

    it('few addLiquidity', async () => {
        // const value = expandTo18Decimals(2)
        const tokenAmount = expandTo18Decimals(1)
        
        // await token0.transfer(pair.address, tokenAmount)
        // await token1.transfer(pair.address, tokenAmount)


        expect(await token0.balanceOf(wallet.address)).to.eq(expandTo18Decimals(10000))
        expect(await token1.balanceOf(wallet.address)).to.eq(expandTo18Decimals(10000))

        await token0.approve(router.address, MaxUint256)
        await token1.approve(router.address, MaxUint256)
    
        // await addLiquidity(tokenAmount)

        const { fewWrappedToken0, fewWrappedToken1 } = await addLiquidity(tokenAmount)
        expect(await fewWrappedToken0.balanceOf(wallet.address)).to.eq(tokenAmount)
        expect(await fewWrappedToken1.balanceOf(wallet.address)).to.eq(tokenAmount)

        await fewWrappedToken0.approve(router.address, MaxUint256)
        await fewWrappedToken1.approve(router.address, MaxUint256)
        // await router.addLiquidity(
        //   fewWrappedToken0.address,
        //   fewWrappedToken1.address,
        //   tokenAmount,
        //   tokenAmount,
        //   0,
        //   0,
        //   wallet.address,
        //   MaxUint256,
        //   overrides
        // )
      })
  
    // it('swapExactTokensForTokens', async () => {
    //   // ... Test for swapping tokens
    // })
  
    // // ... Additional test cases for other functions
  
    // it('should allow token to token swap', async () => {
    //   const tokenAmount = expandTo18Decimals(5)
    //   const expectedOutputAmount = expandTo18Decimals(1) // Example value
  
    //   await token0.approve(router.address, tokenAmount)
    //   await expect(
    //     router.swapExactTokensForTokens(
    //       tokenAmount,
    //       expectedOutputAmount,
    //       [token0.address, token1.address],
    //       wallet.address,
    //       overrides
    //     )
    //   ).to.be.revertedWith('FewV1Router: INSUFFICIENT_OUTPUT_AMOUNT') // Example expected revert message
    // })
  
    // Add more test cases for each function in FewV1Router that you want to test
  })
  
