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

const DELEGATOR_ADDRESS = '0xb1cE7f79d6c0789e00DE7927214b48bddb8e43de'
const TOKEN_ADDRESS = '0x3D461C94b3B8192f53634aB0a9Ad9A9C85c57903'
const TOKEN_BANK_ADDRESS = '0xbb2ffF75542B7B8540149e09E416b7Ac25791F4b'

const MyTokenABI = [
  { type: 'function', name: 'approve', inputs: [
    { name: 'spender', type: 'address' },
    { name: 'amount', type: 'uint256' },
  ], outputs: [{ type: 'bool' }], stateMutability: 'nonpayable' },
  { type: 'function', name: 'balanceOf', inputs: [
    { name: 'account', type: 'address' },
  ], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'allowance', inputs: [
    { name: 'owner', type: 'address' },
    { name: 'spender', type: 'address' },
  ], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
]

const TokenBankABI = [
  { type: 'function', name: 'deposit', inputs: [
    { name: 'amount', type: 'uint256' },
  ], outputs: [], stateMutability: 'nonpayable' },
  { type: 'function', name: 'balances', inputs: [
    { name: '', type: 'address' },
  ], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'totalDeposits', inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
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

  // Check initial state
  const nonce = await publicClient.getTransactionCount({ address: account.address })
  console.log('Nonce:', nonce)

  const initialBal = await publicClient.readContract({
    address: TOKEN_ADDRESS, abi: MyTokenABI, functionName: 'balanceOf', args: [account.address],
  })
  console.log('Initial token balance:', initialBal.toString())

  const initialBank = await publicClient.readContract({
    address: TOKEN_BANK_ADDRESS, abi: TokenBankABI, functionName: 'balances', args: [account.address],
  })
  console.log('Initial bank balance:', initialBank.toString())

  const amountWei = parseUnits('100', 18)
  console.log('Deposit amount: 100 MTK')

  // 1. Sign EIP-7702 authorization
  console.log('Signing authorization with SimpleBatchDelegator...')
  const authorization = await signAuthorization(walletClient, {
    contractAddress: DELEGATOR_ADDRESS,
    chainId: sepolia.id,
    nonce,
  })
  console.log('Authorization signed')

  // 2. Encode approve + deposit into batch execute
  const approveData = encodeFunctionData({
    abi: MyTokenABI, functionName: 'approve', args: [TOKEN_BANK_ADDRESS, amountWei],
  })
  const depositData = encodeFunctionData({
    abi: TokenBankABI, functionName: 'deposit', args: [amountWei],
  })

  const executeData = encodeFunctionData({
    abi: DelegatorABI, functionName: 'execute',
    args: [[
      { to: TOKEN_ADDRESS, value: 0n, data: approveData },
      { to: TOKEN_BANK_ADDRESS, value: 0n, data: depositData },
    ]],
  })

  // 3. Send EIP-7702 SetCodeTx
  console.log('Sending EIP-7702 SetCodeTx...')
  const hash = await walletClient.sendTransaction({
    account,
    to: account.address,
    authorizationList: [authorization],
    data: executeData,
    chain: sepolia,
  })
  console.log('Transaction hash:', hash)
  console.log('Explorer:', `https://sepolia.etherscan.io/tx/${hash}`)

  // 4. Wait for receipt
  console.log('Waiting for confirmation...')
  const receipt = await publicClient.waitForTransactionReceipt({ hash })
  console.log('Status:', receipt.status)
  console.log('Block:', receipt.blockNumber)

  // 5. Verify results
  const code = await publicClient.getCode({ address: account.address })
  console.log('EOA code after delegation:', code)

  const finalBank = await publicClient.readContract({
    address: TOKEN_BANK_ADDRESS, abi: TokenBankABI, functionName: 'balances', args: [account.address],
  })
  console.log('Final bank balance:', finalBank.toString())

  const finalBal = await publicClient.readContract({
    address: TOKEN_ADDRESS, abi: MyTokenABI, functionName: 'balanceOf', args: [account.address],
  })
  console.log('Final token balance:', finalBal.toString())

  const totalDep = await publicClient.readContract({
    address: TOKEN_BANK_ADDRESS, abi: TokenBankABI, functionName: 'totalDeposits',
  })
  console.log('Bank total deposits:', totalDep.toString())

  const finalNonce = await publicClient.getTransactionCount({ address: account.address })
  console.log('Final nonce:', finalNonce)
  console.log('Nonce consumed (should be 2):', finalNonce - nonce)
}

main().catch(console.error)
