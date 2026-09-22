import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    serverless: 'src/serverless.ts',
    'seed-demo': 'src/scripts/seed-demo.ts',
    'reset-admin-password': 'src/scripts/reset-admin-password.ts',
    'generate-cert': 'src/scripts/generate-cert.ts',
  },
  format: ['esm'],
  platform: 'node',
  target: 'node20',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  splitting: true,
  noExternal: ['@pos/shared'],
});
