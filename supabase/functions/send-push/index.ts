// send-push — consome a fila de notification_deliveries e entrega o push pelo
// OneSignal. Fase 2.3 das pendências consolidadas (app #10, painel T-4).
//
// Quem chama: a rotina pg_cron `push-dispatch`, pelo pg_net, a cada minuto
// (migration create_push_dispatch). Não há JWT de usuário no caminho, por isso
// verify_jwt = false no config.toml; o portão é o header x-dispatch-secret.
//
// O que a função NUNCA manda ao provedor: dado de saúde. O push leva o título
// genérico do tipo (notification_types.label), um texto fixo e a referência
// (tipo, target_table, target_id). O app abre o alvo e lê o conteúdo pelo
// banco, sob RLS. É a ADR-015 §2 valendo também fora da região brasileira.
//
// Secrets (supabase secrets set …):
//   PUSH_DISPATCH_SECRET    o mesmo valor do segredo push_dispatch_secret do Vault
//   ONESIGNAL_APP_ID        id do app no OneSignal
//   ONESIGNAL_REST_API_KEY  chave REST do app (conta da CONTRATANTE)
//   ONESIGNAL_API_URL       opcional; só para apontar a um provedor falso em teste
// SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY o runtime injeta.

import "@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const ONESIGNAL_DEFAULT_URL = "https://api.onesignal.com/notifications";

// O texto do corpo é fixo e genérico. O título vem do tipo.
const GENERIC_BODY = "Abra o app para ver os detalhes.";

const BATCH_SIZE = 100;
// A rotina roda a cada minuto e o pg_net espera até 55 s. Parar antes disso
// evita duas execuções drenando a mesma fila ao mesmo tempo (a fila aguenta,
// com FOR UPDATE SKIP LOCKED, mas não há por que provocar).
const TIME_BUDGET_MS = 45_000;
// A partir desta tentativa a entrega desiste (given_up). O backoff é 2^n min:
// 2, 4, 8, 16 — cerca de meia hora entre a primeira falha e a desistência.
const MAX_ATTEMPTS = 5;

type Delivery = {
  id: string;
  notification_id: string;
  channel: "push" | "sms" | "email";
  attempts: number;
};

type Outcome =
  | { status: "sent"; providerId: string }
  | { status: "skipped" | "failed" | "given_up"; error: string }
  | { status: "pending"; error: string; nextAttemptAt: string };

type Config = { appId: string; apiKey: string; apiUrl: string };

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// Comparação em tempo constante: o segredo não vaza por tempo de resposta.
function sameSecret(given: string, expected: string): boolean {
  const a = new TextEncoder().encode(given);
  const b = new TextEncoder().encode(expected);
  let diff = a.length ^ b.length;
  for (let i = 0; i < b.length; i++) diff |= (a[i] ?? 0) ^ b[i];
  return diff === 0;
}

function retryOrGiveUp(d: Delivery, error: string): Outcome {
  // `attempts` já foi incrementado por claim_notification_deliveries.
  if (d.attempts >= MAX_ATTEMPTS) return { status: "given_up", error };
  const next = new Date(Date.now() + 2 ** d.attempts * 60_000).toISOString();
  return { status: "pending", error, nextAttemptAt: next };
}

