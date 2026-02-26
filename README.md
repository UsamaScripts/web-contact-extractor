# � ContactHarvest

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-20%20LTS-green.svg)](https://nodejs.org/)
[![Docker](https://img.shields.io/badge/Docker-Ready-blue.svg)](https://www.docker.com/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-blue.svg)](https://www.typescriptlang.org/)

A production-ready Node.js REST API that crawls websites and extracts **contact information** — emails, phone numbers, social media profiles, WhatsApp, and more.

Automatically detects whether a site is a **React/Vue/Angular SPA** (renders it with a real browser via Playwright) or a **server-rendered site** (uses fast HTML parsing with Cheerio) — no configuration needed.

> 🔌 **Works with [n8n](https://n8n.io), [Zapier](https://zapier.com), [Make](https://make.com), or any tool that can make HTTP requests.** Built with automation workflows in mind — submit a URL, poll for results, save to your sheet, done.

---

## ✨ Features

- 🔍 **Smart SPA Detection** — Fetches homepage via HTTP, counts visible text, auto-routes to Playwright or Cheerio
- 🚀 **Priority Page Probing** — HEAD-requests known contact paths (`/contact`, `/about`, `/careers`, etc.) in parallel before crawling to skip dead pages instantly
- 🔒 **Soft 404 Detection** — Detects sites that redirect missing pages to the homepage with a 200 status
- 📧 **Email Extraction** — Regex, `mailto:` links, and obfuscated email decoding (`[at]`, `[dot]`)
- 📞 **Phone Extraction** — From `tel:` links only, normalized to compact digit format
- 🌐 **Social Media** — LinkedIn, Twitter/X, Facebook, Instagram, YouTube, TikTok, Pinterest
- 💬 **WhatsApp & Skype** — `wa.me` links and `skype:` protocol
- 🏢 **Company Info** — Name and description from OG tags, meta tags, page title
- ⚡ **Async Job Queue** — Fire-and-forget API with job ID polling
- 🗑️ **Memory & Disk Cleanup** — `DELETE /job/:id` frees both RAM and Crawlee's on-disk storage
- 🔌 **N8N / Zapier / Make Ready** — Designed for automation workflow integration
- 🐳 **Fully Dockerized** — Single command deploy
- 🚦 **Rate Limited** — Built-in per-IP rate limiting

---

## 🚀 Quick Start

### With Docker (Recommended)

```bash
git clone https://github.com/your-username/contactharvest.git
cd contactharvest
docker-compose up --build
```

### Without Docker

```bash
git clone https://github.com/your-username/contactharvest.git
cd contactharvest
npm install
npx playwright install chromium
npm run dev
```

**For production:**
```bash
npm run build && npm start
```

API available at `http://localhost:3000`

---

## 📡 API Reference

### `POST /crawl/single` — Crawl a website

```bash
curl -X POST http://localhost:3000/crawl/single \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://example.com",
    "timeout": 120,
    "excludePaths": ["/press", "/events"]
  }'
```

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `url` | string | required | Website to crawl |
| `maxDepth` | number | 1 (SPA) / 3 (static) | Link follow depth |
| `maxPages` | number | unlimited | Max pages to visit |
| `timeout` | number | 120 | Total crawl timeout (seconds) |
| `excludePaths` | string[] | `[]` | Additional paths to skip |

**Response:**
```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "status": "queued",
  "message": "Job queued. Poll GET /job/a1b2c3d4-e5f6-7890-abcd-ef1234567890 to get results."
}
```

---

### `POST /crawl/bulk` — Crawl multiple websites

```bash
curl -X POST http://localhost:3000/crawl/bulk \
  -H "Content-Type: application/json" \
  -d '{
    "urls": ["https://site1.com", "https://site2.com"],
    "timeout": 120,
    "concurrency": 2
  }'
```

**Response:**
```json
{
  "jobIds": ["uuid1", "uuid2"],
  "status": "queued",
  "message": "2 jobs queued."
}
```

---

### `GET /job/:jobId` — Poll for results

```bash
curl http://localhost:3000/job/a1b2c3d4-e5f6-7890-abcd-ef1234567890
```

**While running:**
```json
{
  "jobId": "...",
  "status": "running",
  "pagesVisited": 5,
  "result": null
}
```

**On completion:**
```json
{
  "jobId": "...",
  "status": "completed",
  "pagesVisited": 8,
  "startedAt": "2024-01-01T00:00:00Z",
  "completedAt": "2024-01-01T00:01:30Z",
  "result": {
    "domain": "example.com",
    "companyName": "Example Corp",
    "description": "We build great software.",
    "emails": ["hello@example.com", "careers@example.com"],
    "phones": ["03001234567"],
    "socialMedia": {
      "linkedin": "https://linkedin.com/company/example",
      "instagram": "https://instagram.com/example",
      "twitter": null,
      "facebook": null,
      "youtube": null,
      "tiktok": null,
      "x": null,
      "pinterest": null
    },
    "whatsapp": [],
    "skype": [],
    "contactPages": ["https://example.com/contact"],
    "pagesScanned": ["https://example.com/", "https://example.com/contact"],
    "excludedPaths": ["/blog", "/posts"]
  }
}
```

---

### `DELETE /job/:jobId` — Free memory & disk

Removes the job result from RAM and deletes Crawlee's on-disk storage. Call this after you've saved the data.

```bash
curl -X DELETE http://localhost:3000/job/uuid-here
```

```json
{ "message": "Job uuid-here deleted successfully." }
```

---

### `GET /jobs` — List all jobs

```bash
# Paginated list
curl "http://localhost:3000/jobs?page=1&limit=20"

# Filter by status: queued | running | completed | failed
curl "http://localhost:3000/jobs?status=completed"
```

---

### `GET /health` — Health check

```bash
curl http://localhost:3000/health
```
```json
{ "status": "ok", "uptime": 123, "activeJobs": 1, "queuedJobs": 3 }
```

---

## 🔌 N8N Integration

Ideal workflow for bulk contact extraction into Google Sheets:

```
[Trigger]
    │
    ▼
POST /crawl/single  →  returns jobId
    │
    ▼
Wait (30s)
    │
    ▼
GET /job/{jobId}  →  check status
    │
    ├── status = "running"  →  loop back to Wait
    │
    └── status = "completed"
            │
            ▼
        Save to Google Sheet
            │
            ▼
        DELETE /job/{jobId}  ←  free memory
```

**Access result fields in N8N expressions:**
```
{{ $json.result.emails[0] }}
{{ $json.result.phones }}
{{ $json.result.socialMedia.linkedin }}
{{ $json.result.companyName }}
```

---

## ⚙️ Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | Server port |
| `NODE_ENV` | `development` | Environment |
| `MAX_CONCURRENCY` | `3` | Max concurrent crawl jobs |
| `DEFAULT_TIMEOUT` | `120` | Default crawl timeout (seconds) |
| `RATE_LIMIT_WINDOW_MS` | `60000` | Rate limit window (ms) |
| `RATE_LIMIT_MAX` | `10` | Max requests per window per IP |

---

## 🚫 Auto-Excluded Paths

These are automatically skipped during crawling as they don't contain contact info:

`/blog` `/posts` `/news` `/articles` `/category` `/tags` `/feed` `/rss` `/sitemap` `/wp-json` `/author` `/search` `/cdn-cgi`

Add your own via `excludePaths` in the request body.

---

## 🏗️ Project Structure

```
contactharvest/
├── src/
│   ├── server.ts              # Express app, routes, middleware
│   ├── crawler/
│   │   ├── index.ts           # SPA detection, probing, Playwright/Cheerio routing
│   │   ├── extractor.ts       # Email, phone, social extraction logic
│   │   ├── filters.ts         # URL filtering + priority paths
│   │   └── queue.ts           # In-memory job queue with disk cleanup
│   ├── routes/
│   │   ├── crawl.ts           # POST /crawl/single, /crawl/bulk
│   │   └── jobs.ts            # GET/DELETE /job/:id, GET /jobs
│   └── types/
│       └── index.ts           # TypeScript interfaces
├── Dockerfile
├── docker-compose.yml
├── .env.example
└── package.json
```

---

## 🤝 Contributing

1. Fork the repo
2. Create a branch: `git checkout -b feature/my-feature`
3. Install deps: `npm install && npx playwright install chromium`
4. Run dev: `npm run dev`
5. Open a Pull Request

---

## 📄 License

[MIT](LICENSE)
