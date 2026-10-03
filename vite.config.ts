import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// `npm run build` → dist/ (static site). `npm run build:single` → one self-contained HTML file.
export default defineConfig(({ mode }) => ({
  base: './',
  build: {
    target: 'es2022',
    outDir: mode === 'single' ? 'dist-single' : 'dist',
    chunkSizeWarningLimit: 2000,
  },
  worker: { format: 'es' },
  plugins: mode === 'single' ? [viteSingleFile()] : [],
}));
