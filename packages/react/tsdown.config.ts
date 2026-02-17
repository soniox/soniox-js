import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs', 'esm'],
  dts: { build: true },
  sourcemap: true,
  clean: true,
  external: ['react', '@soniox/client'],
});
