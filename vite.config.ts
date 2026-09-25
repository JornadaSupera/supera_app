import path from 'path';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

/**
 * Toda variável sem a qual o pacote sai quebrado — sem erro, sem log, só um
 * botão ou uma tela que deixam de existir.
 *
 * Como `.env` não é versionado, TODA máquina que empacota precisa ter as
 * quatro preenchidas. É por isso que a lista está aqui: sem esta checagem,
 * esquecer uma delas não dá erro nenhum, só some com o botão do Google na
 * loja — foi o que aconteceu uma vez.
 */
const VARIAVEIS_OBRIGATORIAS = [
  'VITE_SUPABASE_URL',
  'VITE_SUPABASE_PUBLISHABLE_KEY',
  'VITE_GOOGLE_WEB_CLIENT_ID',
  'VITE_GOOGLE_IOS_CLIENT_ID',
] as const;

/**
 * Trava `vite build` quando falta configuração obrigatória.
 *
 * O app degrada em silêncio DE PROPÓSITO em runtime (cliente Supabase nulo,
 * botão do Google escondido — ver `supabaseClient.ts` e `socialAuth.ts`):
 * pior que o botão não aparecer é abrir um diálogo que falha depois de a
 * pessoa já ter escolhido a conta. Mas essa mesma degradação graciosa, sem
 * nada travando o BUILD, foi o que deixou um pacote sem os client IDs do
 * Google subir para o TestFlight — a build passou, o lint passou, o
 * typecheck passou, e os botões sumiram sem ninguém saber por quê.
 *
 * `configResolved` (não `buildStart`, hook do Rollup que não recebe
 * `config.env` nem `config.command`) já entrega o env resolvido — arquivos
 * `.env*` + variáveis do processo, na mesma ordem de precedência que o Vite
 * usa de verdade — e sabe se é build ou serve. `npm run dev` continua abrindo
 * sem nenhuma variável: travar o dev local não protege nenhum release e só
 * atrapalha quem acabou de clonar o repositório.
 *
 * Esta checagem é a ÚNICA proteção contra o build sem configuração, já que
 * `.env` não viaja com o repositório. Ela não impede o esquecimento — só
 * garante que ele apareça aqui, e não na loja.
 */
function validarAmbiente(): Plugin {
  return {
    name: 'supera:validar-ambiente',
    configResolved(config) {
      if (config.command !== 'build') return;

      const faltando = VARIAVEIS_OBRIGATORIAS.filter(
        (nome) => !String(config.env[nome] ?? '').trim()
      );

      if (faltando.length > 0) {
        throw new Error(
          [
            '',
            'Build abortada: falta configuracao obrigatoria.',
            '',
            ...faltando.map((nome) => `  - ${nome}`),
            '',
            'Onde definir:',
            '  .env                 copie de .env.example e preencha. Fora do',
            '                       git, entao precisa existir em CADA maquina',
            '                       que gera pacote - inclusive a do build iOS.',
            '  variavel de ambiente vence o .env - e o caminho para CI',
            '',
            'Ver .env.example.',
            '',
          ].join('\n')
        );
      }
    },
  };
}

/**
 * Avisa, em destaque, quando o build sai com a demonstração do acompanhante
 * ligada (`VITE_CAREGIVER_DEMO=true`). É o que se quer num build de TESTE, e
 * nunca num build de loja: o app mostraria dados de exemplo no lugar do banco.
 * Não trava o build — só não deixa passar em silêncio.
 */
function avisarDemonstracao(): Plugin {
  return {
    name: 'supera:avisar-demonstracao',
    configResolved(config) {
      if (config.command !== 'build') return;
      if (String(config.env.VITE_CAREGIVER_DEMO ?? '').trim() !== 'true') return;

      config.logger.warn(
        [
          '',
          '==================================================================',
          '  BUILD DE TESTE: demonstracao do acompanhante LIGADA',
          '  (VITE_CAREGIVER_DEMO=true). Dados de exemplo, nada vai ao banco.',
          '  NAO publicar este pacote na loja.',
          '==================================================================',
          '',
        ].join('\n')
      );
    },
  };
}

export default defineConfig({
  plugins: [validarAmbiente(), avisarDemonstracao(), react(), tailwindcss()],
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
