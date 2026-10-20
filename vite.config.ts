/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: { chunkSizeWarningLimit: 1200 }, // Firebase SDK を含むため
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
