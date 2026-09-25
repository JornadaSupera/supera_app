/**
 * Verificação do celular por SMS no cadastro.
 *
 * Desligada por padrão. A tela e as chamadas já existem; o que falta está do
 * lado do banco e do provedor de SMS (envio do código e a função que liga a
 * conta à ficha). Quando isso estiver no ar, basta `VITE_PHONE_VERIFICATION=true`
 * no `.env` do build — sem mexer no código.
 *
 * Desligada, depois de criar a conta a pessoa digita o código de ativação que
 * a recepção gera no painel; quem ainda não o tem fica na tela de espera e
 * digita depois, em `/confirmar-cadastro`.
 */
export const PHONE_VERIFICATION_ENABLED = import.meta.env.VITE_PHONE_VERIFICATION === 'true';

/**
 * Modo demonstração do acompanhante: no `npm run dev` ou num build de TESTE.
 *
 * As funções do banco que o módulo usa ainda não existem, então sem isto só se
 * veria o aviso "ainda não disponível". Com `VITE_CAREGIVER_DEMO=true` (só no
 * dev: `.env.development.local`; no dev e no build desta máquina: `.env` ou
 * `.env.local`), as chamadas ao banco são trocadas por dados de exemplo
 * guardados em memória (`services/caregiverDemo.ts`), e dá para percorrer o
 * fluxo inteiro: adicionar, enviar, editar, gerar nova senha, trocar a senha do
 * primeiro acesso e revogar. Nada é enviado nem gravado, e cada tela do módulo mostra o
 * aviso "Demonstração".
 *
 * Só entra no pacote quando a variável é `true` na hora do build (o `import()`
 * da demonstração sai junto quando ela é falsa). O build avisa em destaque
 * quando ela está ligada (`vite.config.ts`): **nunca publicar na loja assim.**
 */
export const CAREGIVER_DEMO_ENABLED = import.meta.env.VITE_CAREGIVER_DEMO === 'true';

/**
 * Acompanhante criado pelo paciente (Perfil → Meu acompanhante).
 *
 * No desenvolvimento (`npm run dev`) fica ligado, para a tela poder ser vista;
 * `VITE_CAREGIVER_MODULE=false` desliga. No build fica DESLIGADO até o banco
 * entregar as funções do item 30 do `PENDENCIAS_BANCO.md` (as Edge Functions
 * `create-caregiver`, `update-caregiver`, `reset-caregiver-password` e
 * `complete-first-password`, e a RPC `get_my_caregiver`): antes disso a seção do
 * Perfil e as rotas levariam a uma tela que só falharia. Quando o banco
 * entregar: `VITE_CAREGIVER_MODULE=true` no `.env` do build.
 *
 * A troca obrigatória da senha provisória (`/trocar-senha`) NÃO depende desta
 * chave: ela lê a marca `app_metadata.must_change_password` da própria sessão.
 *
 * Com a demonstração ligada, o módulo liga junto (é para ser visto).
 */
const caregiverModuleFlag = import.meta.env.VITE_CAREGIVER_MODULE;

export const CAREGIVER_MODULE_ENABLED =
  caregiverModuleFlag === 'true' ||
  CAREGIVER_DEMO_ENABLED ||
  (caregiverModuleFlag !== 'false' && import.meta.env.DEV);

/**
 * Só em desenvolvimento e sem a demonstração: com o banco ainda sem as funções,
 * a tela do acompanhante só diria "ainda não disponível". Esta frase diz como
 * ver o fluxo. `null` no build e com a demonstração ligada.
 */
export const CAREGIVER_DEMO_HINT =
  import.meta.env.DEV && !CAREGIVER_DEMO_ENABLED
    ? 'Para ver as telas sem o banco, ponha VITE_CAREGIVER_DEMO=true no .env.local e reinicie o npm run dev.'
    : null;

/** Onde baixar o app, para a mensagem do acompanhante. Vazio até a publicação nas lojas. */
export const APP_STORE_URL = import.meta.env.VITE_APP_STORE_URL?.trim() ?? '';
export const PLAY_STORE_URL = import.meta.env.VITE_PLAY_STORE_URL?.trim() ?? '';
