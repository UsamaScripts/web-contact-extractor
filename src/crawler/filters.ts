/**
 * URL filtering / ignore rules for contact extraction crawling.
 *
 * Default paths are hardcoded. Users can supply additional paths
 * via the `excludePaths` parameter in the API request.
 */

// ─── Default excluded path patterns ─────────────────────────
const DEFAULT_EXCLUDE_PATTERNS: RegExp[] = [
    /\/blog(\/.*)?$/i,
    /\/posts?(\/.*)?$/i,
    /\/news(\/.*)?$/i,
    /\/articles?(\/.*)?$/i,
    /\/category(\/.*)?$/i,
    /\/tags?(\/.*)?$/i,
    /\/feed\/?$/i,
    /\/rss\/?$/i,
    /\/sitemap/i,
    /\/wp-json/i,
    /\/author(\/.*)?$/i,
    /\/search/i,
    /\/cdn-cgi/i,
    /\/page\/\d+/i,
];

// Human-readable list of default excluded paths (for API responses)
export const DEFAULT_EXCLUDED_PATHS: string[] = [
    '/blog',
    '/posts',
    '/news',
    '/articles',
    '/category',
    '/tags',
    '/feed',
    '/rss',
    '/sitemap',
    '/wp-json',
    '/author',
    '/search',
    '/cdn-cgi',
    '/page/<n>',
];

/**
 * Convert user-supplied exclude path strings into RegExp objects.
 * e.g. "/careers" → /\/careers(\/.*)?$/i
 */
function userPathsToRegex(paths: string[]): RegExp[] {
    return paths.map((p) => {
        // Normalize: strip trailing slash, ensure leading slash
        const clean = p.replace(/\/+$/, '').replace(/^(?!\/)/, '/');
        // Escape special regex chars except the leading slash
        const escaped = clean.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        return new RegExp(`${escaped}(\\/.*)?$`, 'i');
    });
}

/**
 * Build the complete list of exclude RegExp patterns by merging
 * defaults with user-supplied paths.
 */
export function buildExcludePatterns(userPaths?: string[]): RegExp[] {
    const userPatterns = userPaths?.length ? userPathsToRegex(userPaths) : [];
    return [...DEFAULT_EXCLUDE_PATTERNS, ...userPatterns];
}

/**
 * Check whether a URL should be excluded from crawling.
 * Used as a secondary safety filter on top of enqueueLinks exclude.
 */
export function shouldExcludeUrl(url: string, patterns: RegExp[]): boolean {
    try {
        const pathname = new URL(url).pathname;
        return patterns.some((p) => p.test(pathname));
    } catch {
        return false;
    }
}

/**
 * Priority paths — these are seeded into the crawl queue FIRST because
 * they are the most likely pages to contain contact information.
 */
export const PRIORITY_PATHS: string[] = [
    '/contact',
    '/contact-us',
    '/contactus',
    '/about',
    '/about-us',
    '/aboutus',
    '/team',
    '/our-team',
    '/people',
    '/leadership',
    '/careers',
    '/jobs',
    '/reach-us',
    '/get-in-touch',
    '/support',
    '/help',
    '/locations',
    '/offices',
    '/company',
    '/imprint',
    '/impressum',
];

/**
 * Build the list of priority seed URLs from a base website URL.
 * Filters out any that match exclude patterns.
 */
export function buildPriorityUrls(baseUrl: string, excludePatterns: RegExp[]): string[] {
    try {
        const parsed = new URL(baseUrl);
        const origin = parsed.origin;
        return PRIORITY_PATHS
            .map((path) => `${origin}${path}`)
            .filter((url) => !shouldExcludeUrl(url, excludePatterns));
    } catch {
        return [];
    }
}
