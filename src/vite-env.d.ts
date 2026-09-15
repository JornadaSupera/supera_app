/// <reference types="vite/client" />

// Declarar aqui evita que as credenciais do Supabase caiam no index
// signature `any` de `ImportMetaEnv`, que o padrão de qualidade do projeto
// proíbe. Opcionais de propósito: numa cópia recém clonada, sem .env, elas
// realmente não existem.
interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
