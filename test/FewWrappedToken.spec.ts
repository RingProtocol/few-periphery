import chai, { expect } from 'chai'
import { Contract } from 'ethers'
import { solidity, MockProvider, createFixtureLoader } from 'ethereum-waffle'
import { BigNumber, bigNumberify } from 'ethers/utils'

import { expandTo18Decimals, mineBlock, encodePrice } from './shared/utilities'
import { fewWrappedTokenFixture } from './shared/fewFixtures'

import { AddressZero } from 'ethers/constants'
import FewFactory from './shared/contractBuild/FewFactory.json'

const MINIMUM_LIQUIDITY = bigNumberify(10).pow(3)

chai.use(solidity)

const overrides = {
  gasLimit: 9999999
}

describe('FewWrappedToken', () => {
  const provider = new MockProvider({
    hardfork: 'istanbul',
    mnemonic: 'horn horn horn horn horn horn horn horn horn horn horn horn',
    gasLimit: 9999999
  })
  const [wallet, other] = provider.getWallets()
  const loadFixture = createFixtureLoader(provider, [wallet])

  let factory: Contract
  let token: Contract
  let fewWrappedToken: Contract
  beforeEach(async () => {
    const fixture = await loadFixture(fewWrappedTokenFixture)
    factory = fixture.factory
    token = fixture.token
    fewWrappedToken = fixture.fewWrappedToken
  })

  it('wrap', async () => {
    const tokenAmount = expandTo18Decimals(5)
    await token.transfer(fewWrappedToken.address, tokenAmount, overrides)
    await mineBlock(provider, (await provider.getBlock('latest')).timestamp + 1)

    await token.approve(fewWrappedToken.address, tokenAmount, overrides);

    const expectedLiquidity = expandTo18Decimals(5)
    await expect(fewWrappedToken.wrap(tokenAmount, overrides))
    .to.emit(fewWrappedToken, 'Transfer')
    .withArgs(AddressZero, wallet.address, tokenAmount)
    .to.emit(fewWrappedToken, 'Wrap')
    .withArgs(wallet.address, tokenAmount)

    expect(await fewWrappedToken.totalSupply()).to.eq(expectedLiquidity)
    expect(await fewWrappedToken.balanceOf(wallet.address)).to.eq(tokenAmount)
    expect(await token.balanceOf(wallet.address)).to.eq(expandTo18Decimals(10000).sub(tokenAmount.add(tokenAmount)))
    expect(await token.balanceOf(fewWrappedToken.address)).to.eq(tokenAmount.add(tokenAmount))
  })

  // async function addLiquidity(tokenAmount: BigNumber) {
  //   await token.transfer(fewWrappedToken.address, tokenAmount)
  //   await fewWrappedToken.mint(wallet.address, overrides)
  // }

  async function wrap(tokenAmount: BigNumber) {
    await token.approve(fewWrappedToken.address, tokenAmount, overrides);
    await fewWrappedToken.wrap(tokenAmount, overrides)
  }

  // async function wrap(tokenAmount: BigNumber) {
  //   console.log("Before approval: Token balance of wallet", (await token.balanceOf(wallet.address)).toString());

  //   await token.approve(fewWrappedToken.address, tokenAmount, overrides);
    
  //   console.log("After approval: Token balance of wallet", (await token.balanceOf(wallet.address)).toString());

  //   await fewWrappedToken.wrap(tokenAmount, overrides);

  //   console.log("After wrap: Token balance of wallet", (await token.balanceOf(wallet.address)).toString());
  //   console.log("After wrap: FewWrappedToken balance of wallet", (await fewWrappedToken.balanceOf(wallet.address)).toString());
  // }

  async function unwrap(tokenAmount: BigNumber) {
    await fewWrappedToken.approve(fewWrappedToken.address, tokenAmount, overrides);
    await fewWrappedToken.unwrap(tokenAmount, overrides)
  }

  it('unwrap', async () => {
    const tokenAmount = expandTo18Decimals(3)
    // expect(await token.balanceOf(wallet.address)).to.eq(expandTo18Decimals(10000))
    await wrap(tokenAmount)
    // await token.approve(fewWrappedToken.address, tokenAmount, overrides);
    // await fewWrappedToken.wrap(tokenAmount, overrides)
    expect(await fewWrappedToken.balanceOf(wallet.address)).to.eq(tokenAmount)
    expect(await token.balanceOf(wallet.address)).to.eq(expandTo18Decimals(10000).sub(tokenAmount))
    expect(await fewWrappedToken.balanceOf(fewWrappedToken.address)).to.eq(0)
    expect(await token.balanceOf(fewWrappedToken.address)).to.eq(tokenAmount)

    // await fewWrappedToken.approve(fewWrappedToken.address, tokenAmount, overrides);
    const expectedLiquidity = expandTo18Decimals(3)
    
    await expect(fewWrappedToken.unwrap(tokenAmount, overrides))
    .to.emit(fewWrappedToken, 'Transfer')
    .withArgs(wallet.address, AddressZero, tokenAmount)
    .to.emit(token, 'Transfer')
    .withArgs(fewWrappedToken.address, wallet.address, tokenAmount)
    .to.emit(fewWrappedToken, 'Unwrap')
    .withArgs(wallet.address, tokenAmount)

    expect(await fewWrappedToken.balanceOf(wallet.address)).to.eq(0)
    expect(await fewWrappedToken.totalSupply()).to.eq(0)
    expect(await token.balanceOf(fewWrappedToken.address)).to.eq(0)
    const totalSupplyToken = await token.totalSupply()
    expect(await token.balanceOf(wallet.address)).to.eq(totalSupplyToken)
  })

  it('fewWrappedToken mint', async () => {
    const mintAmount = expandTo18Decimals(1);

    const coreAddress = await factory.core()
    console.log(coreAddress, 'coreAddress')
    console.log(wallet.address, 'wallet address')

    // await fewWrappedToken.mint(wallet.address, mintAmount);

    // Assumption: wallet is the deployer of the FewWrappedToken contract
    // Hence, only the wallet should be able to call mint successfully.
    
    // await fewWrappedToken.mint(wallet.address, mintAmount, overrides)
    // await expect(fewWrappedToken.mint(wallet.address, mintAmount, overrides))
    //   .to.emit(fewWrappedToken, 'Transfer')
    //   .withArgs(AddressZero, wallet.address, mintAmount);
  
    // expect(await fewWrappedToken.balanceOf(wallet.address)).to.eq(mintAmount);
  
    // // Attempting mint operation from another account should fail
    // const otherWalletAddress = await other.getAddress();
    // await expect(fewWrappedToken.connect(other).mint(otherWalletAddress, mintAmount)).to.be.revertedWith("Caller is not the deployer");

  });
  
  // it('mint', async () => {
  //   const token0Amount = expandTo18Decimals(1)
  //   const token1Amount = expandTo18Decimals(4)
  //   await token0.transfer(pair.address, token0Amount)
  //   await token1.transfer(pair.address, token1Amount)

  //   const expectedLiquidity = expandTo18Decimals(2)
  //   await expect(pair.mint(wallet.address, overrides))
  //     .to.emit(pair, 'Transfer')
  //     .withArgs(AddressZero, AddressZero, MINIMUM_LIQUIDITY)
  //     .to.emit(pair, 'Transfer')
  //     .withArgs(AddressZero, wallet.address, expectedLiquidity.sub(MINIMUM_LIQUIDITY))
  //     .to.emit(pair, 'Sync')
  //     .withArgs(token0Amount, token1Amount)
  //     .to.emit(pair, 'Mint')
  //     .withArgs(wallet.address, token0Amount, token1Amount)

  //   expect(await pair.totalSupply()).to.eq(expectedLiquidity)
  //   expect(await pair.balanceOf(wallet.address)).to.eq(expectedLiquidity.sub(MINIMUM_LIQUIDITY))
  //   expect(await token0.balanceOf(pair.address)).to.eq(token0Amount)
  //   expect(await token1.balanceOf(pair.address)).to.eq(token1Amount)
  //   const reserves = await pair.getReserves()
  //   expect(reserves[0]).to.eq(token0Amount)
  //   expect(reserves[1]).to.eq(token1Amount)
  // })

  // it('burn', async () => {
  //   const tokenAmount = expandTo18Decimals(3);

  //   // 1. Mint some wrapped tokens first, assuming you have enough balance
  //   await fewWrappedToken.mint(wallet.address, tokenAmount, overrides);

  //   // 2. Check initial balances before burn
  //   expect(await token.balanceOf(wallet.address)).to.eq(expandTo18Decimals(10000).sub(tokenAmount)); // Assuming you started with 10,000 tokens
  //   expect(await fewWrappedToken.balanceOf(wallet.address)).to.eq(tokenAmount);

  //   // 3. Approve the burn and then burn
  //   await fewWrappedToken.approve(fewWrappedToken.address, tokenAmount, overrides);
  //   await expect(fewWrappedToken.burn(tokenAmount, overrides))
  //     .to.emit(fewWrappedToken, 'Transfer')
  //     .withArgs(wallet.address, AddressZero, tokenAmount)
  //     .to.emit(fewWrappedToken, 'Burning')
  //     .withArgs(wallet.address, tokenAmount);

  //   // 4. Check final balances after burn
  //   expect(await fewWrappedToken.balanceOf(wallet.address)).to.eq(0);
  //   expect(await token.balanceOf(wallet.address)).to.eq(expandTo18Decimals(10000)); // Your initial balance should be restored
  // })

  // it('burn', async () => {
  //   const token0Amount = expandTo18Decimals(3)
  //   const token1Amount = expandTo18Decimals(3)
  //   await addLiquidity(token0Amount, token1Amount)

  //   const expectedLiquidity = expandTo18Decimals(3)
  //   await pair.transfer(pair.address, expectedLiquidity.sub(MINIMUM_LIQUIDITY))
  //   await expect(pair.burn(wallet.address, overrides))
  //     .to.emit(pair, 'Transfer')
  //     .withArgs(pair.address, AddressZero, expectedLiquidity.sub(MINIMUM_LIQUIDITY))
  //     .to.emit(token0, 'Transfer')
  //     .withArgs(pair.address, wallet.address, token0Amount.sub(1000))
  //     .to.emit(token1, 'Transfer')
  //     .withArgs(pair.address, wallet.address, token1Amount.sub(1000))
  //     .to.emit(pair, 'Sync')
  //     .withArgs(1000, 1000)
  //     .to.emit(pair, 'Burn')
  //     .withArgs(wallet.address, token0Amount.sub(1000), token1Amount.sub(1000), wallet.address)

  //   expect(await pair.balanceOf(wallet.address)).to.eq(0)
  //   expect(await pair.totalSupply()).to.eq(MINIMUM_LIQUIDITY)
  //   expect(await token0.balanceOf(pair.address)).to.eq(1000)
  //   expect(await token1.balanceOf(pair.address)).to.eq(1000)
  //   const totalSupplyToken0 = await token0.totalSupply()
  //   const totalSupplyToken1 = await token1.totalSupply()
  //   expect(await token0.balanceOf(wallet.address)).to.eq(totalSupplyToken0.sub(1000))
  //   expect(await token1.balanceOf(wallet.address)).to.eq(totalSupplyToken1.sub(1000))
  // })
})
