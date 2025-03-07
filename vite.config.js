import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  root: 'app',
  build: {
    outDir: '../react-dist',
    emptyOutDir: true,
  },
  base: './',
  plugins: [react()],
});
