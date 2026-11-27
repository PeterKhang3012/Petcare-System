import { existsSync, readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const envFile = new URL('../.env', import.meta.url);
const rootEnv = existsSync(envFile) ? parseEnv(readFileSync(envFile, 'utf8')) : {};
const gateway = {
  target: process.env.PAWSTAY_GATEWAY_TARGET || rootEnv.PAWSTAY_GATEWAY_TARGET || 'http://127.0.0.1:8080',
  changeOrigin: true,
};
const proxy = { '/api': gateway, '/docs-api': gateway };

export default defineConfig({ plugins: [react()], server: { proxy }, preview: { proxy } });
