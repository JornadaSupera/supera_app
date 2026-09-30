// create-caregiver — o paciente cria a conta do acompanhante, com senha
// provisória. Fase 4.1 das pendências consolidadas (app #30). ADR-026.
//
// Quem chama: o app do paciente, com o JWT do TITULAR.
//
// Corpo: { full_name, email, phone, delivery: "whatsapp" | "sms", scopes? }
//
// `scopes` (Fase C3, ADR-030): as áreas que o acompanhante nasce alcançando,
// entre "schedule", "diary", "chat", "resources" e "clinical_record".
//   ausente ou null → as cinco ligadas (o contrato de antes);
//   ["schedule", "chat"] → só essas ligadas;
//   [] → nenhuma ("pausado" desde o início).
// Qualquer outra coisa → 422 invalid_scope, ANTES de tocar no Auth.
//
// Respostas (201):
//   whatsapp → { link_id, login, temporary_password, expires_at, delivery }
//              A senha volta UMA vez. O app a entrega pelo WhatsApp do próprio
//              paciente e não a guarda.
//   sms      → { link_id, expires_at, delivery, phone_masked }
//              A senha NUNCA volta ao app.
//
// Erros ({ error }): not_patient_owner, caregiver_already_active, email_in_use,
// invalid_phone, invalid_name, invalid_email, invalid_delivery, invalid_scope,
// rate_limited, caregiver_disabled, sms_failed.
//
// `sms_failed` em dois momentos, e o app precisa distinguir pelo `link_id`:
//   sem link_id → nada foi criado (provedor não configurado);
//   com link_id → a conta e o vínculo pendente existem, só a mensagem não saiu.
//                 O caminho é reset-caregiver-password, que pode usar WhatsApp.
//
// A sequência, e por que nessa ordem:
//   1. prepare_caregiver_creation (titular) — recusa ANTES de tocar no Auth;
//   2. find_reusable_caregiver_account (service_role) — conta nova ou a
//      adormecida do mesmo paciente;
//   3. Auth Admin API — cria ou reaproveita, com a senha, o flag e o PASSE
//      caregiver_setup_for em app_metadata (que só service_role escreve);
//   4. link_caregiver_account (titular) — perfil, vínculo pendente, áreas e
//      emissão numa transação, com o paciente como autor na trilha. Se falhar, a conta
//      criada no passo 3 é apagada e o passe de uma reaproveitada, retirado;
//   5. a entrega.

import "@supabase/functions-js/edge-runtime.d.ts";
import {
  adminClient,
  brDateTime,
  caller,
  fromDbError,
  json,
  maskPhone,
  preflight,
  readBody,
  sendSms,
  smsConfigured,
  temporaryPassword,
} from "../_shared/common.ts";

// Texto provisório: a redação final é da clínica (D.12). Sem acento, sem dado
// de saúde e sem o nome da clínica.
function smsText(login: string, password: string, expiresAt: string): string {
  return `Jornada Supera: acesso de acompanhante criado. Login: ${login} ` +
    `Senha provisoria: ${password} Troque no primeiro acesso, ate ${brDateTime(expiresAt)}.`;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// A ordem e os nomes do enum public.caregiver_scope.
const SCOPES = new Set(["schedule", "diary", "chat", "resources", "clinical_record"]);

// undefined = não mandar p_scopes (o banco liga as cinco); null = inválido.
function parseScopes(raw: unknown): string[] | undefined | null {
  if (raw === undefined || raw === null) return undefined;
  if (!Array.isArray(raw)) return null;
  if (!raw.every((s) => typeof s === "string" && SCOPES.has(s))) return null;
  return [...new Set(raw as string[])];
}

Deno.serve(async (req) => {
  const early = preflight(req);
  if (early) return early;

  const me = await caller(req);
  if (!me) return json(401, { error: "unauthorized" });

  const body = await readBody(req);
  const fullName = typeof body?.full_name === "string" ? body.full_name.trim() : "";
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const phone = typeof body?.phone === "string" ? body.phone : "";
  const delivery = body?.delivery;
  const scopes = parseScopes(body?.scopes);

  if (delivery !== "whatsapp" && delivery !== "sms") return json(422, { error: "invalid_delivery" });
  if (!fullName) return json(422, { error: "invalid_name" });
  if (!EMAIL_RE.test(email)) return json(422, { error: "invalid_email" });
  if (scopes === null) return json(422, { error: "invalid_scope" });
  if (delivery === "sms" && !smsConfigured()) {
    return json(502, { error: "sms_failed", detail: "sms_provider_not_configured" });
  }

  // 1. Recusas cedo, como o titular.
  const prep = await me.client.rpc("prepare_caregiver_creation", { p_phone: phone });
  if (prep.error) return fromDbError(prep.error);
  const e164 = prep.data as string;

  const { data: patient, error: pErr } = await me.client
    .from("patients").select("id").eq("account_id", me.userId).single();
  if (pErr || !patient) return json(403, { error: "not_patient_owner" });

  // 2. Conta nova ou a adormecida.
  const admin = adminClient();
  const reuse = await admin.rpc("find_reusable_caregiver_account", {
    p_email: email,
    p_patient_id: patient.id,
  });
  if (reuse.error) return fromDbError(reuse.error);

  // 3. Auth.
  const password = temporaryPassword();
  const appMetadata = { must_change_password: "true", caregiver_setup_for: patient.id };
  let accountId = reuse.data as string | null;
  const created = accountId === null;

  if (created) {
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // não verificado de fato: risco registrado com a clínica (4.2)
      user_metadata: { full_name: fullName },
      app_metadata: appMetadata,
    });
    // Corrida com outro cadastro do mesmo e-mail entre os passos 2 e 3.
    if (error || !data.user) return json(409, { error: "email_in_use" });
    accountId = data.user.id;
  } else {
    const { error } = await admin.auth.admin.updateUserById(accountId!, {
      password,
      user_metadata: { full_name: fullName },
      app_metadata: appMetadata,
    });
    if (error) {
      console.error("reaproveitamento no Auth falhou:", error.message);
      return json(500, { error: "internal_error" });
    }
  }

  // 4. O vínculo, como o titular.
  const link = await me.client.rpc("link_caregiver_account", {
    p_account_id: accountId,
    p_full_name: fullName,
    p_phone: e164,
    p_channel: delivery,
    ...(scopes === undefined ? {} : { p_scopes: scopes }),
  }).single();

  if (link.error) {
    if (created) await admin.auth.admin.deleteUser(accountId!);
    else await admin.auth.admin.updateUserById(accountId!, { app_metadata: { caregiver_setup_for: null } });
    return fromDbError(link.error);
  }
  const { link_id, expires_at } = link.data as { link_id: string; expires_at: string };

  // 5. Entrega.
  if (delivery === "whatsapp") {
    return json(201, { link_id, login: email, temporary_password: password, expires_at, delivery });
  }

  const sent = await sendSms(e164, smsText(email, password, expires_at));
  if (!sent.ok) {
    console.error("sms do acompanhante falhou:", sent.error);
    return json(502, { error: "sms_failed", link_id, expires_at });
  }
  return json(201, { link_id, expires_at, delivery, phone_masked: maskPhone(e164) });
});
