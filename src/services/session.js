// Sessão do paciente autenticado. Hoje guarda só um marcador local em
// localStorage (não há backend real ainda — ver CLAUDE.md).
//
// Quando a autenticação passar a ser via Supabase Auth (ver
// supabaseClient.js), este arquivo deixa de guardar sessão por conta
// própria — o Supabase já gerencia a sessão dele mesmo (com refresh de
// token automático, persistida via o storage do Capacitor configurado em
// supabaseClient.js). `login`/`logout`/`isAuthenticated`/`getToken`
// passam a ser wrappers finos chamando
// `supabase.auth.signInWithPassword`/`signOut`/`getSession`.
// Diferença real que vai exigir mexer nos call-sites: as funções do
// Supabase são todas assíncronas, então `isAuthenticated()` (hoje síncrona,
// usada por RequireAuth.jsx e Splash.jsx) precisa virar `async` — o guard
// de rota vai precisar de um estado de "carregando" enquanto confirma a
// sessão, em vez de decidir na hora.

const SESSION_KEY = 'supera_session';

export function login(token = 'mock-session-token') {
  localStorage.setItem(SESSION_KEY, token);
}

export function logout() {
  localStorage.removeItem(SESSION_KEY);
}

export function isAuthenticated() {
  return Boolean(localStorage.getItem(SESSION_KEY));
}

export function getToken() {
  return localStorage.getItem(SESSION_KEY);
}
