// ─── Job Status ──────────────────────────────────────────────
export type JobStatus = 'queued' | 'running' | 'completed' | 'failed';

// ─── Social Media Result ─────────────────────────────────────
export interface SocialMediaResult {
    linkedin: string | null;
    twitter: string | null;
    x: string | null;
    facebook: string | null;
    instagram: string | null;
    youtube: string | null;
    tiktok: string | null;
    pinterest: string | null;
}

// ─── Contact Result (merged, deduplicated per domain) ────────
export interface ContactResult {
    domain: string;
    companyName: string | null;
    description: string | null;
    emails: string[];
    phones: string[];
    socialMedia: SocialMediaResult;
    whatsapp: string[];
    skype: string[];
    contactPages: string[];
    pagesScanned: string[];
    excludedPaths: string[];
}

// ─── Per-Page Extraction (raw, before merging) ───────────────
export interface PageExtraction {
    url: string;
    emails: string[];
    phones: string[];
    socialMedia: Partial<SocialMediaResult>;
    whatsapp: string[];
    skype: string[];
    isContactPage: boolean;
    companyName: string | null;
    description: string | null;
}

// ─── Crawl Configuration ─────────────────────────────────────
export interface CrawlConfig {
    url: string;
    maxDepth?: number;
    maxPages?: number;
    timeout?: number;
    excludePaths?: string[];
    concurrency?: number;
}

// ─── Job Object ──────────────────────────────────────────────
export interface Job {
    id: string;
    url: string;
    status: JobStatus;
    pagesVisited: number;
    startedAt: string | null;
    completedAt: string | null;
    result: ContactResult | null;
    error: string | null;
    config: CrawlConfig;
}

// ─── API Request Bodies ──────────────────────────────────────
export interface SingleCrawlRequest {
    url: string;
    maxDepth?: number;
    maxPages?: number;
    timeout?: number;
    excludePaths?: string[];
}

export interface BulkCrawlRequest {
    urls: string[];
    maxDepth?: number;
    maxPages?: number;
    concurrency?: number;
    excludePaths?: string[];
}

// ─── API Responses ───────────────────────────────────────────
export interface SingleCrawlResponse {
    jobId: string;
    status: JobStatus;
    message: string;
}

export interface BulkCrawlResponse {
    jobIds: string[];
    status: JobStatus;
    message: string;
}

export interface JobResponse {
    jobId: string;
    url: string;
    status: JobStatus;
    pagesVisited: number;
    startedAt: string | null;
    completedAt: string | null;
    result: ContactResult | null;
    error?: string | null;
}

export interface JobListResponse {
    jobs: JobResponse[];
    total: number;
    page: number;
    limit: number;
}

export interface HealthResponse {
    status: string;
    uptime: number;
    activeJobs: number;
    queuedJobs: number;
}
