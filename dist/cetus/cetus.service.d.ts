import { OnApplicationBootstrap } from "@nestjs/common";
import { Pool, Position } from "@cetusprotocol/cetus-sui-clmm-sdk";
export interface PoolData {
    pool: Pool;
    position?: Position;
}
export declare class CetusService implements OnApplicationBootstrap {
    private readonly logger;
    private readonly cetusClmmSdk;
    private pools;
    constructor();
    onApplicationBootstrap(): Promise<void>;
}
