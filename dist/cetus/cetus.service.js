"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var CetusService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.CetusService = void 0;
const common_1 = require("@nestjs/common");
const cetus_sui_clmm_sdk_1 = require("@cetusprotocol/cetus-sui-clmm-sdk");
const IKA_ADDRESS = "0x7262fb2f7a3a14c888c438a3cd9b912469a58cf60f367352c46584262e8299aa::ika::IKA";
const SUI_ADDRESS = "0x0000000000000000000000000000000000000000000000000000000000000002::sui::SUI";
const USDC_ADDRESS = "0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC";
const poolParamsArr = [
    {
        tokenA: SUI_ADDRESS,
        tokenB: IKA_ADDRESS,
        feeRate: 0.002,
    },
];
let CetusService = CetusService_1 = class CetusService {
    logger = new common_1.Logger(CetusService_1.name);
    cetusClmmSdk;
    pools = [];
    constructor() {
        this.cetusClmmSdk = (0, cetus_sui_clmm_sdk_1.initCetusSDK)({
            network: "mainnet",
            wallet: process.env.SUI_WALLET_ADDRESS,
        });
    }
    async onApplicationBootstrap() {
        let pools = [];
        for (const poolParams of poolParamsArr) {
            const pools = await this.cetusClmmSdk.Pool.getPoolByCoins([poolParams.tokenA, poolParams.tokenB]);
            const pool = pools.find(pool => pool.fee_rate == (poolParams.feeRate * 1_000_000));
            if (!pool) {
                console.error(`Pool not found for ${poolParams.tokenA} and ${poolParams.tokenB} with fee rate ${poolParams.feeRate}`);
                continue;
            }
            const positions = await this.cetusClmmSdk.Position.getPositionList(process.env.SUI_WALLET_ADDRESS || "", ["0xc23e7e8a74f0b18af4dfb7c3280e2a56916ec4d41e14416f85184a8aab6b7789"]);
            this.pools.push({
                pool: pool,
                position: positions[0],
            });
        }
        const poolIndex = 0;
        const pool = this.pools[poolIndex].pool;
        const tickSpacing = Number.parseInt(pool.tickSpacing);
        this.logger.verbose(this.pools[0].position);
        this.logger.verbose(`Current tick index: ${pool.current_tick_index}`);
        this.logger.verbose(`Position range: ${this.pools[0].position?.tick_lower_index} - ${this.pools[0].position?.tick_upper_index}`);
        if (pool.current_tick_index < (this.pools[0].position?.tick_lower_index || 0) ||
            pool.current_tick_index > (this.pools[0].position?.tick_upper_index || 0)) {
            this.logger.warn("Position is out of range");
            return;
        }
    }
};
exports.CetusService = CetusService;
exports.CetusService = CetusService = CetusService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [])
], CetusService);
//# sourceMappingURL=cetus.service.js.map