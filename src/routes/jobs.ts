/**
 * Job routes: GET /job/:jobId, GET /jobs, DELETE /job/:jobId
 */

import { Router, Request, Response } from 'express';
import { jobQueue } from '../crawler/queue.js';
import type { JobStatus, JobResponse } from '../types/index.js';

export const jobsRouter = Router();

/**
 * Format a Job object into an API response.
 */
function formatJobResponse(job: ReturnType<typeof jobQueue.getJob>): JobResponse | null {
    if (!job) return null;

    return {
        jobId: job.id,
        url: job.url,
        status: job.status,
        pagesVisited: job.pagesVisited,
        startedAt: job.startedAt,
        completedAt: job.completedAt,
        result: job.result,
        ...(job.error ? { error: job.error } : {}),
    };
}

// ─── GET /job/:jobId ─────────────────────────────────────────
jobsRouter.get('/job/:jobId', (req: Request, res: Response): void => {
    const jobId = req.params.jobId as string;
    const job = jobQueue.getJob(jobId);

    if (!job) {
        res.status(404).json({ error: `Job not found: ${jobId}` });
        return;
    }

    const response = formatJobResponse(job);
    res.json(response);
});

// ─── GET /jobs ───────────────────────────────────────────────
jobsRouter.get('/jobs', (req: Request, res: Response): void => {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
    const status = req.query.status as JobStatus | undefined;

    // Validate status filter
    const validStatuses: JobStatus[] = ['queued', 'running', 'completed', 'failed'];
    if (status && !validStatuses.includes(status)) {
        res.status(400).json({
            error: `Invalid status filter. Must be one of: ${validStatuses.join(', ')}`,
        });
        return;
    }

    const { jobs, total } = jobQueue.listJobs({ page, limit, status });

    res.json({
        jobs: jobs.map((j) => formatJobResponse(j)!),
        total,
        page,
        limit,
    });
});

// ─── DELETE /job/:jobId ──────────────────────────────────────
jobsRouter.delete('/job/:jobId', (req: Request, res: Response): void => {
    const jobId = req.params.jobId as string;
    const job = jobQueue.getJob(jobId);

    if (!job) {
        res.status(404).json({ error: `Job not found: ${jobId}` });
        return;
    }

    const deleted = jobQueue.deleteJob(jobId);

    if (deleted) {
        res.json({ message: `Job ${jobId} deleted successfully.` });
    } else {
        res.status(500).json({ error: `Failed to delete job ${jobId}` });
    }
});
