import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import fs from 'fs';
import {defineConfig, Plugin} from 'vite';

const getBasePath = () => {
  if (process.env.BASE_PATH) return process.env.BASE_PATH;
  if (process.env.GITHUB_REPOSITORY) {
    const [owner, repoName] = process.env.GITHUB_REPOSITORY.split('/');
    if (repoName) {
      if (repoName.toLowerCase() === `${owner.toLowerCase()}.github.io`) {
        return '/';
      }
      return `/${repoName}/`;
    }
  }
  return './';
};

function githubPagesPlugin(): Plugin {
  return {
    name: 'github-pages-plugin',
    closeBundle() {
      try {
        const distDir = path.resolve(__dirname, 'dist');
        if (fs.existsSync(distDir)) {
          // 1. Create .nojekyll to prevent GitHub Pages Jekyll from ignoring files
          fs.writeFileSync(path.join(distDir, '.nojekyll'), '');
          
          // 2. Duplicate index.html to 404.html for SPA route fallback
          const indexPath = path.join(distDir, 'index.html');
          if (fs.existsSync(indexPath)) {
            fs.copyFileSync(indexPath, path.join(distDir, '404.html'));
          }
        }
      } catch (err) {
        console.error('Failed to write GitHub Pages deployment files:', err);
      }
    },
  };
}

export default defineConfig(() => {
  return {
    base: getBasePath(),
    plugins: [react(), tailwindcss(), githubPagesPlugin()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      port: 3000,
      host: '0.0.0.0',
      allowedHosts: true as const,
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
