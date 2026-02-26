/**
 * Main crawler logic.
 *
 * Automatically detects whether a site is a React/Vue/Angular SPA
 * (needs Playwright for JS rendering) or a server-rendered site
 * (fast Cheerio HTML parsing is sufficient).
 *
 * Detection: fetch homepage via HTTP, strip tags, count visible text.
 * If < 200 chars of text → SPA → use PlaywrightCrawler.
 * If >= 200 chars → server-rendered → use CheerioCrawler.
 */

import { PlaywrightCrawler, CheerioCrawler, Configuration } from 'crawlee';
import { load as cheerioLoad } from 'cheerio';
import { extractContacts, mergeExtractions } from './extractor.js';
import { buildExcludePatterns, shouldExcludeUrl, DEFAULT_EXCLUDED_PATHS, buildPriorityUrls } from './filters.js';
import { jobQueue } from './queue.js';
import type { CrawlConfig, PageExtraction } from '../types/index.js';

// ─── SPA Detection ───────────────────────────────────────────

/**
 * Detect whether a website needs Playwright (SPA) or Cheerio (server-rendered).
 *
 * Fetches the homepage HTML with a plain HTTP request and counts visible
 * text content after stripping scripts, styles, and tags.
 *
 * Returns 'playwright' for SPAs, 'cheerio' for server-rendered sites.
 */
async function detectRenderingType(url: string): Promise<'playwright' | 'cheerio'> {
    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);

        const response = await fetch(url, {
            signal: controller.signal,
            headers: {
                'User-Agent': 'Mozilla/5.0 (compatible; WebContactExtractor/1.0)',
                Accept: 'text/html',
            },
        });
        clearTimeout(timeout);

        const html = await response.text();

        // Strip script, style, and tags — get visible text only
        const $ = cheerioLoad(html);
        $('script, style, noscript').remove();
        const visibleText = $('body').text().replace(/\s+/g, ' ').trim();

        const isSPA = visibleText.length < 200;
        console.log(
            `[DETECT] ${url} → visible text: ${visibleText.length} chars → ${isSPA ? 'SPA (Playwright)' : 'Server-rendered (Cheerio)'}`
        );
        return isSPA ? 'playwright' : 'cheerio';
    } catch {
        // If detection fails, default to Playwright (safer)
        console.log(`[DETECT] ${url} → detection failed, defaulting to Playwright`);
        return 'playwright';
    }
}

/**
 * Probe a list of URLs in parallel with HEAD requests.
 * Returns only those that:
 * - respond with a non-404 status
 * - did NOT redirect to the homepage (soft 404 detection)
 *
 * Many sites redirect unknown paths → homepage with 200, so we compare
 * the final URL after redirects against the site's root path.
 */
async function probeValidUrls(urls: string[], baseOrigin: string): Promise<string[]> {
    const CONCURRENCY = 10;
    const valid: string[] = [];

    // Normalize homepage: fetch it once to see its final URL (handles www/non-www redirects)
    let homepageFinalPath = '/';
    try {
        const homeRes = await fetch(baseOrigin, {
            method: 'HEAD',
            redirect: 'follow',
            headers: { 'User-Agent': 'Mozilla/5.0 (compatible; WebContactExtractor/1.0)' },
        });
        homepageFinalPath = new URL(homeRes.url).pathname;
    } catch { /* use default '/' */ }

    // Process in batches
    for (let i = 0; i < urls.length; i += CONCURRENCY) {
        const batch = urls.slice(i, i + CONCURRENCY);
        const results = await Promise.allSettled(
            batch.map(async (url) => {
                const controller = new AbortController();
                const timer = setTimeout(() => controller.abort(), 8000);
                try {
                    const res = await fetch(url, {
                        method: 'HEAD',
                        signal: controller.signal,
                        redirect: 'follow',
                        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; WebContactExtractor/1.0)' },
                    });
                    clearTimeout(timer);

                    // Hard 404 → invalid
                    if (res.status === 404) return null;

                    // Soft 404 check: if final URL path matches homepage path → invalid
                    const finalPath = new URL(res.url).pathname;
                    if (finalPath === homepageFinalPath || finalPath === '/') {
                        // Only reject if the *requested* path was different from homepage
                        const requestedPath = new URL(url).pathname;
                        if (requestedPath !== '/' && requestedPath !== homepageFinalPath) {
                            return null; // redirected to homepage = soft 404
                        }
                    }

                    return url;
                } catch {
                    clearTimeout(timer);
                    return null;
                }
            })
        );
        for (const r of results) {
            if (r.status === 'fulfilled' && r.value) valid.push(r.value);
        }
    }
    return valid;
}

