/**
 * Crawl routes: POST /crawl/single and POST /crawl/bulk
 */

import { Router, Request, Response } from 'express';
import { jobQueue } from '../crawler/queue.js';
import { runCrawlJob } from '../crawler/index.js';
import type { SingleCrawlRequest, BulkCrawlRequest } from '../types/index.js';

export const crawlRouter = Router();

/**
 * Validate a URL string.
 */
function isValidUrl(urlStr: string): boolean {
    try {
        const parsed = new URL(urlStr);
        return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch {
        return false;
    }
}

// ─── POST /crawl/single ──────────────────────────────────────
crawlRouter.post('/single', (req: Request, res: Response): void => {
    const body = req.body as SingleCrawlRequest;

    // Validate URL
    if (!body.url || typeof body.url !== 'string') {
        res.status(400).json({ error: 'Missing required field: url' });
        return;
    }

    if (!isValidUrl(body.url)) {
        res.status(400).json({
            error: 'Invalid URL. Must start with http:// or https://',
        });
        return;
    }

    // Create a job
    const config = {
        url: body.url.trim(),
        maxDepth: body.maxDepth,
        maxPages: body.maxPages,
        timeout: body.timeout ?? 120,
        excludePaths: body.excludePaths ?? [],
    };

    const jobId = jobQueue.createJob(config);

    // Start crawl asynchronously (fire and forget)
    runCrawlJob(jobId, config).catch((err) => {
        console.error(`[CRAWL] Unexpected error in job ${jobId}:`, err);
    });

    res.status(202).json({
        jobId,
        status: 'queued',
        message: 'Job queued. Poll GET /job/' + jobId + ' to get results.',
    });
});

// ─── POST /crawl/bulk ────────────────────────────────────────
crawlRouter.post('/bulk', (req: Request, res: Response): void => {
    const body = req.body as BulkCrawlRequest;

    // Validate URLs array
    if (!body.urls || !Array.isArray(body.urls) || body.urls.length === 0) {
        res.status(400).json({ error: 'Missing required field: urls (must be a non-empty array)' });
        return;
    }

    // Validate each URL
    const invalidUrls = body.urls.filter((u) => !isValidUrl(u));
    if (invalidUrls.length > 0) {
        res.status(400).json({
            error: `Invalid URLs found. Must start with http:// or https://`,
            invalidUrls,
        });
        return;
    }

    const concurrency = body.concurrency ?? 1;
    const jobIds: string[] = [];

    // Create a job for each URL
    for (const url of body.urls) {
        const config = {
            url: url.trim(),
            maxDepth: body.maxDepth,
            maxPages: body.maxPages,
            timeout: 120,
            excludePaths: body.excludePaths ?? [],
            concurrency,
        };

        const jobId = jobQueue.createJob(config);
        jobIds.push(jobId);
    }

    // Start crawls with concurrency control
    startBulkCrawls(jobIds, concurrency).catch((err) => {
        console.error('[CRAWL] Unexpected error in bulk crawl:', err);
    });

    res.status(202).json({
        jobIds,
        status: 'queued',
        message: `${body.urls.length} jobs queued. Poll each GET /job/:jobId for results.`,
    });
});

/**
 * Run bulk crawls with concurrency control.
 * Processes at most `concurrency` crawls in parallel.
 */
async function startBulkCrawls(jobIds: string[], concurrency: number): Promise<void> {
    const queue = [...jobIds];
    const running: Promise<void>[] = [];

    while (queue.length > 0 || running.length > 0) {
        // Fill up to concurrency limit
        while (queue.length > 0 && running.length < concurrency) {
            const jobId = queue.shift()!;
            const job = jobQueue.getJob(jobId);
            if (!job) continue;

            const promise = runCrawlJob(jobId, job.config)
                .catch((err) => {
                    console.error(`[CRAWL] Unexpected error in bulk job ${jobId}:`, err);
                })
                .then(() => {
                    // Remove this promise from running array
                    const idx = running.indexOf(promise);
                    if (idx >= 0) running.splice(idx, 1);
                });

            running.push(promise);
        }

        // Wait for at least one to finish
        if (running.length > 0) {
            await Promise.race(running);
        }
    }
}
