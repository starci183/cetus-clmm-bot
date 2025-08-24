# Cetus CLMM Trading Bot 🚀

An Automated Liquidity Management Bot for Cetus Protocol on Sui blockchain, using Concentrated Liquidity Market Maker (CLMM) to optimize liquidity provision and earn trading fees.

## 🎯 Overview

This bot automatically manages concentrated liquidity positions on Cetus DEX, helping maximize profits from liquidity provision through:

- **Automated Position Management**: Automatically opens/closes positions when price moves out of range
- **Liquidity Range Optimization**: Adjusts tick ranges to maximize capital efficiency
- **Automatic Swapping**: Performs swaps when necessary to maintain desired token ratios
- **Slippage Protection**: Controls price slippage and manages risks
- **Rate Limiting**: Limits transaction frequency to prevent spam

## 🏗️ System Architecture

### Core Components

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Pool Manager  │ -> │   Core Service  │ -> │ Action Service  │
│ (Monitor pools) │    │ (Main logic)    │    │(Execute trades) │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         v                       v                       v
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│ Tick Manager    │    │  Swap Service   │    │Balance Manager  │
│(Manage ticks)   │    │  (Trading)      │    │(Manage balances)│
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

### Tech Stack

- **Framework**: NestJS with TypeScript
- **Blockchain**: Sui Network
- **Protocol**: Cetus CLMM SDK & Aggregator SDK
- **Database**: MongoDB with Mongoose
- **Cache**: Redis
- **Scheduling**: Cron jobs
- **Container**: Docker & Docker Compose

## 🔧 Installation and Setup

### System Requirements

- Node.js 18+
- MongoDB
- Redis
- Docker (optional)

### 1. Clone repository

```bash
git clone <repository-url>
cd cetus-clmm-bot
```

### 2. Install dependencies

```bash
npm install
```

### 3. Environment configuration

Create a `.env` file with the following environment variables:

```env
# Sui Wallet Configuration
SUI_WALLET_ADDRESS=0x...
SUI_PRIVATE_KEY_CIPHER_TEXT=...
SUI_PRIVATE_KEY_IV=...
SUI_PRIVATE_KEY_KEY=...

# Redis Configuration
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_TTL=60000

# MongoDB Configuration
MONGODB_HOST=localhost
MONGODB_PORT=27017
MONGODB_USERNAME=
MONGODB_PASSWORD=
MONGODB_DB_NAME=cetus_bot

# Pairs Configuration (JSON encoded)
PAIRS_JSON_ENCODED_DATA=...
```

### 4. Initialize database

```bash
# Seed database with tokens, pairs, and profiles
npm run start:dev
```

### 5. Run the application

#### Development mode
```bash
npm run start:dev
```

#### Production mode
```bash
npm run build
npm run start:prod
```

#### Using Docker
```bash
docker-compose up -d
```

## 📊 How It Works

### 1. Initialization and Monitoring

- **Pool Manager** updates pool state every 5 seconds
- Fetches pool and position information from Cetus Protocol
- Emits events when updates occur to trigger processing logic

### 2. Main Decision Logic

**Core Service** processes each pool position:

```typescript
// If no position exists -> Add liquidity
if (!position) {
    await addLiquidityFixToken(pool, profilePair)
}

// If position is out of range
if (isOutOfRange) {
    if (same direction as preference) {
        // Close old position and open new one
        await closePosition(poolWithPosition)
        await addLiquidityFixToken(pool, profilePair)
    } else {
        // Need to swap before opening new position
        await closePosition(poolWithPosition)
        await swap({ profilePair, a2b: !priorityAOverB })
        await addLiquidityFixToken(pool, profilePair)
    }
}
```

### 3. Smart Tick Management

**Tick Manager** calculates:
- **Tick bounds**: Current tick range based on tick spacing
- **Deviation threshold**: Allowed threshold = 1/4 tick spacing
- **Position placement**: Places position at next tick in preferred direction

### 4. Risk Protection

- **Allocation limits**: Maximum 1 transaction per 15 minutes
- **Balance protection**: Reserves 0.5 SUI for gas fees
- **Tick validation**: Only adds liquidity when tick distance <= threshold
- **Retry mechanism**: Automatic retry with exponential backoff

## 🗃️ Database Structure

### Collections

#### 1. Tokens
```typescript
{
  displayId: TokenId,     // SUI, USDC, CETUS...
  name: string,          // "Sui", "USD Coin"...
  address: string,       // Sui address of the token
  decimals: number       // Number of decimal places
}
```

#### 2. Pairs 
```typescript
{
  displayId: PairId,     // SUI_USDC, CETUS_SUI...
  tokenA: TokenSchema,   // Reference to token A
  tokenB: TokenSchema,   // Reference to token B
  feeRate: number        // Fee rate (0.0025 = 0.25%)
}
```

