import chai, { expect } from 'chai'
import { Wallet, Contract } from 'ethers'
import { Web3Provider } from 'ethers/providers'
import { MockProvider, createFixtureLoader, deployContract } from 'ethereum-waffle'
import { v2Fixture } from './shared/fixtures'
import { expandTo18Decimals } from './shared/utilities'
import { AddressZero, Zero, MaxUint256 } from 'ethers/constants'

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
    })
  
    afterEach(async function() {
      expect(await provider.getBalance(router.address)).to.eq(Zero)
    })
  
    it('addLiquidity', async () => {
        const value = expandTo18Decimals(2)
        const tokenAmount = expandTo18Decimals(1)
        
        await token0.transfer(pair.address, tokenAmount)
        await token1.transfer(pair.address, tokenAmount)
    
        await token0.approve(router.address, tokenAmount)
        await token1.approve(router.address, tokenAmount)
    
        await expect(
          router.addLiquidity(
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
        ).to.emit(router, 'AddLiquidity')
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
  
