import {
  createPublicClient,
  createWalletClient,
  http,
} from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { signAuthorization } from 'viem/experimental'
import { sepolia } from 'viem/chains'

const FRESH_PK = '0x1d3119bb3f2060c1f338e0c442dd5ad1958e26ea0ea452c95fb98d605a1924ec'
const RPC_URL = 'https://ethereum-sepolia-rpc.publicnode.com'
const DELEGATOR_ADDRESS = '0xb1cE7f79d6c0789e00DE7927214b48bddb8e43de'

async function main() {
  const account = privateKeyToAccount(FRESH_PK)
  console.log('EOA:', account.address)

  const publicClient = createPublicClient({ chain: sepolia, transport: http(RPC_URL) })
  const walletClient = createWalletClient({ account, chain: sepolia, transport: http(RPC_URL) })

  const nonce = await publicClient.getTransactionCount({ address: account.address })
  console.log('Nonce:', nonce)

  // Check existing code
  const codeBefore = await publicClient.getCode({ address: account.address })
  console.log('Code before:', JSON.stringify(codeBefore))

  // Just sign and send delegation, no execute call
  console.log('\nSigning delegation-only authorization...')
  const authorization = await signAuthorization(walletClient, {
    contractAddress: DELEGATOR_ADDRESS,
    chainId: sepolia.id,
    nonce,
  })
  console.log('Authorization signed: chainId', authorization.chainId, 'nonce', authorization.nonce)

  console.log('\nSending EIP-7702 delegation (no execute data)...')
  const hash = await walletClient.sendTransaction({
    account,
    to: account.address,
    authorizationList: [authorization],
    data: '0x',
    gas: 200000n,
  })
  console.log('Hash:', hash)
  console.log('Explorer:', `https://sepolia.etherscan.io/tx/${hash}`)

  const receipt = await publicClient.waitForTransactionReceipt({ hash })
  console.log('Status:', receipt.status)
  console.log('Gas used:', receipt.gasUsed)

  // Check code after
  const codeAfter = await publicClient.getCode({ address: account.address })
  console.log('Code after:', JSON.stringify(codeAfter))

  const nonceAfter = await publicClient.getTransactionCount({ address: account.address })
  console.log('Nonce after:', nonceAfter, '(started at', nonce, ')')
  console.log('Nonce delta:', nonceAfter - nonce)
}

main().catch(console.error)
