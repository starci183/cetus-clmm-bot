# Cetus CLMM Trading Bot 🚀

Một bot tự động quản lý thanh khoản (Automated Liquidity Management Bot) cho Cetus Protocol trên blockchain Sui, sử dụng Concentrated Liquidity Market Maker (CLMM) để tối ưu hóa việc cung cấp thanh khoản và kiếm phí giao dịch.

## 🎯 Tổng quan

Bot này tự động quản lý các vị thế thanh khoản tập trung (concentrated liquidity positions) trên Cetus DEX, giúp tối đa hóa lợi nhuận từ việc cung cấp thanh khoản thông qua:

- **Quản lý vị thế tự động**: Tự động mở/đóng vị thế khi giá ra khỏi phạm vi
- **Tối ưu hóa phạm vi thanh khoản**: Điều chỉnh phạm vi tick để tối đa hóa hiệu quả vốn
- **Swap tự động**: Thực hiện swap khi cần thiết để duy trì tỷ lệ token mong muốn
- **Bảo vệ slippage**: Kiểm soát độ lệch giá và quản lý rủi ro
- **Rate limiting**: Giới hạn số lượng giao dịch để tránh spam

## 🏗️ Kiến trúc hệ thống

### Core Components

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Pool Manager  │ -> │   Core Service  │ -> │ Action Service  │
│  (Theo dõi pools)│    │ (Logic chính)   │    │(Thực thi giao dịch)│
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         v                       v                       v
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│ Tick Manager    │    │  Swap Service   │    │Balance Manager  │
│(Quản lý tick)   │    │  (Giao dịch)    │    │(Quản lý số dư)  │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

### Tech Stack

- **Framework**: NestJS với TypeScript
- **Blockchain**: Sui Network
- **Protocol**: Cetus CLMM SDK & Aggregator SDK
- **Database**: MongoDB với Mongoose
- **Cache**: Redis
- **Scheduling**: Cron jobs
- **Container**: Docker & Docker Compose

## 🔧 Cài đặt và Chạy

### Yêu cầu hệ thống

- Node.js 18+
- MongoDB
- Redis
- Docker (tùy chọn)

### 1. Clone repository

```bash
git clone <repository-url>
cd cetus-clmm-bot
```

### 2. Cài đặt dependencies

```bash
npm install
```

### 3. Cấu hình môi trường

Tạo file `.env` với các biến môi trường sau:

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

### 4. Khởi tạo database

```bash
# Seed database với tokens, pairs, và profiles
npm run start:dev
```

### 5. Chạy ứng dụng

#### Development mode
```bash
npm run start:dev
```

#### Production mode
```bash
npm run build
npm run start:prod
```

#### Sử dụng Docker
```bash
docker-compose up -d
```

## 📊 Cách thức hoạt động

### 1. Khởi tạo và Theo dõi

- **Pool Manager** cập nhật trạng thái pools mỗi 5 giây
- Lấy thông tin pools, positions từ Cetus Protocol
- Emit events khi có cập nhật để trigger logic xử lý

### 2. Logic quyết định chính

**Core Service** xử lý từng pool position:

```typescript
// Nếu chưa có position -> Thêm thanh khoản
if (!position) {
    await addLiquidityFixToken(pool, profilePair)
}

// Nếu position ra khỏi phạm vi
if (isOutOfRange) {
    if (cùng hướng với preference) {
        // Đóng position cũ và mở position mới
        await closePosition(poolWithPosition)
        await addLiquidityFixToken(pool, profilePair)
    } else {
        // Cần swap trước khi mở position mới
        await closePosition(poolWithPosition)
        await swap({ profilePair, a2b: !priorityAOverB })
        await addLiquidityFixToken(pool, profilePair)
    }
}
```

### 3. Quản lý Tick thông minh

**Tick Manager** tính toán:
- **Tick bounds**: Phạm vi tick hiện tại dựa trên tick spacing
- **Deviation threshold**: Ngưỡng cho phép = 1/4 tick spacing
- **Position placement**: Đặt position ở tick tiếp theo theo hướng ưu tiên

### 4. Bảo vệ rủi ro

- **Allocation limits**: Tối đa 1 giao dịch mỗi 15 phút
- **Balance protection**: Giữ lại 0.5 SUI cho gas fees
- **Tick validation**: Chỉ add liquidity khi tick distance <= threshold
- **Retry mechanism**: Tự động retry với exponential backoff

## 🗃️ Cấu trúc Database

### Collections

#### 1. Tokens
```typescript
{
  displayId: TokenId,     // SUI, USDC, CETUS...
  name: string,          // "Sui", "USD Coin"...
  address: string,       // Sui address của token
  decimals: number       // Số decimal places
}
```

#### 2. Pairs 
```typescript
{
  displayId: PairId,     // SUI_USDC, CETUS_SUI...
  tokenA: TokenSchema,   // Reference tới token A
  tokenB: TokenSchema,   // Reference tới token B
  feeRate: number        // Fee rate (0.0025 = 0.25%)
}
```

#### 3. Profiles
```typescript
{
  name: string,
  description: string,
  profilePairs: [{
    pair: PairSchema,           // Reference tới pair
    priorityToken: TokenSchema, // Token ưu tiên giữ
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

## 🔐 Bảo mật

### Private Key Management
- Private key được mã hóa AES với IV và key riêng biệt
- Không lưu trữ private key dạng plain text
- Sử dụng environment variables cho sensitive data

### Transaction Safety
- Validation đầy đủ trước khi thực hiện giao dịch
- Slippage protection cho tất cả operations
- Minimum balance protection cho gas fees

## 📈 Monitoring và Logging

### Log Levels
- **Fatal**: Thông tin quan trọng (current tick, distances)
- **Error**: Lỗi nghiêm trọng cần xử lý
- **Warn**: Cảnh báo (allocation exceeded, cannot move position)
- **Log**: Thông tin giao dịch thành công
- **Verbose**: Chi tiết logic decision
- **Debug**: Thông tin debug chi tiết

### Key Metrics được log
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
4. ✅ Fund wallet với sufficient SUI for gas
5. ✅ Configure pairs data properly
6. ✅ Set up monitoring/alerting
7. ✅ Test với small amounts first

### Docker Deployment

```bash
# Build và start
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

Bot có thể được extend với:
- Custom tick strategies
- Multiple position management
- Advanced risk management
- Integration với other DEXs
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