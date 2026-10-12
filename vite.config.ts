import { defineConfig } from 'vite';

// base relativa: funciona em https://<usuario>.github.io/<repo>/ sem configurar o nome do repo
export default defineConfig({
  base: './',
  build: { outDir: 'dist', target: 'es2020' },
  test: { include: ['tests/**/*.test.ts'] },
});
