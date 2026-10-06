// Peças comuns às Edge Functions da Fase 4 (ADR-026): create-caregiver,
// complete-first-password, reset-caregiver-password e send-patient-invite. E
// às da Fase F (ADR-031): create-staff-account e reset-mfa-factor.
//
// Não é função: diretórios com `_` na frente não viram endpoint, e o bundler
// do deploy segue os imports relativos.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// O app (Capacitor) e o painel (Firebase Hosting) chamam de outra origem.
// A autorização é o JWT no header, não a origem, então `*` não abre nada.
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...CORS_HEADERS,
      "Content-Type": "application/json",
      // Algumas respostas levam senha provisória. Nenhuma pode parar em cache.
      "Cache-Control": "no-store",
    },
  });
}

export function preflight(req: Request): Response | null {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });
  return null;
}

export async function readBody(req: Request): Promise<Record<string, unknown> | null> {
  try {
    const body = await req.json();
    return body && typeof body === "object" ? body as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

function env(name: string): string {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`variavel ausente: ${name}`);
  return v;
}

// SUPABASE_URL, SUPABASE_ANON_KEY e SUPABASE_SERVICE_ROLE_KEY o runtime injeta.
export function adminClient(): SupabaseClient {
  return createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export type Caller = { client: SupabaseClient; userId: string; jwt: string };

// O cliente COM O JWT DE QUEM CHAMOU. Toda RPC de negócio passa por ele: é o
// que faz auth.uid() valer no banco, a RLS filtrar e a trilha gravar a pessoa
// certa como autora. verify_jwt está desligado no config.toml (padrão da CLI
// para as chaves novas); a validação é esta, contra o Auth, a cada chamada.
export async function caller(req: Request): Promise<Caller | null> {
  const header = req.headers.get("Authorization") ?? "";
  const jwt = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!jwt) return null;

  const client = createClient(env("SUPABASE_URL"), env("SUPABASE_ANON_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });
  const { data, error } = await client.auth.getUser(jwt);
  if (error || !data.user) return null;
  return { client, userId: data.user.id, jwt };
}

// A exceção do banco chega como `message` do PostgREST. Os nomes são o
// contrato com os front-ends (guia do banco, §5.2 e §5.12); o status HTTP é
// só para quem olha o log.
const STATUS_BY_ERROR: Record<string, number> = {
  forbidden: 403,
  not_patient_owner: 403,
  caregiver_disabled: 403,
  caregiver_already_active: 409,
  email_in_use: 409,
  patient_already_linked: 409,
  patient_inactive: 409,
  not_first_login: 409,
  password_change_required: 409,
  caregiver_not_found: 404,
  patient_not_found: 404,
  invalid_phone: 422,
  invalid_name: 422,
  invalid_scope: 422,
  // Fase L (ADR-020 §9): ficha de menor de 18 anos nao recebe convite.
  underage: 422,
  temporary_password_expired: 410,
  rate_limited: 429,
  // Fase F (ADR-031): create-staff-account e reset-mfa-factor.
  mfa_required: 403,
  cannot_reset_own_factor: 403,
  cannot_manage_own_professional_profile: 403,
  account_is_patient: 409,
  account_is_caregiver: 409,
  professional_already_registered: 409,
  staff_invitation_pending: 409,
  staff_invitation_not_found: 404,
  staff_account_not_found: 404,
  invalid_email: 422,
  council_registration_required: 422,
  specialty_required: 422,
  unknown_specialty: 422,
  primary_specialty_not_in_list: 422,
};

export function fromDbError(error: { message?: string } | null): Response {
  const code = error?.message ?? "";
  const status = STATUS_BY_ERROR[code];
  if (status) return json(status, { error: code });
  console.error("erro nao mapeado do banco:", code);
  return json(500, { error: "internal_error" });
}

// ------------------------------------------------------------
// Senha provisória
// ------------------------------------------------------------
//
// 10 caracteres, sem 0/O/1/l/I: a senha é lida numa mensagem e digitada à mão
// por outra pessoa. Com 55 símbolos, 10 caracteres dão ~57 bits — de sobra
// para uma credencial que vale 72 h e não abre nada antes de ser trocada.
// Pelo menos uma minúscula, uma maiúscula e um dígito, para passar em qualquer
// política de senha que a CONTRATANTE ligue no Auth.
const ALPHABET = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function temporaryPassword(): string {
  for (;;) {
    const out: string[] = [];
    const buf = new Uint8Array(1);
    while (out.length < 10) {
      crypto.getRandomValues(buf);
      // Rejeição: sem ela, os primeiros símbolos sairiam mais que os outros.
      if (buf[0] >= 256 - (256 % ALPHABET.length)) continue;
      out.push(ALPHABET[buf[0] % ALPHABET.length]);
    }
    const p = out.join("");
    if (/[a-z]/.test(p) && /[A-Z]/.test(p) && /[0-9]/.test(p)) return p;
  }
}

// ------------------------------------------------------------
// SMS — Twilio (conta da CONTRATANTE, D.13)
// ------------------------------------------------------------
//
// Secrets (supabase secrets set …):
//   TWILIO_ACCOUNT_SID
//   TWILIO_AUTH_TOKEN
//   TWILIO_FROM                   número remetente em E.164, OU
//   TWILIO_MESSAGING_SERVICE_SID  serviço de mensagens (tem precedência)
//   TWILIO_API_URL                opcional; só para apontar a um provedor falso em teste
//
// Sem as secrets, `smsConfigured()` é falso e as funções respondem
// `sms_failed` ANTES de criar conta ou emitir convite.

export function smsConfigured(): boolean {
  return Boolean(
    Deno.env.get("TWILIO_ACCOUNT_SID") && Deno.env.get("TWILIO_AUTH_TOKEN") &&
      (Deno.env.get("TWILIO_FROM") || Deno.env.get("TWILIO_MESSAGING_SERVICE_SID")),
  );
}

export async function sendSms(to: string, body: string): Promise<{ ok: true; sid: string } | { ok: false; error: string }> {
  const sid = env("TWILIO_ACCOUNT_SID");
  const token = env("TWILIO_AUTH_TOKEN");
  const base = Deno.env.get("TWILIO_API_URL") ?? "https://api.twilio.com";
  const form = new URLSearchParams({ To: to, Body: body });
  const service = Deno.env.get("TWILIO_MESSAGING_SERVICE_SID");
  if (service) form.set("MessagingServiceSid", service);
  else form.set("From", env("TWILIO_FROM"));

  try {
    const res = await fetch(`${base}/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${btoa(`${sid}:${token}`)}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: form,
    });
    const text = await res.text();
    if (!res.ok) return { ok: false, error: `provedor ${res.status}: ${text.slice(0, 300)}` };
    const parsed = JSON.parse(text) as { sid?: string };
    return { ok: true, sid: parsed.sid ?? "" };
  } catch (e) {
    return { ok: false, error: `rede: ${(e as Error).message}` };
  }
}

// "+5549999991234" -> "(49) *****-1234". O painel e o app mostram isto, nunca
// o número inteiro: basta para a pessoa reconhecer o próprio celular.
export function maskPhone(e164: string): string {
  const d = e164.replace(/^\+55/, "");
  return `(${d.slice(0, 2)}) *****-${d.slice(-4)}`;
}

// Validade em horário de Brasília, sem acento: SMS com acento sai em UCS-2 e
// cabe 70 caracteres em vez de 160.
export function brDateTime(iso: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso)).replace(",", "");
}
