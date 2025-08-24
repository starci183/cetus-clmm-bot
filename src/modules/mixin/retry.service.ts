
import { Injectable, Logger } from "@nestjs/common"
import pRetry from "p-retry"

export interface RetryParams<T> {
  action: () => Promise<T> | T;
  maxRetries?: number;
  delay?: number;
  factor?: number;
}

@Injectable()
export class RetryService {
    private readonly logger = new Logger(RetryService.name)
    constructor() {}


    async retry<T>({
        action,
        maxRetries = 5,
        delay = 100,
        factor = 2,
    }: RetryParams<T>): Promise<T | void> {
        return await pRetry(action, {
            retries: maxRetries,
            factor, // exponential backoff factor
            minTimeout: delay,
            maxTimeout: delay * 10,
            randomize: true, // jitter
        })
    }
}
