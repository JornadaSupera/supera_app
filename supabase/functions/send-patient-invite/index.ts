// send-patient-invite — o convite de ativação do paciente sai por SMS.
// Fase 4.3 das pendências consolidadas (app #31, painel T-4). ADR-026 §7.
//
// Quem chama: o painel administrativo, com o JWT do ADMINISTRADOR.
//
// Corpo: { patient_id }
//
// Resposta (201): { invitation_id, phone_masked, expires_at }
//   O token NUNCA volta ao painel: ele só existe no SMS.
//
// Erros ({ error }): forbidden, patient_not_found, patient_already_linked,
// patient_inactive, underage (ficha de menor de 18 anos, Fase L), invalid_phone,
// sms_failed.
//
// Em `sms_failed` o convite emitido é CANCELADO, e o painel cai para o
// "mostrar uma vez" de sempre (invite_patient), que emite outro. Um token vivo
// que ninguém recebeu seria só uma chave a mais.

import "@supabase/functions-js/edge-runtime.d.ts";
import { brDateTime, caller, fromDbError, json, maskPhone, preflight, readBody, sendSms, smsConfigured } from "../_shared/common.ts";

// Texto provisório: a redação final e a URL de download do app são da clínica
// (D.12). Sem acento, sem dado de saúde e sem o nome da clínica.
function smsText(token: string, expiresAt: string): string {
  return `Jornada Supera: seu codigo de ativacao e ${token} ` +
    `Valido ate ${brDateTime(expiresAt)}. Nao compartilhe.`;
}

Deno.serve(async (req) => {
  const early = preflight(req);
  if (early) return early;

  const me = await caller(req);
  if (!me) return json(401, { error: "unauthorized" });

  const body = await readBody(req);
  const patientId = typeof body?.patient_id === "string" ? body.patient_id : "";
  if (!patientId) return json(404, { error: "patient_not_found" });

  // Antes de emitir: sem provedor, nada nasce.
  if (!smsConfigured()) return json(502, { error: "sms_failed", detail: "sms_provider_not_configured" });

  const issued = await me.client.rpc("issue_patient_sms_invite", { p_patient_id: patientId }).single();
  if (issued.error) return fromDbError(issued.error);
  const { invitation_id, token, phone, expires_at } = issued.data as {
    invitation_id: string;
    token: string;
    phone: string;
    expires_at: string;
  };

  const sent = await sendSms(phone, smsText(token, expires_at));
  if (!sent.ok) {
    console.error("sms do convite falhou:", sent.error);
    const { error } = await me.client.rpc("cancel_patient_invitation", { p_invitation_id: invitation_id });
    if (error) console.error("convite nao cancelado:", error.message);
    return json(502, { error: "sms_failed" });
  }

  return json(201, { invitation_id, phone_masked: maskPhone(phone), expires_at });
});
