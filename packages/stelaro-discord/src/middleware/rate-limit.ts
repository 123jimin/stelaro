import type {KeyExtractor} from "./key.ts";

/** Default ephemeral message sent when a rate limit is exceeded. */
export const RATE_LIMIT_MESSAGE = "You are being rate limited. Please try again later.";

/**
 * Per-handler rate limit configuration.
 *
 * @category Middleware
 */
export type RateLimitOptions = {
    /** Maximum number of calls per key within the window */
    readonly limit: number;
    /** Sliding window duration in milliseconds */
    readonly window_ms: number;
    /** Key extraction strategy (default: {@link perUser}) */
    readonly key?: KeyExtractor;
};
