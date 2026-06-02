import useWallet from './hooks/useWallet'
import useTokenBank from './hooks/useTokenBank'
import useEIP7702 from './hooks/useEIP7702'
import WalletConnect from './components/WalletConnect'
import TokenBank from './components/TokenBank'

export default function App() {
  const wallet = useWallet()
  const { account, chainId, error: walletError, switching, connect, disconnect, switchToSepolia } = wallet
  const bank = useTokenBank(account)
  const eip7702 = useEIP7702()

  const needSwitch = account && chainId !== null && chainId !== 11155111

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      {/* Header */}
      <header className="border-b border-gray-800">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-white">TokenBank</h1>
            <span className="text-xs text-purple-400">EIP-7702</span>
          </div>
          <WalletConnect
            account={account}
            chainId={chainId}
            error={walletError}
            onConnect={connect}
            onDisconnect={disconnect}
          />
        </div>
      </header>

      {/* Main */}
      <main className="max-w-2xl mx-auto px-4 py-8">
        {!account ? (
          <div className="text-center py-20">
            <div className="text-6xl mb-4">🏦</div>
            <h2 className="text-2xl font-bold mb-2">欢迎使用 TokenBank</h2>
            <p className="text-gray-400 mb-2">EIP-7702 单笔交易完成授权与存款</p>
            <p className="text-gray-500 text-sm mb-6">EOA 委托至 MetaMask Delegator · 批量原子化操作</p>
            <button
              onClick={connect}
              className="px-8 py-3 rounded-full bg-blue-600 hover:bg-blue-700 text-white font-medium text-lg transition-colors"
            >
              连接钱包开始
            </button>
          </div>
        ) : needSwitch ? (
          <div className="text-center py-20">
            <div className="text-6xl mb-4">🔗</div>
            <h2 className="text-2xl font-bold mb-2">网络不匹配</h2>
            <p className="text-gray-400 mb-6">请切换到 Sepolia 测试网 (Chain ID: 11155111)</p>
            <button
              onClick={switchToSepolia}
              disabled={switching}
              className="px-8 py-3 rounded-full bg-yellow-600 hover:bg-yellow-700 disabled:bg-gray-700 disabled:text-gray-500 text-white font-medium text-lg transition-colors"
            >
              {switching ? '切换中...' : '切换到 Sepolia'}
            </button>
          </div>
        ) : (
          <TokenBank bank={bank} eip7702={eip7702} wallet={wallet} />
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-800 py-4 text-center text-gray-600 text-xs space-x-4">
        <span>TokenBank DApp</span>
        <span>·</span>
        <span>EIP-7702 Delegator: 0x63c0c19a...A07DAE32B</span>
        <span>·</span>
        <span>Sepolia Testnet</span>
      </footer>
    </div>
  )
}