// ─── Main crawl job runner ───────────────────────────────────

/**
 * Run a crawl job for a single website.
 * This is called asynchronously — the API returns immediately with a jobId.
 */
export async function runCrawlJob(jobId: string, config: CrawlConfig): Promise<void> {
    const { url, maxDepth, maxPages, timeout = 120, excludePaths = [] } = config;

    jobQueue.startJob(jobId);

    const timestamp = () => new Date().toISOString();
    console.log(`[${timestamp()}] [JOB ${jobId}] Starting crawl for ${url}`);

    const excludePatterns = buildExcludePatterns(excludePaths);
    const allExcludedPaths = [...DEFAULT_EXCLUDED_PATHS, ...excludePaths];
    const pageExtractions: PageExtraction[] = [];

    let domain: string;
    try {
        domain = new URL(url).hostname;
    } catch {
        jobQueue.failJob(jobId, `Invalid URL: ${url}`);
        return;
    }

    try {
        // Detect SPA vs server-rendered
        const renderType = await detectRenderingType(url);

        const crawlerConfig = new Configuration({
            storageClientOptions: {
                localDataDirectory: `./storage/jobs/${jobId}`,
            },
        });

        // Shared crawler options
        const sharedOptions = {
            ...(maxPages ? { maxRequestsPerCrawl: maxPages } : {}),
            maxCrawlDepth: maxDepth ?? (renderType === 'playwright' ? 1 : 3),
            maxConcurrency: renderType === 'playwright' ? 3 : 10,
        };

        // ── Priority seed URLs (probe all to skip 404/slow pages) ───
        const allPriorityUrls = buildPriorityUrls(url, excludePatterns);
        console.log(`[${timestamp()}] [JOB ${jobId}] Probing ${allPriorityUrls.length} priority paths...`);
        const validPriorityUrls = await probeValidUrls(allPriorityUrls, new URL(url).origin);
        const seedUrls = [url, ...validPriorityUrls];
        console.log(
            `[${timestamp()}] [JOB ${jobId}] Mode: ${renderType.toUpperCase()} | ` +
            `${validPriorityUrls.length}/${allPriorityUrls.length} priority pages valid | ` +
            `Seeding ${seedUrls.length} URLs`
        );

        // ── Timeout promise ──────────────────────────────────
        let crawlerRef: { autoscaledPool?: { abort: () => void } } = {};
        const timeoutPromise = new Promise<void>((resolve) => {
            setTimeout(() => {
                console.log(`[${timestamp()}] [JOB ${jobId}] Timeout (${timeout}s), aborting`);
                void crawlerRef.autoscaledPool?.abort();
                resolve();
            }, timeout * 1000);
        });

        if (renderType === 'playwright') {
            // ── Playwright for SPAs ──────────────────────────
            const crawler = new PlaywrightCrawler(
                {
                    ...sharedOptions,
                    requestHandlerTimeoutSecs: 90,
                    navigationTimeoutSecs: 60,
                    launchContext: {
                        launchOptions: {
                            headless: true,
                            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
                        },
                    },

                    async requestHandler({ request, page, enqueueLinks, log }) {
                        const pageUrl = request.loadedUrl || request.url;
                        if (shouldExcludeUrl(pageUrl, excludePatterns)) return;

                        log.info(`[Playwright] Processing: ${pageUrl}`);

                        // Wait for page to render
                        try {
                            await page.waitForLoadState('networkidle', { timeout: 15000 });
                        } catch {
                            log.info(`networkidle timeout on ${pageUrl}`);
                        }

                        // Scroll to trigger lazy/InView components
                        try {
                            const scrollHeight = await page.evaluate('document.body.scrollHeight') as number;
                            const steps = 5;
                            const stepSize = Math.floor(scrollHeight / steps);
                            for (let i = 0; i < steps; i++) {
                                await page.mouse.wheel(0, stepSize);
                                await page.waitForTimeout(400);
                            }
                            await page.evaluate('window.scrollTo(0, 0)');
                            await page.waitForTimeout(500);
                        } catch { /* scroll non-critical */ }

                        // Final wait for post-scroll rendering
                        await page.waitForTimeout(3000);

                        const html = await page.content();
                        const extraction = extractContacts(html, pageUrl);
                        pageExtractions.push(extraction);
                        jobQueue.incrementPages(jobId);

                        log.info(
                            `Extracted: ${extraction.emails.length} emails, ` +
                            `${extraction.phones.length} phones, ` +
                            `${Object.values(extraction.socialMedia).filter(Boolean).length} social`
                        );

                        await enqueueLinks({ strategy: 'same-hostname', exclude: excludePatterns });
                    },

                    async failedRequestHandler({ request, log }, error) {
                        log.warning(`Failed: ${request.url} — ${error.message}`);
                    },
                },
                crawlerConfig
            );
            crawlerRef = crawler;
            await Promise.race([crawler.run(seedUrls), timeoutPromise]);

        } else {
            // ── Cheerio for server-rendered sites ────────────
            const crawler = new CheerioCrawler(
                {
                    ...sharedOptions,
                    requestHandlerTimeoutSecs: 30,

                    async requestHandler({ request, $, body, enqueueLinks, log }) {
                        const pageUrl = request.loadedUrl || request.url;
                        if (shouldExcludeUrl(pageUrl, excludePatterns)) return;

                        log.info(`[Cheerio] Processing: ${pageUrl}`);

                        const html = typeof body === 'string' ? body : body.toString();
                        const extraction = extractContacts(html, pageUrl);
                        pageExtractions.push(extraction);
                        jobQueue.incrementPages(jobId);

                        log.info(
                            `Extracted: ${extraction.emails.length} emails, ` +
                            `${extraction.phones.length} phones, ` +
                            `${Object.values(extraction.socialMedia).filter(Boolean).length} social`
                        );

                        void $; // cheerio context available but extractor uses its own
                        await enqueueLinks({ strategy: 'same-hostname', exclude: excludePatterns });
                    },

                    async failedRequestHandler({ request, log }, error) {
                        log.warning(`Failed: ${request.url} — ${error.message}`);
                    },
                },
                crawlerConfig
            );
            crawlerRef = crawler;
            await Promise.race([crawler.run(seedUrls), timeoutPromise]);
        }

        const result = mergeExtractions(domain, pageExtractions, allExcludedPaths);
        jobQueue.completeJob(jobId, result);
        console.log(
            `[${timestamp()}] [JOB ${jobId}] Done (${renderType}). ` +
            `Pages: ${pageExtractions.length}, Emails: ${result.emails.length}, Phones: ${result.phones.length}`
        );

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`[${timestamp()}] [JOB ${jobId}] Failed: ${errorMessage}`);

        if (pageExtractions.length > 0) {
            const partial = mergeExtractions(domain, pageExtractions, allExcludedPaths);
            jobQueue.completeJob(jobId, partial);
            console.log(`[${timestamp()}] [JOB ${jobId}] Returning partial (${pageExtractions.length} pages)`);
        } else {
            jobQueue.failJob(jobId, errorMessage);
        }
    }
}
