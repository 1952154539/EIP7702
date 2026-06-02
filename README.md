# TokenBank with EIP-7702

TokenBank 是一个去中心化存款 DApp，集成 **EIP-7702** 使 EOA 钱包具备智能合约能力，支持在**单笔交易**中完成 ERC-20 代币的授权（approve）和存款（deposit）操作。

## EIP-7702 简介

[EIP-7702](https://eips.ethereum.org/EIPS/eip-7702) 随以太坊 Pectra 升级（2025年5月）在主网激活。它引入了一种新的交易类型 `SET_CODE_TX_TYPE`（`0x04`），允许 EOA 在交易中临时设置其账户代码，将调用委托给指定的智能合约执行。

### 核心机制

- EOA 签署授权（Authorization），将其账户代码设置为 `0xef01 || delegator_address`
- 对该 EOA 的调用会被转发到 Delegator 合约执行
- 授权可以在一笔交易中完成，且同一交易可以携带 calldata 调用 Delegator 的功能
- 支持批量操作（batch calls），将多个操作合并为一笔原子交易

### 本项目使用的 Delegator 合约

使用 **MetaMask 官方 EIP-7702 Delegator 合约**:

```
0x63c0c19a282a1B52b07dD5a65b58948A07DAE32B
```

该合约提供 `execute(Call[] calldata calls)` 批量执行接口，每个 Call 结构为:

```solidity
struct Call {
    address to;
    uint256 value;
    bytes data;
}
```

## 工作流程

```
1. 用户连接 MetaMask 钱包
2. 用户输入测试网私钥（用于本地签署 EIP-7702 授权）
3. 用户输入存款金额
4. 点击 "EIP-7702 一键授权并存款"
5. 单笔交易原子化完成:
   ├── EIP-7702 授权: EOA 委托至 MetaMask Delegator
   ├── ERC-20 approve: 授权 TokenBank 使用代币
   └── TokenBank deposit: 存入代币
```

### 与传统流程对比

| 步骤 | 传统流程 | EIP-7702 流程 |
|------|---------|---------------|
| 1 | approve 交易 | 单笔 SetCodeTx |
| 2 | 等待确认 | — |
| 3 | deposit 交易 | — |
| 交易数 | 2 笔 | 1 笔 |
| Gas 费 | 2 次 | 1 次 |
| 用户体验 | 需等待两笔交易 | 一键完成 |

## 技术栈

- **React 18** + **Vite** — 前端框架
- **viem 2.x** — 以太坊交互库，使用实验性 EIP-7702 API
- **Tailwind CSS** — 样式
- **Sepolia Testnet** — 测试网络

## 核心代码说明

### EIP-7702 授权签署

```js
import { signAuthorization } from 'viem/experimental'

// 签署 EIP-7702 授权，将 EOA 委托至 Delegator 合约
const authorization = await signAuthorization(walletClient, {
  contractAddress: '0x63c0c19a282a1B52b07dD5a65b58948A07DAE32B',
  chainId: sepolia.id,
  nonce,
})
```

### 批量交易构建

```js
// 编码 approve + deposit 为一个 execute 调用
const executeData = encodeFunctionData({
  abi: EIP7702DelegatorABI,
  functionName: 'execute',
  args: [[
    { to: tokenAddress, value: 0n, data: approveData },
    { to: tokenBankAddress, value: 0n, data: depositData },
  ]],
})

// 发送 EIP-7702 交易
const hash = await walletClient.sendTransaction({
  to: account.address,           // 发送到自己的 EOA
  authorizationList: [authorization],  // EIP-7702 授权列表
  data: executeData,             // 批量调用数据
})
```

## 快速开始

```bash
# 克隆仓库
git clone https://github.com/1952154539/EIP7702.git
cd EIP7702

# 安装依赖
npm install

# 启动开发服务器
npm run dev

# 构建生产版本
npm run build
```

## 使用准备

1. 安装 [MetaMask](https://metamask.io/) 浏览器扩展
2. 切换到 **Sepolia 测试网** (Chain ID: 11155111)
3. 获取 Sepolia 测试 ETH（可从 [Sepolia Faucet](https://sepoliafaucet.com/) 获取）
4. 准备测试代币和私钥

## 环境变量

创建 `.env` 文件配置合约地址（可选，使用默认 Sepolia 测试网地址）:

```env
VITE_RPC_URL=https://sepolia.drpc.org
VITE_TOKEN_ADDRESS=0x...
VITE_TOKEN_BANK_ADDRESS=0x...
```

## 测试网交易示例

部署和测试交易的浏览器链接:

- Delegator 合约: [0x63c0c19a282a1B52b07dD5a65b58948A07DAE32B](https://sepolia.etherscan.io/address/0x63c0c19a282a1B52b07dD5a65b58948A07DAE32B)

## 安全说明

- **私钥仅在本地使用**，不发送到任何服务器
- 私钥用于在浏览器端签署 EIP-7702 授权
- 仅支持 Sepolia 测试网，禁止在主网使用
- EIP-7702 授权使用 `0x05` 魔数前缀，与 EIP-712 (`0x1901`) 签名域分离

## 参考资料

- [EIP-7702: Set EOA account code](https://eips.ethereum.org/EIPS/eip-7702)
- [EIP-7702 实践：发起打包交易](https://learnblockchain.cn/article/13256)
- [以太坊 Pectra 升级解读](https://learnblockchain.cn/article/11498)
- [viem EIP-7702 文档](https://viem.sh/docs/eip7702/signAuthorization)
- [MetaMask Delegation Toolkit](https://docs.metamask.io/smart-accounts-kit)

## License

MIT
