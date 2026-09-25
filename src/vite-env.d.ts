/// <reference types="vite/client" />

// Declarar aqui evita que as credenciais do Supabase caiam no index
// signature `any` de `ImportMetaEnv`, que o padrão de qualidade do projeto
// proíbe. Opcionais de propósito: numa cópia recém clonada, sem .env, elas
// realmente não existem.
interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string;
  /**
   * Client IDs do Google para o login nativo. Não são segredo — client ID de
   * OAuth é público e vai no pacote do app de qualquer forma; estão aqui por
   * serem configuração de ambiente, não por sigilo.
   *
   * Sem eles o app esconde o botão do Google no aparelho, em vez de abrir um
   * diálogo que falharia depois de a pessoa já ter escolhido a conta.
   */
  readonly VITE_GOOGLE_WEB_CLIENT_ID?: string;
  readonly VITE_GOOGLE_IOS_CLIENT_ID?: string;
  /** `'true'` liga a verificação do celular por SMS no cadastro (ver `lib/features.ts`). */
  readonly VITE_PHONE_VERIFICATION?: string;
  /**
   * `'true'` liga a tela "Meu acompanhante" no build; `'false'` a desliga também no
   * desenvolvimento, onde ela vem ligada (ver `lib/features.ts`).
   */
  readonly VITE_CAREGIVER_MODULE?: string;
  /** `'true'` troca o banco por dados de exemplo no acompanhante, só em desenvolvimento. */
  readonly VITE_CAREGIVER_DEMO?: string;
  /** Endereços de download do app, que entram na mensagem enviada ao acompanhante. Públicos. */
  readonly VITE_APP_STORE_URL?: string;
  readonly VITE_PLAY_STORE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
