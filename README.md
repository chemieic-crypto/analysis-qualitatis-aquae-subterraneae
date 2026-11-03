# Groundwater Compliance Reporting Engine

A comprehensive web application for evaluating groundwater quality against Bureau of Indian Standards (**IS 10500:2012**), generating water quality alerts for heavy metals, spatial compliance mapping, Piper & USSL hydrochemical diagrams, monsoon impact analysis, PCA, and multi-format Excel bulletins.

---

## 🚀 One-Click GitHub Pages Deployment

This repository includes a pre-configured GitHub Actions workflow (`.github/workflows/deploy.yml`) that automatically builds and deploys the application to **GitHub Pages** whenever you push code to `main` or `master`.

### How to Enable GitHub Pages on your GitHub Repo:
1. Push this repository to GitHub.
2. In your GitHub repository, click **Settings** (gear icon in the top navigation).
3. On the left sidebar under *Code and automation*, click **Pages**.
4. Under **Build and deployment** → **Source**, select **GitHub Actions** (instead of *Deploy from a branch*).
5. Next time you push (or run the workflow manually from the **Actions** tab), GitHub will automatically build and publish your app at:
   `https://<your-username>.github.io/<your-repo-name>/`

---

## 💻 Run Locally

### Prerequisites
- **Node.js** (v18 or higher recommended)
- **npm** (comes with Node.js)

### Steps
1. **Clone the repository:**
   ```bash
   git clone https://github.com/<your-username>/<your-repo-name>.git
   cd <your-repo-name>
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Start the development server:**
   ```bash
   npm run dev
   ```
   Open [http://localhost:3000](http://localhost:3000) in your browser.

4. **Build and preview production bundle:**
   ```bash
   npm run build
   npm run preview
   ```

---

## 🌐 Deploy to Vercel / Netlify / Cloudflare Pages

This project is built with Vite and standard static SPA output in `dist/`. You can deploy it instantly on any modern web host:

- **Build Command:** `npm run build`
- **Output Directory:** `dist`
- **Install Command:** `npm install`

---

## ⚙️ Key Technical Configurations

- **Universal Base Path**: Automatically adapts to GitHub Pages repository sub-paths (`/<repo>/`) during GitHub Actions CI, and to `./` for local runs, custom domains, Vercel, and Netlify.
- **GitHub Pages Routing & Jekyll bypass**: Automatically generates `.nojekyll` and `404.html` fallback in `dist/` during every build to prevent 404s.
- **Optimized Bundling**: Highcharts, SheetJS, ExcelJS, Leaflet, and Turf.js are cleanly split into modular vendor chunks for ultra-fast browser loading.
