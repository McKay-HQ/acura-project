import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In development (`npm run dev`), forward API and photo requests to the API on port 3000.
// In Docker, nginx does the same job (see nginx.conf.template).
const target = process.env.API_URL || 'http://localhost:3000';

export default defineConfig({
    plugins: [react()],
    server: { proxy: { '/api': target, '/uploads': target } },
    preview: { proxy: { '/api': target, '/uploads': target } },
});
