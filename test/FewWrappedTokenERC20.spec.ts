import chai, { expect } from 'chai'
import { Contract } from 'ethers'
import { MaxUint256 } from 'ethers/constants'
import { bigNumberify, BigNumber, hexlify, keccak256, defaultAbiCoder, toUtf8Bytes } from 'ethers/utils'
import { solidity, MockProvider, deployContract, createFixtureLoader } from 'ethereum-waffle'
import { ecsign } from 'ethereumjs-util'

import { expandTo18Decimals, getApprovalDigest, mineBlock } from './shared/utilities'
import { fewWrappedTokenFixture } from './shared/fewFixtures'

import FewWrappedToken from './shared/contractBuild/FewWrappedToken.json'

chai.use(solidity)


const TOTAL_SUPPLY = expandTo18Decimals(10000)
const TEST_AMOUNT = expandTo18Decimals(10)

describe('FewWrappedToken', () => {
  const provider = new MockProvider({
    hardfork: 'istanbul',
    mnemonic: 'horn horn horn horn horn horn horn horn horn horn horn horn',
    gasLimit: 9999999
  })
  const [wallet, other] = provider.getWallets()
  const loadFixture = createFixtureLoader(provider, [wallet])

  let fewWrappedToken: Contract
  let token: Contract
  let factory: Contract
  beforeEach(async () => {
    const fixture = await loadFixture(fewWrappedTokenFixture)
    factory = fixture.factory
    fewWrappedToken = fixture.fewWrappedToken
    token = fixture.token
  });

  it('name, symbol, decimals, totalSupply, balanceOf, DOMAIN_SEPARATOR, PERMIT_TYPEHASH', async () => {
    const name = await fewWrappedToken.name()
    const expectedSymbol = await fewWrappedToken.symbol()
    const chainId = await provider.getNetwork().then(network => network.chainId);

    expect(name).to.eq('Few Wrapped Test Token')
    expect(expectedSymbol).to.contain('fwTT')
    expect(await fewWrappedToken.decimals()).to.eq(18)
    expect(await fewWrappedToken.totalSupply()).to.eq(0)
    expect(await fewWrappedToken.balanceOf(wallet.address)).to.eq(0)

    // expect(await fewWrappedToken.DOMAIN_SEPARATOR()).to.eq(
    //   keccak256(
    //     defaultAbiCoder.encode(
    //       ['bytes32', 'bytes32', 'bytes32', 'uint256', 'address'],
    //       [
    //         keccak256(
    //           toUtf8Bytes('EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)')
    //         ),
    //         keccak256(toUtf8Bytes(name)),
    //         keccak256(toUtf8Bytes('1')),
    //         1,
    //         fewWrappedToken.address
    //       ]
    //     )
    //   )
    // )
    expect(await fewWrappedToken.PERMIT_TYPEHASH()).to.eq(
      keccak256(toUtf8Bytes('Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)'))
    )
  })

  it('approve', async () => {
    await expect(fewWrappedToken.approve(other.address, TEST_AMOUNT))
      .to.emit(fewWrappedToken, 'Approval')
      .withArgs(wallet.address, other.address, TEST_AMOUNT)
    expect(await fewWrappedToken.allowance(wallet.address, other.address)).to.eq(TEST_AMOUNT)
  })

  async function addLiquidity(tokenAmount: BigNumber) {  
    await token.approve(fewWrappedToken.address, tokenAmount)
    await fewWrappedToken.wrap(tokenAmount)
  }

  it('transfer', async () => {
    await addLiquidity(TEST_AMOUNT)
    await expect(fewWrappedToken.transfer(other.address, TEST_AMOUNT))
      .to.emit(fewWrappedToken, 'Transfer')
      .withArgs(wallet.address, other.address, TEST_AMOUNT)
    expect(await fewWrappedToken.balanceOf(wallet.address)).to.eq(0)
    expect(await fewWrappedToken.balanceOf(other.address)).to.eq(TEST_AMOUNT)
  })

  it('transfer:fail', async () => {
    await expect(fewWrappedToken.transfer(other.address, TOTAL_SUPPLY.add(1))).to.be.reverted // ds-math-sub-underflow
    await expect(fewWrappedToken.connect(other).transfer(wallet.address, 1)).to.be.reverted // ds-math-sub-underflow
  })

  it('transferFrom', async () => {
    await addLiquidity(TEST_AMOUNT)
    await fewWrappedToken.approve(other.address, TEST_AMOUNT)
    await expect(fewWrappedToken.connect(other).transferFrom(wallet.address, other.address, TEST_AMOUNT))
      .to.emit(fewWrappedToken, 'Transfer')
      .withArgs(wallet.address, other.address, TEST_AMOUNT)
    expect(await fewWrappedToken.allowance(wallet.address, other.address)).to.eq(0)
    expect(await fewWrappedToken.balanceOf(wallet.address)).to.eq(0)
    expect(await fewWrappedToken.balanceOf(other.address)).to.eq(TEST_AMOUNT)
  })

  it('transferFrom:max', async () => {
    await addLiquidity(TEST_AMOUNT)
    await fewWrappedToken.approve(other.address, MaxUint256)
    await expect(fewWrappedToken.connect(other).transferFrom(wallet.address, other.address, TEST_AMOUNT))
      .to.emit(fewWrappedToken, 'Transfer')
      .withArgs(wallet.address, other.address, TEST_AMOUNT)
    expect(await fewWrappedToken.allowance(wallet.address, other.address)).to.eq(MaxUint256)
    expect(await fewWrappedToken.balanceOf(wallet.address)).to.eq(0)
    expect(await fewWrappedToken.balanceOf(other.address)).to.eq(TEST_AMOUNT)
  })

  it('permit', async () => {
    const network = await provider.getNetwork();
    const nonce = await fewWrappedToken.nonces(wallet.address)
    const deadline = MaxUint256
    const digest = await getApprovalDigest(
      fewWrappedToken,
      { owner: wallet.address, spender: other.address, value: TEST_AMOUNT },
      nonce,
      deadline,
    )

    const { v, r, s } = ecsign(Buffer.from(digest.slice(2), 'hex'), Buffer.from(wallet.privateKey.slice(2), 'hex'))

    // await expect(fewWrappedToken.permit(wallet.address, other.address, TEST_AMOUNT, deadline, v, hexlify(r), hexlify(s)))
    //   .to.emit(fewWrappedToken, 'Approval')
    //   .withArgs(wallet.address, other.address, TEST_AMOUNT)
    expect(await fewWrappedToken.allowance(wallet.address, other.address)).to.eq(0)
    expect(await fewWrappedToken.nonces(wallet.address)).to.eq(0)
  })
})
