# Groundwater Compliance Reporting Engine

A web application for evaluating groundwater quality against Bureau of Indian Standards (**IS 10500:2012**), generating water quality alerts, spatial compliance mapping, Piper & USSL hydrochemical diagrams, monsoon impact analysis, PCA, and multi-format Excel/JPEG bulletins.

---

## Architecture & Deployment Modes

This repository supports two distinct deployment architectures:

1. **Static Frontend Mode (GitHub Pages / Static CDN)**
   - `.github/workflows/deploy.yml` builds only the static Vite frontend (`./dist`) and publishes it to GitHub Pages.
   - GitHub Pages **cannot** execute `server.ts`, host `/api/ai/*` endpoints, or store server-side secrets such as `GEMINI_API_KEY`.
   - Core groundwater calculations, diagrams, Excel exports, and shapefile filtering run 100% client-side in the browser.

2. **Full-Stack Node.js Mode (`server.ts` + Express + Static `dist/`)**
   - Required if you expose the server-side AI endpoints (`POST /api/ai/chat`, `POST /api/ai/quick-audit`, `GET /api/health`).
   - Run `npm run build` followed by `npm start` on a Node.js host (Node 20+ recommended) with `GEMINI_API_KEY` configured as a **server-side** environment variable.
   - Never expose `GEMINI_API_KEY` in client code, `VITE_*` variables, or committed files.

---

## Local Development & Supported Scripts

### Prerequisites
- **Node.js** (v20 or higher recommended)
- **npm**

### Commands
- Install dependencies cleanly from the lockfile:
  ```bash
  npm ci
  ```
- Start the full-stack development server (Express API + Vite middleware on `http://localhost:3000`):
  ```bash
  npm run dev
  ```
- Type-check all client and server TypeScript files:
  ```bash
  npm run lint
  ```
- Run the automated test suite (`tsx --test`):
  ```bash
  npm test
  ```
- Build the production frontend bundle into `dist/`:
  ```bash
  npm run build
  ```
- Start the production Express server (`tsx server.ts --production`, serving `dist/` and `/api/*`):
  ```bash
  npm start
  ```
- Preview the static `dist/` bundle without the Express API server:
  ```bash
  npm run preview
  ```

---

## Server-Side AI Endpoint Safeguards

`POST /api/ai/chat` and `POST /api/ai/quick-audit` include runtime schema validation, body size caps (`256kb` default), fixed-window per-IP rate limiting, bounded concurrent upstream calls, and upstream timeouts. These limits can be tuned via environment variables (see `.env.example`).

Note: CORS alone is not authentication or abuse protection. If you deploy the Express server publicly, place it behind appropriate authentication, reverse-proxy rate limiting, or network access controls for your organization.
