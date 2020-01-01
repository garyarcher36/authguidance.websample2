import hasher from 'js-sha256';
import NodeCache from 'node-cache';
import {ApiClaims} from '../../logic/entities/apiClaims';
import {OAuthConfiguration} from '../configuration/oauthConfiguration';
import {ApiLogger} from '../utilities/apiLogger';

/*
 * A simple in memory claims cache for our API
 */
export class ClaimsCache {

    /*
     * The singleton cache
     */
    private readonly _cache: NodeCache;

    /*
     * Create the cache at application startup
     */
    public constructor(configuration: OAuthConfiguration) {

        // Create the cache and set a default time to live in seconds
        const defaultExpirySeconds = configuration.maxClaimsCacheMinutes * 60;
        this._cache = new NodeCache({
            stdTTL: defaultExpirySeconds,
        });

        // If required add debug output here to verify expiry occurs when expected
        this._cache.on('expired', (key: string, value: any) => {
            ApiLogger.info(`Expired token has been removed from the cache (hash: ${key})`);
        });
    }

    /*
     * Get claims from the cache or return null if not found
     */
    public async getClaimsForToken(accessToken: string): Promise<ApiClaims | null> {

        // Get the token hash and see if it exists in the cache
        const hash = hasher.sha256(accessToken);
        const claims = await this._cache.get<ApiClaims>(hash);
        if (!claims) {

            // If this is a new token and we need to do claims processing
            ApiLogger.info(`New token will be added to claims cache (hash: ${hash})`);
            return null;
        }

        // Otherwise return cached claims
        ApiLogger.info(`Found existing token in claims cache (hash: ${hash})`);
        return claims;
    }

    /*
     * Add claims to the cache until the token's time to live
     */
    public async addClaimsForToken(accessToken: string, expiry: number, claims: ApiClaims): Promise<void> {

        // Use the exp field returned from introspection to work out the token expiry time
        const epochSeconds = Math.floor((new Date() as any) / 1000);
        let secondsToCache = expiry - epochSeconds;
        if (secondsToCache > 0) {

            // Get the hash and output debug info
            const hash = hasher.sha256(accessToken);
            ApiLogger.info(`Token to be cached will expire in ${secondsToCache} seconds (hash: ${hash})`);

            // Do not exceed the maximum time we configured
            if (secondsToCache > this._cache.options.stdTTL!) {
                secondsToCache = this._cache.options.stdTTL!;
            }

            // Cache the token until the above time
            ApiLogger.info(`Adding token to claims cache for ${secondsToCache} seconds (hash: ${hash})`);
            await this._cache.set(hash, claims, secondsToCache);
        }
    }
}
