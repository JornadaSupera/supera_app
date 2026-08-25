import { createClient } from '@supabase/supabase-js';
import { Preferences } from '@capacitor/preferences';

// Cliente Supabase — ainda não é usado em nenhuma tela nem em mockApi.js.
// Quando o backend estiver pronto, preencher VITE_SUPABASE_URL e
// VITE_SUPABASE_PUBLISHABLE_KEY no .env (ver .env.example) já é suficiente
// para `supabase` deixar de ser `null`; o passo seguinte é trocar, função
// por função, o corpo de cada uma em mockApi.js para chamar
// `supabase.from(...)`/`supabase.auth...` em vez do dado mockado, mantendo
// a mesma assinatura — as telas não mudam.
//
// Storage customizado: num app nativo empacotado via Capacitor, o
// localStorage do WebView pode ser limpo pelo SO sob pressão de espaço —
// não é confiável para persistir a sessão de login. O Preferences
// (@capacitor/preferences) usa UserDefaults (iOS) e SharedPreferences
// (Android), que são de fato persistentes. `supabase.auth` já aceita um
// storage assíncrono nativamente, então basta implementar essa interface.
const capacitorStorageAdapter = {
  getItem: async (key) => (await Preferences.get({ key })).value,
  setItem: (key, value) => Preferences.set({ key, value }),
  removeItem: (key) => Preferences.remove({ key }),
};

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

export const supabase =
  supabaseUrl && supabaseKey
    ? createClient(supabaseUrl, supabaseKey, {
        auth: { storage: capacitorStorageAdapter },
      })
    : null;
