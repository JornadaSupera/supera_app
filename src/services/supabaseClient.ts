import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { secureGet, secureRemove, secureSet } from './secureStorage';

// Cliente Supabase — porta única de acesso ao banco, Auth e Storage.
//
// Storage customizado: a sessão carrega o access token e o refresh token, que
// são dado sensível de um app de saúde. Vão para o armazenamento criptografado
// (Keychain no iOS, Keystore no Android), não para localStorage — que além de
// não criptografar, pode ser limpo pelo SO sob pressão de espaço no WebView.
// `supabase.auth` aceita um storage assíncrono nativamente, então basta
// implementar essa interface.
const secureStorageAdapter = {
  getItem: (key: string): Promise<string | null> => secureGet(key),
  setItem: (key: string, value: string): Promise<void> => secureSet(key, value),
  removeItem: (key: string): Promise<void> => secureRemove(key),
};

const supabaseUrl = import.meta.env.SUPABASE_URL;
const supabaseKey = import.meta.env.SUPABASE_PUBLISHABLE_KEY;

export const supabase: SupabaseClient | null =
  supabaseUrl && supabaseKey
    ? createClient(supabaseUrl, supabaseKey, {
        auth: {
          storage: secureStorageAdapter,
          // Sessão sobrevive ao fechamento do app e se renova sozinha: sem
          // isso o paciente reautenticaria a cada abertura.
          persistSession: true,
          autoRefreshToken: true,
          // Necessário para a recuperação de senha: o link do e-mail volta
          // para o app carregando o código, e é esta opção que faz o cliente
          // trocá-lo por uma sessão ao carregar a página.
          detectSessionInUrl: true,
          // PKCE em vez do fluxo implícito: o token não trafega na URL, o que
          // importa num app que abre links por deep link. Efeito colateral
          // aceito conscientemente — o link precisa ser aberto no mesmo
          // aparelho que pediu a redefinição, porque o verifier fica no cofre
          // local. Abrir o e-mail em outro dispositivo invalida o código.
          flowType: 'pkce',
        },
      })
    : null;

/**
 * Devolve o cliente ou falha com uma mensagem que diz o que fazer.
 *
 * `supabase` é `null` quando as variáveis de ambiente não estão definidas —
 * situação normal em uma cópia recém-clonada do repositório. Sem esta função,
 * o sintoma seria um `TypeError` de `null` no meio de uma tela; com ela, a
 * causa aparece já no toast de erro.
 */
export function requireSupabase(): SupabaseClient {
  if (!supabase) {
    throw new Error(
      'Conexão com o servidor não configurada. Defina SUPABASE_URL e SUPABASE_PUBLISHABLE_KEY no arquivo .env.'
    );
  }

  return supabase;
}
