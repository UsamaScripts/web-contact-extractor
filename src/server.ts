/**
 * Express server entry point.
 *
 * Sets up routes, middleware, health check, and starts listening.
 */

import express from 'express';
import { crawlRouter } from './routes/crawl.js';
import { jobsRouter } from './routes/jobs.js';
import { jobQueue } from './crawler/queue.js';

const app = express();
const PORT = parseInt(process.env.PORT || '3000', 10);

// ─── Middleware ───────────────────────────────────────────────
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// ─── CORS (allow all for API consumption) ────────────────────
app.use((_req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (_req.method === 'OPTIONS') {
        res.sendStatus(204);
        return;
    }
    next();
});

// ─── Health Check ────────────────────────────────────────────
app.get('/health', (_req, res) => {
    const counts = jobQueue.getStatusCounts();
    res.json({
        status: 'ok',
        uptime: Math.floor(process.uptime()),
        activeJobs: counts.running,
        queuedJobs: counts.queued,
    });
});

// ─── Routes ──────────────────────────────────────────────────
app.use('/crawl', crawlRouter);
app.use('/', jobsRouter);

// ─── 404 Handler ─────────────────────────────────────────────
app.use((_req, res) => {
    res.status(404).json({ error: 'Not found' });
});

// ─── Global Error Handler ────────────────────────────────────
app.use((err: Error & { type?: string; status?: number }, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    // Handle JSON parse errors (malformed request body)
    if (err.type === 'entity.parse.failed' || err.message.includes('JSON')) {
        res.status(400).json({ error: 'Invalid JSON in request body. Make sure to use double-quoted strings.' });
        return;
    }
    console.error('[SERVER] Unhandled error:', err.message);
    res.status(err.status || 500).json({ error: 'Internal server error' });
});

// ─── Start Server ────────────────────────────────────────────
app.listen(PORT, () => {
    console.log(`
╔═══════════════════════════════════════════════════════════════╗
║                                                               ║
║   🌐  Web Contact Extractor API                              ║
║   📡  Running on http://localhost:${PORT}                      ║
║   🏥  Health check: http://localhost:${PORT}/health             ║
║                                                               ║
║   Endpoints:                                                  ║
║   POST /crawl/single   — Crawl a single website              ║
║   POST /crawl/bulk     — Crawl multiple websites              ║
║   GET  /job/:jobId     — Get job status and results           ║
║   GET  /jobs           — List all jobs                        ║
║   DELETE /job/:jobId   — Delete a job                         ║
║   GET  /health         — Health check                         ║
║                                                               ║
╚═══════════════════════════════════════════════════════════════╝
  `);
});

export default app;