async function deliver(db: SupabaseClient, cfg: Config, d: Delivery): Promise<Outcome> {
  // SMS e e-mail ainda não têm provedor contratado (T-4). A entrega fecha como
  // skipped, com o motivo, em vez de ficar pending para sempre.
  if (d.channel !== "push") {
    return { status: "skipped", error: "canal sem provedor contratado" };
  }

  const { data: n, error: nErr } = await db
    .from("notifications")
    .select("id, recipient_account_id, target_table, target_id, notification_types(code, label)")
    .eq("id", d.notification_id)
    .single();
  if (nErr || !n) return retryOrGiveUp(d, `leitura da notificacao: ${nErr?.message ?? "ausente"}`);

  const { data: tokens, error: tErr } = await db
    .from("device_tokens")
    .select("token")
    .eq("account_id", n.recipient_account_id)
    .eq("is_active", true);
  if (tErr) return retryOrGiveUp(d, `leitura dos aparelhos: ${tErr.message}`);

  // O alvo é o APARELHO registrado no banco, não o external_id do OneSignal:
  // assim a desativação da conta e o unregister_device_token valem no envio
  // (device_tokens é o que o banco revoga).
  const subscriptionIds = (tokens ?? []).map((t) => t.token as string);
  if (subscriptionIds.length === 0) {
    return { status: "skipped", error: "destinatario sem aparelho ativo" };
  }

  const type = n.notification_types as unknown as { code: string; label: string };
  const payload: Record<string, unknown> = {
    app_id: cfg.appId,
    target_channel: "push",
    include_subscription_ids: subscriptionIds,
    // O id da entrega: um reenvio (lease expirado, retry) não vira push duplicado.
    idempotency_key: d.id,
    headings: { en: type.label, pt: type.label },
    contents: { en: GENERIC_BODY, pt: GENERIC_BODY },
    data: {
      notification_id: n.id,
      type: type.code,
      target_table: n.target_table,
      target_id: n.target_id,
    },
  };
  // Várias respostas na mesma conversa viram UM aviso no aparelho.
  if (n.target_table === "conversations" && n.target_id) {
    payload.collapse_id = `conversation:${n.target_id}`;
  }

  let res: Response;
  try {
    res = await fetch(cfg.apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Key ${cfg.apiKey}` },
      body: JSON.stringify(payload),
    });
  } catch (e) {
    return retryOrGiveUp(d, `rede: ${(e as Error).message}`);
  }

  const text = await res.text();
  if (res.status === 429 || res.status >= 500) {
    return retryOrGiveUp(d, `provedor ${res.status}: ${text.slice(0, 300)}`);
  }
  if (!res.ok) {
    return { status: "failed", error: `provedor ${res.status}: ${text.slice(0, 300)}` };
  }

  let body: { id?: string; errors?: unknown } = {};
  try {
    body = JSON.parse(text);
  } catch { /* corpo não-JSON com 2xx: tratado como sem id abaixo */ }

  // Aparelho que o provedor não reconhece mais deixa de ser alvo.
  const errors = body.errors as Record<string, unknown> | undefined;
  const invalid = [
    ...((errors?.invalid_player_ids as string[] | undefined) ?? []),
    ...((errors?.invalid_subscription_ids as string[] | undefined) ?? []),
  ];
  if (invalid.length > 0) {
    await db.from("device_tokens").update({ is_active: false }).in("token", invalid);
  }

  if (!body.id) {
    return { status: "skipped", error: `provedor sem envio: ${text.slice(0, 300)}` };
  }
  return { status: "sent", providerId: body.id };
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  const expected = Deno.env.get("PUSH_DISPATCH_SECRET");
  const given = req.headers.get("x-dispatch-secret") ?? "";
  if (!expected || !sameSecret(given, expected)) return json(401, { error: "unauthorized" });

  const appId = Deno.env.get("ONESIGNAL_APP_ID");
  const apiKey = Deno.env.get("ONESIGNAL_REST_API_KEY");
  // Sem credencial, NÃO reivindica a fila: as entregas continuam pending e
  // saem quando a credencial chegar, em vez de desistirem agora.
  if (!appId || !apiKey) return json(503, { error: "push_provider_not_configured" });
  const cfg: Config = {
    appId,
    apiKey,
    apiUrl: Deno.env.get("ONESIGNAL_API_URL") ?? ONESIGNAL_DEFAULT_URL,
  };

  const db = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  const summary: Record<string, number> = { claimed: 0 };
  const started = Date.now();

  while (Date.now() - started < TIME_BUDGET_MS) {
    const { data: batch, error } = await db.rpc("claim_notification_deliveries", {
      p_limit: BATCH_SIZE,
    });
    if (error) return json(500, { error: "claim_failed", detail: error.message, summary });
    if (!batch || batch.length === 0) break;
    summary.claimed += batch.length;

    for (const d of batch as Delivery[]) {
      const o = await deliver(db, cfg, d);
      const { error: mErr } = await db.rpc("mark_delivery_result", {
        p_delivery_id: d.id,
        p_status: o.status,
        p_provider_message_id: o.status === "sent" ? o.providerId : null,
        p_error: o.status === "sent" ? null : o.error,
        p_next_attempt_at: o.status === "pending" ? o.nextAttemptAt : null,
      });
      // Falha ao registrar: a entrega fica 'sending' e o lease de 10 min a
      // devolve à fila. A idempotency_key impede o push duplicado.
      const key = mErr ? "mark_failed" : o.status;
      summary[key] = (summary[key] ?? 0) + 1;
    }

    if (batch.length < BATCH_SIZE) break;
  }

  return json(200, summary);
});
