// reset-mfa-factor — o administrador remove o segundo fator de outra pessoa
// da equipe, que perdeu o autenticador. Fase F.2 das pendências do painel de
// 30/09/2026 (painel #4). ADR-031.
//
// Quem chama: o painel administrativo, com o JWT do ADMINISTRADOR, em sessão
// aal2.
//
// Corpo: { account_id }
//
// Resposta (200): { account_id, factors_removed, sessions_ended }
//
// Erros ({ error }): unauthorized, forbidden, mfa_required,
// cannot_reset_own_factor, staff_account_not_found, reset_failed.
//
// A sequência, e por que nessa ordem:
//   1. authorize_mfa_factor_reset (administrador) — só confere, não grava;
//   2. Admin API: lista e apaga cada fator. Quem apaga é o Auth, dono da
//      tabela;
//   3. record_mfa_factor_reset (administrador) — encerra as sessões da pessoa
//      e grava na trilha. A trilha é append-only, e por isso vem DEPOIS da
//      remoção confirmada.
//
// `reset_failed` (502) no passo 2 pode deixar parte dos fatores apagada, e no
// passo 3 deixa os fatores apagados sem as sessões encerradas nem a linha na
// trilha. Nos dois casos, repetir a chamada termina o trabalho: a lista vem
// com o que sobrou, e o registro é seguro de repetir.
//
// Consequência a comunicar: com require_admin_mfa ligado, o administrador
// que perde o fator perde o acesso administrativo até cadastrar outro.

import "@supabase/functions-js/edge-runtime.d.ts";
import { adminClient, caller, fromDbError, json, preflight, readBody } from "../_shared/common.ts";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  const early = preflight(req);
  if (early) return early;

  const me = await caller(req);
  if (!me) return json(401, { error: "unauthorized" });

  const body = await readBody(req);
  const accountId = typeof body?.account_id === "string" ? body.account_id : "";
  if (!UUID_RE.test(accountId)) return json(404, { error: "staff_account_not_found" });

  // 1. Autorização, como o administrador.
  const auth = await me.client.rpc("authorize_mfa_factor_reset", { p_account_id: accountId });
  if (auth.error) return fromDbError(auth.error);

  // 2. Os fatores, pela Admin API.
  const admin = adminClient();
  const listed = await admin.auth.admin.mfa.listFactors({ userId: accountId });
  if (listed.error) {
    console.error("fatores nao listados:", listed.error.message);
    return json(502, { error: "reset_failed" });
  }

  let removed = 0;
  for (const factor of listed.data.factors) {
    const { error } = await admin.auth.admin.mfa.deleteFactor({ id: factor.id, userId: accountId });
    if (error) {
      console.error("fator nao removido:", factor.id, error.message);
      return json(502, { error: "reset_failed", factors_removed: removed });
    }
    removed++;
  }

  // 3. Sessões e trilha, como o administrador.
  const rec = await me.client.rpc("record_mfa_factor_reset", { p_account_id: accountId });
  if (rec.error) {
    console.error("redefinicao nao registrada:", rec.error.message);
    return json(502, { error: "reset_failed", factors_removed: removed });
  }

  return json(200, { account_id: accountId, factors_removed: removed, sessions_ended: rec.data as number });
});
