import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Sem `envPrefix` customizado: o padrão do Vite já é `VITE_`, e as
  // credenciais do Supabase usam esse prefixo (`VITE_SUPABASE_URL`,
  // `VITE_SUPABASE_PUBLISHABLE_KEY` — ver `.env.example`). Um `envPrefix`
  // mais largo embutiria QUALQUER variável com aquele começo no bundle
  // público, inclusive uma `SUPABASE_SERVICE_ROLE_KEY` posta no `.env` por
  // engano — por isso não alargar isto de novo.
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
