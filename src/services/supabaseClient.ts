import { createClient } from '@supabase/supabase-js';
import { secureGet, secureRemove, secureSet } from './secureStorage';

// Cliente Supabase — ainda não é usado em nenhuma tela nem em mockApi.
// Quando o backend estiver pronto, preencher VITE_SUPABASE_URL e
// VITE_SUPABASE_PUBLISHABLE_KEY no .env (ver .env.example) já é suficiente
// para `supabase` deixar de ser `null`; o passo seguinte é trocar, função
// por função, o corpo de cada uma em mockApi para chamar
// `supabase.from(...)`/`supabase.auth...` em vez do dado mockado, mantendo
// a mesma assinatura — as telas não mudam.
//
// Storage customizado: a sessão do Supabase carrega o token de acesso e o
// refresh token, que são dado sensível de um app de saúde. Vão para o
// armazenamento criptografado (Keychain no iOS, Keystore no Android), não
// para localStorage — que além de não criptografar, pode ser limpo pelo SO
// sob pressão de espaço no WebView. `supabase.auth` aceita um storage
// assíncrono nativamente, então basta implementar essa interface.
const secureStorageAdapter = {
  getItem: (key: string): Promise<string | null> => secureGet(key),
  setItem: (key: string, value: string): Promise<void> => secureSet(key, value),
  removeItem: (key: string): Promise<void> => secureRemove(key),
};

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

export const supabase =
  supabaseUrl && supabaseKey
    ? createClient(supabaseUrl, supabaseKey, {
        auth: { storage: secureStorageAdapter },
      })
    : null;
