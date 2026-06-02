import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { createPublicClient, http, formatUnits } from 'viem'
import { sepolia, hardhat } from 'viem/chains'

import TokenBankABI from '../abi/TokenBank.json'
import MyTokenABI from '../abi/MyToken.json'

const TOKEN_BANK_ADDRESS = import.meta.env.VITE_TOKEN_BANK_ADDRESS || '0xbb2ffF75542B7B8540149e09E416b7Ac25791F4b'
const TOKEN_ADDRESS = import.meta.env.VITE_TOKEN_ADDRESS || '0x3D461C94b3B8192f53634aB0a9Ad9A9C85c57903'
const RPC_URL = import.meta.env.VITE_RPC_URL || 'https://sepolia.drpc.org'

const isLocalhost = RPC_URL.includes('localhost') || RPC_URL.includes('127.0.0.1')

export default function useTokenBank(account) {
  const [tokenBalance, setTokenBalance] = useState(0n)
  const [depositedBalance, setDepositedBalance] = useState(0n)
  const [totalDeposits, setTotalDeposits] = useState(0n)
  const [tokenSymbol, setTokenSymbol] = useState('')
  const [tokenDecimals, setTokenDecimals] = useState(18)
  const [allowance, setAllowance] = useState(0n)
  const fetchRef = useRef(null)

  const publicClient = useMemo(
    () =>
      createPublicClient({
        chain: isLocalhost ? hardhat : sepolia,
        transport: http(RPC_URL),
      }),
    [],
  )

  const fetchBalances = useCallback(async () => {
    if (!account) return
    try {
      const [bal, dep, total, symbol, decimals, allow] = await Promise.all([
        publicClient.readContract({
          address: TOKEN_ADDRESS,
          abi: MyTokenABI,
          functionName: 'balanceOf',
          args: [account],
        }),
        publicClient.readContract({
          address: TOKEN_BANK_ADDRESS,
          abi: TokenBankABI,
          functionName: 'balances',
          args: [account],
        }),
        publicClient.readContract({
          address: TOKEN_BANK_ADDRESS,
          abi: TokenBankABI,
          functionName: 'totalDeposits',
        }),
        publicClient.readContract({
          address: TOKEN_ADDRESS,
          abi: MyTokenABI,
          functionName: 'symbol',
        }),
        publicClient.readContract({
          address: TOKEN_ADDRESS,
          abi: MyTokenABI,
          functionName: 'decimals',
        }),
        publicClient.readContract({
          address: TOKEN_ADDRESS,
          abi: MyTokenABI,
          functionName: 'allowance',
          args: [account, TOKEN_BANK_ADDRESS],
        }),
      ])
      setTokenBalance(bal)
      setDepositedBalance(dep)
      setTotalDeposits(total)
      setTokenSymbol(symbol)
      setTokenDecimals(Number(decimals))
      setAllowance(allow)
    } catch (err) {
      console.error('fetchBalances error:', err)
    }
  }, [account, publicClient])

  useEffect(() => {
    fetchRef.current = fetchBalances
  }, [fetchBalances])

  useEffect(() => {
    fetchBalances()
  }, [fetchBalances])

  const formatBalance = useCallback(
    (wei) => formatUnits(wei, tokenDecimals),
    [tokenDecimals],
  )

  return {
    tokenBalance,
    depositedBalance,
    totalDeposits,
    tokenSymbol,
    tokenDecimals,
    allowance,
    tokenAddress: TOKEN_ADDRESS,
    tokenBankAddress: TOKEN_BANK_ADDRESS,
    fetchBalances,
    formatBalance,
  }
}
