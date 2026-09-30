// reset-caregiver-password — o paciente emite senha provisória nova para o
// acompanhante dele. Fase 4.1 das pendências consolidadas (app #30). ADR-026.
//
// Quem chama: o app do paciente, com o JWT do TITULAR. Serve à senha que venceu
// (72 h), à que não chegou e ao acompanhante que esqueceu a própria.
//
// Corpo: { delivery: "whatsapp" | "sms" }
//
// Respostas (200): as mesmas formas de create-caregiver —
//   whatsapp → { login, temporary_password, expires_at, delivery }
//   sms      → { expires_at, delivery, phone_masked }
//
// Erros ({ error }): not_patient_owner, caregiver_not_found, rate_limited,
// invalid_delivery, sms_failed, reset_failed.
//
// O vínculo volta a `pending` ANTES de a senha mudar no Auth. Se a Admin API
// falhar, o acompanhante fica sem acesso até a próxima tentativa: é a direção
// segura, e `reset_failed` diz ao app que tente de novo.

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

// Texto provisório: a redação final é da clínica (D.12).
function smsText(login: string, password: string, expiresAt: string): string {
  return `Jornada Supera: nova senha provisoria de acompanhante. Login: ${login} ` +
    `Senha: ${password} Troque no proximo acesso, ate ${brDateTime(expiresAt)}.`;
}

Deno.serve(async (req) => {
  const early = preflight(req);
  if (early) return early;

  const me = await caller(req);
  if (!me) return json(401, { error: "unauthorized" });

  const body = await readBody(req);
  const delivery = body?.delivery;
  if (delivery !== "whatsapp" && delivery !== "sms") return json(422, { error: "invalid_delivery" });
  if (delivery === "sms" && !smsConfigured()) {
    return json(502, { error: "sms_failed", detail: "sms_provider_not_configured" });
  }

  const begin = await me.client.rpc("begin_caregiver_password_reset", { p_channel: delivery }).single();
  if (begin.error) return fromDbError(begin.error);
  const { caregiver_account_id, expires_at } = begin.data as {
    caregiver_account_id: string;
    expires_at: string;
  };

  const password = temporaryPassword();
  const admin = adminClient();
  const { error: aErr } = await admin.auth.admin.updateUserById(caregiver_account_id, {
    password,
    app_metadata: { must_change_password: "true" },
  });
  if (aErr) {
    console.error("reset no Auth falhou:", aErr.message);
    return json(500, { error: "reset_failed" });
  }

  const cg = await me.client.rpc("get_my_caregiver").single();
  if (cg.error) return fromDbError(cg.error);
  const { email, phone } = cg.data as { email: string; phone: string };

  if (delivery === "whatsapp") {
    return json(200, { login: email, temporary_password: password, expires_at, delivery });
  }

  const sent = await sendSms(phone, smsText(email, password, expires_at));
  if (!sent.ok) {
    console.error("sms do reset falhou:", sent.error);
    return json(502, { error: "sms_failed", expires_at });
  }
  return json(200, { expires_at, delivery, phone_masked: maskPhone(phone) });
});
