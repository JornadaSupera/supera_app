import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Testes da lógica pura do app (utils e schemas): rodam no Node, sem navegador
// nem banco. Arquivo à parte do `vite.config.ts` para não carregar os plugins
// do app — a trava de variáveis de ambiente do build não vale para teste.
export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  define: {
    __APP_VERSION__: JSON.stringify('0.0.0-test'),
  },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
