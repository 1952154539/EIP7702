import { useState, useCallback, useMemo } from 'react'
import {
  createPublicClient,
  createWalletClient,
  http,
  encodeFunctionData,
  parseUnits,
  encodeAbiParameters,
  parseAbiParameters,
} from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { signAuthorization } from 'viem/experimental'
import { sepolia } from 'viem/chains'

import EIP7702DelegatorABI from '../abi/EIP7702Delegator.json'
import TokenBankABI from '../abi/TokenBank.json'
import MyTokenABI from '../abi/MyToken.json'

const DELEGATOR_ADDRESS = '0x63c0c19a282a1B52b07dD5a65b58948A07DAE32B'
const RPC_URL = import.meta.env.VITE_RPC_URL || 'https://sepolia.drpc.org'

export default function useEIP7702() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [txHash, setTxHash] = useState('')
  const [isDelegated, setIsDelegated] = useState(false)

  const publicClient = useMemo(
    () =>
      createPublicClient({
        chain: sepolia,
        transport: http(RPC_URL),
      }),
    [],
  )

  const checkDelegation = useCallback(
    async (eoaAddress) => {
      if (!eoaAddress) return false
      try {
        const code = await publicClient.getCode({ address: eoaAddress })
        const delegated = code && code.startsWith('0xef01')
        setIsDelegated(delegated)
        return delegated
      } catch {
        return false
      }
    },
    [publicClient],
  )

  const delegateAndDeposit = useCallback(
    async (privateKey, tokenAddress, tokenBankAddress, amount, tokenDecimals) => {
      if (!privateKey || !tokenAddress || !tokenBankAddress) return

      setLoading(true)
      setError('')
      setTxHash('')

      try {
        const account = privateKeyToAccount(privateKey)
        const walletClient = createWalletClient({
          account,
          chain: sepolia,
          transport: http(RPC_URL),
        })

        const nonce = await publicClient.getTransactionCount({
          address: account.address,
        })

        // Step 1: Sign EIP-7702 authorization
        const authorization = await signAuthorization(walletClient, {
          contractAddress: DELEGATOR_ADDRESS,
          chainId: sepolia.id,
          nonce,
        })

        // Step 2: Encode approve calldata
        const amountWei = parseUnits(amount, tokenDecimals)
        const approveData = encodeFunctionData({
          abi: MyTokenABI,
          functionName: 'approve',
          args: [tokenBankAddress, amountWei],
        })

        // Step 3: Encode deposit calldata
        const depositData = encodeFunctionData({
          abi: TokenBankABI,
          functionName: 'deposit',
          args: [amountWei],
        })

        // Step 4: Encode batched execute([approve, deposit]) for Delegator
        const executeData = encodeFunctionData({
          abi: EIP7702DelegatorABI,
          functionName: 'execute',
          args: [
            [
              { to: tokenAddress, value: 0n, data: approveData },
              { to: tokenBankAddress, value: 0n, data: depositData },
            ],
          ],
        })

        // Step 5: Send EIP-7702 SetCodeTx
        const hash = await walletClient.sendTransaction({
          account,
          to: account.address,
          authorizationList: [authorization],
          data: executeData,
          chain: sepolia,
        })

        setTxHash(hash)

        // Wait for receipt
        await publicClient.waitForTransactionReceipt({ hash })
        setIsDelegated(true)

        return hash
      } catch (err) {
        const msg = err.message || ''
        if (msg.includes('User rejected')) {
          setError('用户取消了交易')
        } else {
          setError('EIP-7702 交易失败: ' + (msg.length > 100 ? msg.slice(0, 100) + '...' : msg))
        }
        throw err
      } finally {
        setLoading(false)
      }
    },
    [publicClient],
  )

  const executeBatch = useCallback(
    async (privateKey, calls) => {
      if (!privateKey) return

      setLoading(true)
      setError('')
      setTxHash('')

      try {
        const account = privateKeyToAccount(privateKey)
        const walletClient = createWalletClient({
          account,
          chain: sepolia,
          transport: http(RPC_URL),
        })

        const executeData = encodeFunctionData({
          abi: EIP7702DelegatorABI,
          functionName: 'execute',
          args: [calls],
        })

        const hash = await walletClient.sendTransaction({
          account,
          to: account.address,
          data: executeData,
          chain: sepolia,
        })

        setTxHash(hash)
        await publicClient.waitForTransactionReceipt({ hash })
        return hash
      } catch (err) {
        setError('批量交易失败: ' + err.message)
        throw err
      } finally {
        setLoading(false)
      }
    },
    [publicClient],
  )

  return {
    loading,
    error,
    txHash,
    isDelegated,
    checkDelegation,
    delegateAndDeposit,
    executeBatch,
    delegatorAddress: DELEGATOR_ADDRESS,
  }
}
