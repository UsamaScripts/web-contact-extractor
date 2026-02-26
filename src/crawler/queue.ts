/**
 * In-memory job queue manager.
 *
 * Stores crawl jobs in a Map keyed by UUID.
 * Jobs persist for the lifetime of the server process.
 */

import { randomUUID } from 'node:crypto';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import type { Job, CrawlConfig, ContactResult, JobStatus } from '../types/index.js';

class JobQueue {
    private jobs: Map<string, Job> = new Map();

    /**
     * Create a new job entry and return its ID.
     */
    createJob(config: CrawlConfig): string {
        const id = randomUUID();
        const job: Job = {
            id,
            url: config.url,
            status: 'queued',
            pagesVisited: 0,
            startedAt: null,
            completedAt: null,
            result: null,
            error: null,
            config,
        };
        this.jobs.set(id, job);
        return id;
    }

    /**
     * Get a job by ID. Returns undefined if not found.
     */
    getJob(id: string): Job | undefined {
        return this.jobs.get(id);
    }

    /**
     * Mark a job as running.
     */
    startJob(id: string): void {
        const job = this.jobs.get(id);
        if (job) {
            job.status = 'running';
            job.startedAt = new Date().toISOString();
        }
    }

    /**
     * Increment the pages visited counter for a running job.
     */
    incrementPages(id: string): void {
        const job = this.jobs.get(id);
        if (job) {
            job.pagesVisited++;
        }
    }

    /**
     * Mark a job as completed with results.
     */
    completeJob(id: string, result: ContactResult): void {
        const job = this.jobs.get(id);
        if (job) {
            job.status = 'completed';
            job.completedAt = new Date().toISOString();
            job.result = result;
        }
    }

    /**
     * Mark a job as failed with an error message.
     */
    failJob(id: string, error: string): void {
        const job = this.jobs.get(id);
        if (job) {
            job.status = 'failed';
            job.completedAt = new Date().toISOString();
            job.error = error;
        }
    }

    /**
     * Delete a job by ID — removes from RAM and cleans up Crawlee storage from disk.
     * Returns true if the job existed.
     */
    deleteJob(id: string): boolean {
        const existed = this.jobs.delete(id);
        if (existed) {
            // Clean up Crawlee's on-disk storage for this job (fire-and-forget)
            const storageDir = join(process.cwd(), 'storage', 'jobs', id);
            rm(storageDir, { recursive: true, force: true }).catch(() => { /* ignore if already gone */ });
        }
        return existed;
    }

    /**
     * List jobs with optional filtering and pagination.
     */
    listJobs(options: {
        page?: number;
        limit?: number;
        status?: JobStatus;
    }): { jobs: Job[]; total: number } {
        const { page = 1, limit = 20, status } = options;

        let allJobs = Array.from(this.jobs.values());

        // Filter by status
        if (status) {
            allJobs = allJobs.filter((j) => j.status === status);
        }

        // Sort by most recent first (queued jobs that haven't started sort by creation order)
        allJobs.sort((a, b) => {
            const dateA = a.startedAt || '';
            const dateB = b.startedAt || '';
            return dateB.localeCompare(dateA);
        });

        const total = allJobs.length;
        const start = (page - 1) * limit;
        const paginatedJobs = allJobs.slice(start, start + limit);

        return { jobs: paginatedJobs, total };
    }

    /**
     * Get count of jobs by status.
     */
    getStatusCounts(): { queued: number; running: number; completed: number; failed: number } {
        const counts = { queued: 0, running: 0, completed: 0, failed: 0 };
        for (const job of this.jobs.values()) {
            counts[job.status]++;
        }
        return counts;
    }
}

// Singleton instance
export const jobQueue = new JobQueue();