#### 3. Profiles
```typescript
{
  name: string,
  description: string,
  profilePairs: [{
    pair: PairSchema,           // Reference to pair
    priorityToken: TokenSchema, // Preferred token to hold
    capitalAllocatedPercentage: number
  }]
}
```

#### 4. Liquidity Ranges (Tracking)
```typescript
{
  profilePair: ObjectId,
  tickIndexBoundLower: number,
  tickIndexBoundUpper: number, 
  currentTickAtCreation: number,
  originalCapital: number
}
```

## 🔐 Security

### Private Key Management
- Private key is encrypted using AES with separate IV and key
- Never stores private key in plain text
- Uses environment variables for sensitive data

### Transaction Safety
- Full validation before executing transactions
- Slippage protection for all operations
- Minimum balance protection for gas fees

## 📈 Monitoring and Logging

### Log Levels
- **Fatal**: Critical information (current tick, distances)
- **Error**: Serious errors requiring attention
- **Warn**: Warnings (allocation exceeded, cannot move position)
- **Log**: Successful transaction information
- **Verbose**: Detailed decision logic
- **Debug**: Detailed debugging information

### Key Metrics Logged
- Current tick position
- Distance from tick bounds
- Position range status
- Transaction digests
- Balance changes
- Allocation usage

## 🧪 Testing

```bash
# Unit tests
npm run test

# E2E tests  
npm run test:e2e

# Test coverage
npm run test:cov

# Watch mode
npm run test:watch
```

## 🚀 Deployment

### Production Checklist

1. ✅ Set up MongoDB cluster
2. ✅ Configure Redis instance  
3. ✅ Set all environment variables
4. ✅ Fund wallet with sufficient SUI for gas
5. ✅ Configure pairs data properly
6. ✅ Set up monitoring/alerting
7. ✅ Test with small amounts first

### Docker Deployment

```bash
# Build and start
docker-compose up -d

# View logs
docker-compose logs -f server

# Stop
docker-compose down
```

## 🛠️ Development

### Code Structure

```
src/
├── modules/
│   ├── cetus/           # Core Cetus integration
│   │   ├── core.service.ts         # Main business logic
│   │   ├── action.service.ts       # Position management
│   │   ├── swap.service.ts         # Token swapping
│   │   ├── pool-manager.service.ts # Pool state tracking
│   │   ├── tick-manager.service.ts # Tick calculations
│   │   └── balance-manager.service.ts # Balance management
│   ├── databases/       # Database integrations
│   │   ├── mongodb/     # MongoDB schemas & utils
│   │   ├── memdb/       # In-memory data caching
│   │   └── seeders/     # Database seeding
│   ├── cache/           # Redis caching
│   ├── mixin/           # Retry mechanisms
│   ├── number/          # Amount calculations
│   └── env/             # Environment configuration
```

### Adding New Pairs

1. Add token definitions in seeders
2. Create pair configuration
3. Add to profile configuration
4. Update PAIRS_JSON_ENCODED_DATA environment variable

### Custom Logic

The bot can be extended with:
- Custom tick strategies
- Multiple position management
- Advanced risk management
- Integration with other DEXs
- Arbitrage opportunities

## 📚 API Documentation

### Core Events

- `CetusEvent.PoolsUpdated`: Triggered khi pools được update
- Chứa mapping của `profilePairId -> PoolWithPosition`

### Key Interfaces

```typescript
interface PoolWithPosition {
  pool: Pool              // Cetus pool data
  position?: Position     // Current position (if any) 
  profilePair: ProfilePairSchema // Configuration
}

interface SwapParams {
  profilePair: ProfilePairSchema
  amount?: number         // Auto-calculate if not provided
  a2b: boolean           // Swap direction
  slippage?: number      // Default 0.5%
}
```

## 🤝 Contributing

1. Fork repository
2. Create feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open Pull Request

### Development Guidelines

- Follow TypeScript best practices
- Add comprehensive tests for new features
- Update documentation for API changes
- Use conventional commit messages
- Ensure all tests pass before submitting PR

## 📝 License

This project is licensed under UNLICENSED - see the package.json for details.

## ⚠️ Disclaimer

Bot này được phát triển cho mục đích educational và experimental. Cryptocurrency trading involves substantial risk. Sử dụng bot này hoàn toàn tự chịu trách nhiệm. Developers không chịu trách nhiệm cho bất kỳ tổn thất nào có thể xảy ra.

## 🔗 Links hữu ích

- [Cetus Protocol](https://cetus.zone/)
- [Sui Network](https://sui.io/)
- [NestJS Documentation](https://docs.nestjs.com/)
- [Cetus SDK Documentation](https://github.com/CetusProtocol/cetus-clmm-sui-sdk)

---

**Built with ❤️ for the Sui ecosystem**