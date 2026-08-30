import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Por padrão o Vite só entrega ao código do cliente as variáveis com
  // prefixo VITE_. As credenciais do Supabase são nomeadas sem ele, então o
  // prefixo precisa ser declarado aqui — sem isto, `import.meta.env.SUPABASE_URL`
  // é `undefined` em tempo de execução e o cliente nunca sai de `null`.
  //
  // ⚠️ Isto é uma janela: QUALQUER variável iniciada por SUPABASE_ passa a ser
  // embutida no pacote e fica pública. Nunca colocar `service_role` no .env.
  envPrefix: ['VITE_', 'SUPABASE_'],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
