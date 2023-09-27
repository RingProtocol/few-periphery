import chai, { expect } from 'chai'
import { Contract } from 'ethers'
import { bigNumberify } from 'ethers/utils'
import { solidity, MockProvider, createFixtureLoader, deployContract } from 'ethereum-waffle'
import { expandTo18Decimals, getCreate2Address } from './shared/utilities'
import { factoryFixture } from './shared/fewFixtures'

import FewWrappedToken from './shared/contractBuild/FewWrappedToken.json'
import ERC20 from '../build/ERC20.json'

chai.use(solidity)

const TEST_ADDRESSES: [string, string] = [
  '0x1000000000000000000000000000000000000000',
  '0x2000000000000000000000000000000000000000'
]

describe('FewFactory', () => {
  const provider = new MockProvider({
    hardfork: 'istanbul',
    mnemonic: 'horn horn horn horn horn horn horn horn horn horn horn horn',
    gasLimit: 9999999
  })
  const [wallet, other] = provider.getWallets()
  const loadFixture = createFixtureLoader(provider, [wallet, other])

  let factory: Contract
  let token: Contract
  beforeEach(async () => {
    const fixture = await loadFixture(factoryFixture)
    factory = fixture.factory

    token = await deployContract(wallet, ERC20, [expandTo18Decimals(10000)])
  })

  it('allWrappedTokensLength', async () => {
    expect(await factory.allWrappedTokensLength()).to.eq(0)
  })

  async function testToken(tokenAddress: string): Promise<{ name?: string, symbol?: string, error?: any }> {
    const tokenContract = new Contract(tokenAddress, ERC20.abi, wallet);
    try {
        const name = await tokenContract.name();
        const symbol = await tokenContract.symbol();
        return { name, symbol };
    } catch (error) {
        return { error };
    }
  }

  async function createWrappedToken(tokenAddress: string) {
    const bytecode = FewWrappedToken.bytecode
    const create2Address = getCreate2Address(factory.address, tokenAddress, bytecode)

    await expect(factory.createToken(tokenAddress))
      .to.emit(factory, 'WrappedTokenCreated')
    .withArgs(tokenAddress, create2Address, bigNumberify(1))

    await expect(factory.createToken(TEST_ADDRESSES[0])).to.be.reverted // token not been deployed
    expect(await factory.getWrappedToken(tokenAddress)).to.eq(create2Address)
    expect(await factory.allWrappedTokensLength()).to.eq(1)

  }

  describe('testToken Verification', async () => {
    it('should fail for non-deployed contract', async () => {
      const error = await testToken(TEST_ADDRESSES[0])
      expect(error.error).to.be.an('Error');
      expect(error.error.reason).to.include('contract not deployed')
    })

    it('should success for deployed contract', async () => {
      const result = await testToken(token.address);
      expect(result.name).to.equal('Test Token');
      expect(result.symbol).to.equal('TT');
    })
  })

  it('createWrappedToken', async () => {
    await createWrappedToken(token.address);
  });

  it('createWrappedToken:gas', async () => {
    const tx = await factory.createToken(token.address);
    const receipt = await tx.wait();
    expect(receipt.gasUsed).to.eq(1273049)
  });
})
