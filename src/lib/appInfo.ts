// Dados do próprio app, fixados no momento do build.

/**
 * Versão do app — a do `package.json`, gravada no pacote pelo Vite
 * (`__APP_VERSION__`, em `vite.config.ts`). Antes o Perfil mostrava um
 * "1.0.0" escrito à mão, que não acompanhava nenhuma versão de verdade.
 *
 * No aparelho, a versão da loja vem dos projetos nativos (`versionName` no
 * Android, `MARKETING_VERSION` no iOS): a cada publicação, os três sobem
 * juntos.
 */
export const APP_VERSION: string = __APP_VERSION__;
