import {
  createPublicClient,
  createWalletClient,
  http,
  encodeFunctionData,
  parseUnits,
} from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { signAuthorization } from 'viem/experimental'
import { sepolia } from 'viem/chains'

const PRIVATE_KEY = process.env.PRIVATE_KEY
const RPC_URL = 'https://ethereum-sepolia-rpc.publicnode.com'

const DELEGATOR_ADDRESS = '0x63c0c19a282a1B52b07dD5a65b58948A07DAE32B'
const TOKEN_ADDRESS = '0x3D461C94b3B8192f53634aB0a9Ad9A9C85c57903'
const TOKEN_BANK_ADDRESS = '0xbb2ffF75542B7B8540149e09E416b7Ac25791F4b'

const MyTokenABI = [
  { type: 'function', name: 'approve', inputs: [
    { name: 'spender', type: 'address' },
    { name: 'amount', type: 'uint256' },
  ], outputs: [{ type: 'bool' }], stateMutability: 'nonpayable' },
]

const TokenBankABI = [
  { type: 'function', name: 'deposit', inputs: [
    { name: 'amount', type: 'uint256' },
  ], outputs: [], stateMutability: 'nonpayable' },
]

const DelegatorABI = [
  {
    type: 'function', name: 'execute',
    inputs: [{
      name: 'calls', type: 'tuple[]',
      components: [
        { name: 'to', type: 'address' },
        { name: 'value', type: 'uint256' },
        { name: 'data', type: 'bytes' },
      ],
    }],
    outputs: [{ name: 'results', type: 'bytes[]' }],
    stateMutability: 'payable',
  },
]

async function main() {
  const account = privateKeyToAccount(PRIVATE_KEY)
  console.log('EOA Address:', account.address)

  const publicClient = createPublicClient({ chain: sepolia, transport: http(RPC_URL) })
  const walletClient = createWalletClient({ account, chain: sepolia, transport: http(RPC_URL) })

  const nonce = await publicClient.getTransactionCount({ address: account.address })
  console.log('Nonce:', nonce)

  const amountWei = parseUnits('100', 18) // 100 MTK
  console.log('Amount: 100 MTK')

  // 1. Sign EIP-7702 authorization
  console.log('Signing authorization...')
  const authorization = await signAuthorization(walletClient, {
    contractAddress: DELEGATOR_ADDRESS,
    chainId: sepolia.id,
    nonce,
  })
  console.log('Authorization signed')

  // 2. Encode approve
  const approveData = encodeFunctionData({
    abi: MyTokenABI,
    functionName: 'approve',
    args: [TOKEN_BANK_ADDRESS, amountWei],
  })

  // 3. Encode deposit
  const depositData = encodeFunctionData({
    abi: TokenBankABI,
    functionName: 'deposit',
    args: [amountWei],
  })

  // 4. Encode batch execute
  const executeData = encodeFunctionData({
    abi: DelegatorABI,
    functionName: 'execute',
    args: [[
      { to: TOKEN_ADDRESS, value: 0n, data: approveData },
      { to: TOKEN_BANK_ADDRESS, value: 0n, data: depositData },
    ]],
  })

  // 5. Send EIP-7702 transaction
  console.log('Sending EIP-7702 transaction...')
  const hash = await walletClient.sendTransaction({
    account,
    to: account.address,
    authorizationList: [authorization],
    data: executeData,
    chain: sepolia,
  })
  console.log('Transaction hash:', hash)
  console.log('Explorer:', `https://sepolia.etherscan.io/tx/${hash}`)

  // 6. Wait for receipt
  console.log('Waiting for receipt...')
  const receipt = await publicClient.waitForTransactionReceipt({ hash })
  console.log('Receipt status:', receipt.status)
  console.log('Block number:', receipt.blockNumber)

  // 7. Check delegation
  const code = await publicClient.getCode({ address: account.address })
  console.log('EOA code (delegation):', code)

  // 8. Check deposit
  const deposit = await publicClient.readContract({
    address: TOKEN_BANK_ADDRESS,
    abi: TokenBankABI,
    functionName: 'balances',
    args: [account.address],
  })
  console.log('Bank balance:', deposit.toString())
}

main().catch(console.error)
