/// <reference types="vite/client" />

// As credenciais do Supabase não usam o prefixo VITE_ — quem as expõe ao
// cliente é o `envPrefix` do vite.config.ts. Declarar aqui evita que elas
// caiam no index signature `any` de `ImportMetaEnv`, que o padrão de
// qualidade do projeto proíbe. Opcionais de propósito: numa cópia recém
// clonada, sem .env, elas realmente não existem.
interface ImportMetaEnv {
  readonly SUPABASE_URL?: string;
  readonly SUPABASE_PUBLISHABLE_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
