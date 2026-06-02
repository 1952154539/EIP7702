import { useState, useMemo, useEffect } from 'react'
import { parseUnits } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'

export default function TokenBank({ bank, eip7702, wallet }) {
  const [amount, setAmount] = useState('')
  const [tab, setTab] = useState('deposit')

  const {
    tokenBalance,
    depositedBalance,
    totalDeposits,
    tokenSymbol,
    tokenDecimals,
    allowance,
    tokenAddress,
    tokenBankAddress,
    fetchBalances,
    formatBalance,
  } = bank

  const {
    loading: eipLoading,
    txHash: eipTxHash,
    error: eipError,
    isDelegated,
    checkDelegation,
    delegateAndDeposit,
  } = eip7702

  const { account, privateKey, setPrivateKey } = wallet

  const eoaFromPk = useMemo(() => {
    if (!privateKey || privateKey.length !== 64) return null
    try {
      return privateKeyToAccount('0x' + privateKey).address
    } catch {
      return null
    }
  }, [privateKey])

  const pkMatchesAccount = account && eoaFromPk && account.toLowerCase() === eoaFromPk.toLowerCase()

  useEffect(() => {
    if (account) {
      checkDelegation(account)
    }
  }, [account, checkDelegation])

  const amountWei = useMemo(() => {
    if (!amount || parseFloat(amount) <= 0) return 0n
    try {
      return parseUnits(amount, tokenDecimals)
    } catch {
      return 0n
    }
  }, [amount, tokenDecimals])

  const needApproval = tab === 'deposit' && amountWei > 0n && allowance < amountWei

  const handleEIP7702Deposit = async () => {
    if (amountWei <= 0n || !privateKey) return
    try {
      await delegateAndDeposit('0x' + privateKey, tokenAddress, tokenBankAddress, amount, tokenDecimals)
      setAmount('')
      await fetchBalances()
    } catch {
      // error handled in hook
    }
  }

  const txLink = eipTxHash
    ? `https://sepolia.etherscan.io/tx/${eipTxHash}`
    : null

  return (
    <div className="w-full max-w-lg mx-auto space-y-6">
      {/* Balances */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-gray-800/50 rounded-xl p-4 border border-gray-700/50">
          <div className="text-gray-400 text-sm mb-1">钱包余额</div>
          <div className="text-2xl font-bold text-white">
            {formatBalance(tokenBalance)} <span className="text-sm text-gray-400">{tokenSymbol}</span>
          </div>
        </div>
        <div className="bg-gray-800/50 rounded-xl p-4 border border-gray-700/50">
          <div className="text-gray-400 text-sm mb-1">存款余额</div>
          <div className="text-2xl font-bold text-green-400">
            {formatBalance(depositedBalance)} <span className="text-sm text-gray-400">{tokenSymbol}</span>
          </div>
        </div>
      </div>

      {/* Delegation Status */}
      {account && (
        <div className={`rounded-lg p-3 text-center border ${isDelegated ? 'bg-green-900/20 border-green-700/50' : 'bg-gray-800/30 border-gray-700/30'}`}>
          <span className="text-gray-400 text-sm">EIP-7702 委托状态: </span>
          <span className={`font-medium text-sm ${isDelegated ? 'text-green-400' : 'text-yellow-400'}`}>
            {isDelegated ? '已委托至 Delegator' : '未委托'}
          </span>
        </div>
      )}

      {/* Total deposits */}
      <div className="bg-gray-800/30 rounded-lg p-3 text-center border border-gray-700/30">
        <span className="text-gray-500 text-sm">Bank 总存款: </span>
        <span className="text-white font-medium">
          {formatBalance(totalDeposits)} {tokenSymbol}
        </span>
      </div>

      {/* EIP-7702 Private Key Input */}
      {account && (
        <div className="bg-gray-800/50 rounded-xl p-4 border border-purple-700/50 space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-purple-400 text-sm font-medium">EIP-7702 私钥</span>
            <span className="text-gray-500 text-xs">（测试网专用，仅本地签名）</span>
          </div>
          <input
            type="password"
            value={privateKey}
            onChange={(e) => setPrivateKey(e.target.value.trim())}
            placeholder="输入 Sepolia 测试账户私钥 (不含 0x 前缀)"
            className="w-full px-4 py-2.5 bg-gray-900 border border-gray-700 rounded-lg text-white placeholder-gray-500 text-sm focus:outline-none focus:border-purple-500 transition-colors font-mono"
          />
          {privateKey && !pkMatchesAccount && (
            <p className="text-yellow-400 text-xs">
              私钥对应地址 ({eoaFromPk ? eoaFromPk.slice(0,6)+'...'+eoaFromPk.slice(-4) : '无效'}) 与当前钱包不匹配
            </p>
          )}
          {pkMatchesAccount && (
            <p className="text-green-400 text-xs">私钥与当前钱包地址匹配</p>
          )}
        </div>
      )}

      {/* Tabs */}
      <div className="flex bg-gray-800 rounded-lg p-1">
        <button
          onClick={() => { setTab('deposit'); setAmount('') }}
          className={`flex-1 py-2 rounded-md text-sm font-medium transition-colors ${
            tab === 'deposit' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'
          }`}
        >
          存款
        </button>
        <button
          onClick={() => { setTab('withdraw'); setAmount('') }}
          className={`flex-1 py-2 rounded-md text-sm font-medium transition-colors ${
            tab === 'withdraw' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'
          }`}
        >
          取款
        </button>
      </div>

      {/* Input */}
      <div className="space-y-3">
        <div>
          <input
            type="number"
            min="0"
            step="any"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder={tab === 'deposit' ? '输入存款金额' : '输入取款金额'}
            className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-colors"
            disabled={eipLoading}
          />
          {tab === 'deposit' && (
            <p className="text-gray-500 text-xs mt-1">
              钱包余额: {formatBalance(tokenBalance)} {tokenSymbol}
            </p>
          )}
          {tab === 'withdraw' && (
            <p className="text-gray-500 text-xs mt-1">
              可提取: {formatBalance(depositedBalance)} {tokenSymbol}
            </p>
          )}
        </div>

        {/* EIP-7702 One-Click Deposit */}
        {tab === 'deposit' && (
          <div className="space-y-2">
            {needApproval && pkMatchesAccount && (
              <button
                onClick={handleEIP7702Deposit}
                disabled={eipLoading || amountWei <= 0n}
                className="w-full py-3 rounded-lg bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 disabled:from-gray-700 disabled:to-gray-700 disabled:text-gray-500 text-white font-medium transition-all"
              >
                {eipLoading ? 'EIP-7702 交易处理中...' : `EIP-7702 一键授权并存款 · 单笔交易`}
              </button>
            )}
            {needApproval && !pkMatchesAccount && (
              <div className="text-center py-2 text-gray-500 text-sm">
                输入匹配的私钥以使用 EIP-7702 单笔交易模式
              </div>
            )}
            {!needApproval && amountWei > 0n && (
              <div className="text-center py-2 text-green-400 text-sm">
                代币已授权，可直接存款（无需 EIP-7702 委托）
              </div>
            )}
          </div>
        )}

        {tab === 'withdraw' && (
          <div className="text-center py-3 text-gray-500 text-sm">
            取款需要 EIP-7702 委托后通过批量交易执行
          </div>
        )}
      </div>

      {/* Transaction link */}
      {txLink && (
        <div className="text-center text-sm">
          <span className="text-gray-400">交易已发送: </span>
          <a
            href={txLink}
            target="_blank"
            rel="noopener noreferrer"
            className="text-purple-400 hover:text-purple-300 break-all font-mono"
          >
            {eipTxHash.slice(0, 10)}...{eipTxHash.slice(-8)}
          </a>
        </div>
      )}

      {/* Error */}
      {eipError && (
        <div className="bg-red-900/30 border border-red-700/50 rounded-lg p-3 text-red-400 text-sm">
          {eipError}
        </div>
      )}

      {/* Refresh */}
      <button
        onClick={fetchBalances}
        className="w-full py-2 text-gray-500 hover:text-gray-300 text-sm transition-colors"
      >
        刷新余额
      </button>
    </div>
  )
}
