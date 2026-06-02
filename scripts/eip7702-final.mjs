import {
  createPublicClient,
  createWalletClient,
  http,
  parseEther,
  parseUnits,
  encodeFunctionData,
} from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { signAuthorization } from 'viem/experimental'
import { sepolia } from 'viem/chains'

const MAIN_PK = process.env.PRIVATE_KEY
const FRESH_PK = '0x0ffcd54d075a5a7f79dee94a53af152aa58fb4f4009d514a085b63df9dd2347e'
const RPC_URL = 'https://sepolia.drpc.org'

const DELEGATOR_ADDRESS = '0xb1cE7f79d6c0789e00DE7927214b48bddb8e43de'
const TOKEN_ADDRESS = '0x3D461C94b3B8192f53634aB0a9Ad9A9C85c57903'
const TOKEN_BANK_ADDRESS = '0xbb2ffF75542B7B8540149e09E416b7Ac25791F4b'

const MyTokenABI = [
  { type: 'function', name: 'approve', inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [{ type: 'bool' }], stateMutability: 'nonpayable' },
  { type: 'function', name: 'balanceOf', inputs: [{ name: 'account', type: 'address' }], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'transfer', inputs: [{ name: 'to', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [{ type: 'bool' }], stateMutability: 'nonpayable' },
  { type: 'function', name: 'allowance', inputs: [{ name: 'owner', type: 'address' }, { name: 'spender', type: 'address' }], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
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
  console.log('Main:', mainAccount.address)
  console.log('Fresh:', freshAddr)

  const publicClient = createPublicClient({ chain: sepolia, transport: http(RPC_URL) })
  const mainWallet = createWalletClient({ account: mainAccount, chain: sepolia, transport: http(RPC_URL) })
  const freshWallet = createWalletClient({ account: freshAccount, chain: sepolia, transport: http(RPC_URL) })

  // Fund fresh account
  console.log('\n1. Funding fresh account (0.02 ETH + 1000 MTK)...')
  const ethHash = await mainWallet.sendTransaction({ to: freshAddr, value: parseEther('0.02') })
  await publicClient.waitForTransactionReceipt({ hash: ethHash })
  console.log('ETH sent')

  const tokHash = await mainWallet.writeContract({
    address: TOKEN_ADDRESS, abi: MyTokenABI, functionName: 'transfer', args: [freshAddr, parseUnits('1000', 18)],
  })
  await publicClient.waitForTransactionReceipt({ hash: tokHash })
  console.log('MTK sent')

  const ethBal = await publicClient.getBalance({ address: freshAddr })
  const tokBal = await publicClient.readContract({ address: TOKEN_ADDRESS, abi: MyTokenABI, functionName: 'balanceOf', args: [freshAddr] })
  console.log('Balance: ETH=', ethBal.toString(), 'MTK=', tokBal.toString())

  // EIP-7702
  console.log('\n2. EIP-7702: Delegate + Approve + Deposit 100 MTK in ONE tx...')
  const startNonce = await publicClient.getTransactionCount({ address: freshAddr })
  console.log('Start nonce:', startNonce)

  const amountWei = parseUnits('100', 18)

  // CRITICAL: when self-sponsoring, auth nonce = account nonce + 1
  const authorization = await signAuthorization(freshWallet, {
    contractAddress: DELEGATOR_ADDRESS,
    chainId: sepolia.id,
    nonce: startNonce + 1,  // auth nonce = account nonce + 1
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
    to: freshAddr,
    authorizationList: [authorization],
    data: executeData,
    gas: 500000n,
  })
  console.log('Tx hash:', hash)
  console.log('Explorer:', `https://sepolia.etherscan.io/tx/${hash}`)

  const receipt = await publicClient.waitForTransactionReceipt({ hash })
  console.log('Status:', receipt.status, 'Gas used:', receipt.gasUsed)

  // Verify
  console.log('\n3. Verifying...')
  const code = await publicClient.getCode({ address: freshAddr })
  console.log('Delegation code:', code)

  const bankBal = await publicClient.readContract({ address: TOKEN_BANK_ADDRESS, abi: TokenBankABI, functionName: 'balances', args: [freshAddr] })
  console.log('Bank balance:', bankBal.toString())

  const finalTokBal = await publicClient.readContract({ address: TOKEN_ADDRESS, abi: MyTokenABI, functionName: 'balanceOf', args: [freshAddr] })
  console.log('Remaining MTK:', finalTokBal.toString())

  const totalDep = await publicClient.readContract({ address: TOKEN_BANK_ADDRESS, abi: TokenBankABI, functionName: 'totalDeposits' })
  console.log('Bank total deposits:', totalDep.toString())

  const endNonce = await publicClient.getTransactionCount({ address: freshAddr })
  console.log('Nonce:', startNonce, '→', endNonce, '(delta:', endNonce - startNonce, ')')

  if (bankBal > 0n) {
    console.log('\n✓ EIP-7702 SUCCESS! 100 MTK deposited in a single atomic transaction!')
  }
}

main().catch(console.error)
