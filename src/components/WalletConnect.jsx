export default function WalletConnect({ account, chainId, error, onConnect, onDisconnect }) {
  const shortAddr = account ? account.slice(0, 6) + '...' + account.slice(-4) : ''

  const chainNames = {
    1: 'Ethereum',
    31337: 'Anvil Local',
    11155111: 'Sepolia',
    80002: 'Polygon Amoy',
    137: 'Polygon',
  }

  return (
    <div className="flex items-center gap-3">
      {account ? (
        <>
          <span className="px-3 py-1.5 rounded-full bg-green-900/50 text-green-400 text-sm border border-green-700/50">
            {chainNames[chainId] || `Chain ${chainId}`}
          </span>
          <span className="px-3 py-1.5 rounded-full bg-gray-800 text-gray-300 text-sm border border-gray-700 font-mono">
            {shortAddr}
          </span>
          <button
            onClick={onDisconnect}
            className="px-4 py-1.5 rounded-full bg-red-900/30 text-red-400 text-sm border border-red-700/50 hover:bg-red-900/50 transition-colors"
          >
            断开
          </button>
        </>
      ) : (
        <button
          onClick={onConnect}
          className="px-5 py-2 rounded-full bg-blue-600 hover:bg-blue-700 text-white font-medium transition-colors"
        >
          连接钱包
        </button>
      )}
      {error && <span className="text-red-400 text-sm">{error}</span>}
    </div>
  )
}
