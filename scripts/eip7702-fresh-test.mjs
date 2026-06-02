import {
  createPublicClient,
  createWalletClient,
  http,
  encodeFunctionData,
  parseUnits,
  parseEther,
} from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { signAuthorization } from 'viem/experimental'
import { sepolia } from 'viem/chains'

const MAIN_PK = process.env.PRIVATE_KEY
const FRESH_PK = '0x1d3119bb3f2060c1f338e0c442dd5ad1958e26ea0ea452c95fb98d605a1924ec'
const RPC_URL = 'https://ethereum-sepolia-rpc.publicnode.com'

const DELEGATOR_ADDRESS = '0xb1cE7f79d6c0789e00DE7927214b48bddb8e43de'
const TOKEN_ADDRESS = '0x3D461C94b3B8192f53634aB0a9Ad9A9C85c57903'
const TOKEN_BANK_ADDRESS = '0xbb2ffF75542B7B8540149e09E416b7Ac25791F4b'

const MyTokenABI = [
  { type: 'function', name: 'approve', inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [{ type: 'bool' }], stateMutability: 'nonpayable' },
  { type: 'function', name: 'balanceOf', inputs: [{ name: 'account', type: 'address' }], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'transfer', inputs: [{ name: 'to', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [{ type: 'bool' }], stateMutability: 'nonpayable' },
]

const TokenBankABI = [
  { type: 'function', name: 'deposit', inputs: [{ name: 'amount', type: 'uint256' }], outputs: [], stateMutability: 'nonpayable' },
  { type: 'function', name: 'balances', inputs: [{ name: '', type: 'address' }], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'totalDeposits', inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
]

const DelegatorABI = [
  { type: 'function', name: 'execute', inputs: [{ name: 'calls', type: 'tuple[]', components: [
    { name: 'to', type: 'address' }, { name: 'value', type: 'uint256' }, { name: 'data', type: 'bytes' }
  ]}], outputs: [{ name: 'results', type: 'bytes[]' }], stateMutability: 'payable' },
]

async function main() {
  const mainAccount = privateKeyToAccount(MAIN_PK)
  const freshAccount = privateKeyToAccount(FRESH_PK)
  const freshAddr = freshAccount.address
  console.log('Main account:', mainAccount.address)
  console.log('Fresh EOA:', freshAddr)

  const publicClient = createPublicClient({ chain: sepolia, transport: http(RPC_URL) })
  const mainWallet = createWalletClient({ account: mainAccount, chain: sepolia, transport: http(RPC_URL) })
  const freshWallet = createWalletClient({ account: freshAccount, chain: sepolia, transport: http(RPC_URL) })

  // Step 1: Fund fresh account with ETH
  console.log('\n1. Sending 0.02 ETH to fresh account...')
  const ethHash = await mainWallet.sendTransaction({
    to: freshAddr,
    value: parseEther('0.02'),
  })
  await publicClient.waitForTransactionReceipt({ hash: ethHash })
  console.log('ETH transfer:', ethHash)

  // Step 2: Fund fresh account with MTK tokens
  console.log('\n2. Sending 1000 MTK to fresh account...')
  const tokHash = await mainWallet.writeContract({
    address: TOKEN_ADDRESS,
    abi: MyTokenABI,
    functionName: 'transfer',
    args: [freshAddr, parseUnits('1000', 18)],
  })
  await publicClient.waitForTransactionReceipt({ hash: tokHash })
  console.log('Token transfer:', tokHash)

  // Check balances
  const ethBal = await publicClient.getBalance({ address: freshAddr })
  const tokBal = await publicClient.readContract({ address: TOKEN_ADDRESS, abi: MyTokenABI, functionName: 'balanceOf', args: [freshAddr] })
  console.log('Fresh ETH balance:', ethBal.toString())
  console.log('Fresh MTK balance:', tokBal.toString())

  // Step 3: EIP-7702 - delegate + approve + deposit
  console.log('\n3. EIP-7702: Delegate + Approve + Deposit (100 MTK)...')
  const nonce = await publicClient.getTransactionCount({ address: freshAddr })
  console.log('Fresh nonce:', nonce)

  const amountWei = parseUnits('100', 18)

  const authorization = await signAuthorization(freshWallet, {
    contractAddress: DELEGATOR_ADDRESS,
    chainId: sepolia.id,
    nonce,
  })

  const approveData = encodeFunctionData({ abi: MyTokenABI, functionName: 'approve', args: [TOKEN_BANK_ADDRESS, amountWei] })
  const depositData = encodeFunctionData({ abi: TokenBankABI, functionName: 'deposit', args: [amountWei] })

  const executeData = encodeFunctionData({
    abi: DelegatorABI, functionName: 'execute',
    args: [[
      { to: TOKEN_ADDRESS, value: 0n, data: approveData },
      { to: TOKEN_BANK_ADDRESS, value: 0n, data: depositData },
    ]],
  })

  const hash = await freshWallet.sendTransaction({
    account: freshAccount,
    to: freshAddr,
    authorizationList: [authorization],
    data: executeData,
    chain: sepolia,
    gas: 300000n,
  })
  console.log('EIP-7702 tx hash:', hash)
  console.log('Explorer:', `https://sepolia.etherscan.io/tx/${hash}`)

  const receipt = await publicClient.waitForTransactionReceipt({ hash })
  console.log('Status:', receipt.status)
  console.log('Gas used:', receipt.gasUsed)

  // Step 4: Verify
  console.log('\n4. Verifying...')
  const code = await publicClient.getCode({ address: freshAddr })
  console.log('EOA delegation code:', code)

  const bankBal = await publicClient.readContract({ address: TOKEN_BANK_ADDRESS, abi: TokenBankABI, functionName: 'balances', args: [freshAddr] })
  console.log('Bank balance:', bankBal.toString())

  const finalTokBal = await publicClient.readContract({ address: TOKEN_ADDRESS, abi: MyTokenABI, functionName: 'balanceOf', args: [freshAddr] })
  console.log('Remaining MTK:', finalTokBal.toString())

  const totalDep = await publicClient.readContract({ address: TOKEN_BANK_ADDRESS, abi: TokenBankABI, functionName: 'totalDeposits' })
  console.log('Bank total deposits:', totalDep.toString())

  const finalNonce = await publicClient.getTransactionCount({ address: freshAddr })
  console.log('Final nonce:', finalNonce, '(started at', nonce, ')')
}

main().catch(console.error)
