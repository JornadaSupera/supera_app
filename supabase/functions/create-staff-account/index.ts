// create-staff-account — o administrador cadastra alguém da equipe, e a
// pessoa recebe o convite por e-mail. Fase F.1 das pendências do painel de
// 30/09/2026 (painel #3), D9 e D11. ADR-031.
//
// Quem chama: o painel administrativo, com o JWT do ADMINISTRADOR, em sessão
// aal2 (segundo fator verificado).
//
// Corpo, cadastro:
//   { email, full_name, role: "professional",
//     council_registration, specialty_ids: [uuid, ...], primary_specialty_id? }
//   { email, full_name, role: "admin" }
// Corpo, reenvio do convite:
//   { resend: true, account_id }
//
// Respostas:
//   201 cadastro → { account_id, role, profile_id, pending: true }
//   200 reenvio  → { account_id, resent: true }
//
// O papel nasce PENDENTE: inativo até a pessoa abrir o link do e-mail e
// confirmar. Nenhuma senha passa pelo painel; a pessoa define a própria na
// tela para onde o link leva (Site URL, ou STAFF_INVITE_REDIRECT_URL).
//
// Erros ({ error }): unauthorized, forbidden, mfa_required, invalid_email,
// invalid_name, invalid_role, account_is_patient, account_is_caregiver,
// email_in_use, council_registration_required, specialty_required,
// unknown_specialty, primary_specialty_not_in_list, staff_invitation_not_found,
// invite_failed.
//
// `invite_failed` (502) vem COM account_id: a conta e o papel pendente
// existem, só o e-mail não saiu (limite de envio do Auth, SMTP fora). O
// caminho é o reenvio, com { resend: true, account_id }.
//
// A sequência, e por que nessa ordem:
//   1. prepare_staff_account (administrador) — perfil, aal2, formato, e-mail
//      livre e não de paciente/acompanhante. Recusa ANTES de tocar no Auth;
//   2. Admin API createUser, SEM confirmar e SEM senha. Não envia e-mail;
//   3. create_professional ou create_admin (administrador) — valida conselho e
//      especialidades e cria o papel PENDENTE, com o administrador como autor
//      na trilha. Se falhar, a conta do passo 2 é apagada, e ninguém recebeu
//      convite de uma conta que não existe mais;
//   4. inviteUserByEmail — o Auth reenvia para a conta existente não
//      confirmada. Só aqui sai o e-mail.
//
// O plano previa o convite no passo 2. Invertido de propósito: com o convite
// antes da validação do cadastro, um conselho em branco apagaria a conta
// DEPOIS de o e-mail ter saído, e a pessoa clicaria num link morto.

import "@supabase/functions-js/edge-runtime.d.ts";
import { adminClient, caller, fromDbError, json, preflight, readBody } from "../_shared/common.ts";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function inviteOptions(): { redirectTo?: string } {
  const url = Deno.env.get("STAFF_INVITE_REDIRECT_URL");
  return url ? { redirectTo: url } : {};
}

Deno.serve(async (req) => {
  const early = preflight(req);
  if (early) return early;

  const me = await caller(req);
  if (!me) return json(401, { error: "unauthorized" });

  const body = await readBody(req);
  const admin = adminClient();

  // ---------------- Reenvio ----------------
  if (body?.resend === true) {
    const accountId = typeof body.account_id === "string" ? body.account_id : "";
    if (!UUID_RE.test(accountId)) return json(404, { error: "staff_invitation_not_found" });

    const prep = await me.client.rpc("prepare_staff_invitation_resend", { p_account_id: accountId });
    if (prep.error) return fromDbError(prep.error);

    const { error } = await admin.auth.admin.inviteUserByEmail(prep.data as string, inviteOptions());
    if (error) {
      console.error("reenvio do convite falhou:", error.message);
      return json(502, { error: "invite_failed", account_id: accountId });
    }
    return json(200, { account_id: accountId, resent: true });
  }

  // ---------------- Cadastro ----------------
  const fullName = typeof body?.full_name === "string" ? body.full_name.trim() : "";
  const role = body?.role;
  if (role !== "professional" && role !== "admin") return json(422, { error: "invalid_role" });
  if (!fullName) return json(422, { error: "invalid_name" });

  // 1. Recusas cedo, como o administrador.
  const prep = await me.client.rpc("prepare_staff_account", {
    p_email: typeof body?.email === "string" ? body.email : "",
  });
  if (prep.error) return fromDbError(prep.error);
  const email = prep.data as string;

  // 2. A conta, sem e-mail ainda.
  const { data: created, error: cErr } = await admin.auth.admin.createUser({
    email,
    email_confirm: false,
    user_metadata: { full_name: fullName }, // lido por handle_new_auth_user
  });
  // Corrida com outro cadastro do mesmo e-mail entre os passos 1 e 2.
  if (cErr || !created.user) return json(409, { error: "email_in_use" });
  const accountId = created.user.id;

  // 3. O papel pendente, como o administrador.
  const profile = role === "professional"
    ? await me.client.rpc("create_professional", {
      p_account_id: accountId,
      p_council_registration: typeof body?.council_registration === "string" ? body.council_registration : null,
      p_specialty_ids: Array.isArray(body?.specialty_ids) ? body.specialty_ids : null,
      ...(typeof body?.primary_specialty_id === "string" ? { p_primary_specialty_id: body.primary_specialty_id } : {}),
    })
    : await me.client.rpc("create_admin", { p_account_id: accountId });

  if (profile.error) {
    const { error } = await admin.auth.admin.deleteUser(accountId);
    if (error) console.error("conta nao desfeita:", accountId, error.message);
    // uuid[] malformado chega como erro de sintaxe do Postgres, não como nome.
    if (/invalid input syntax for type uuid/.test(profile.error.message ?? "")) {
      return json(422, { error: "unknown_specialty" });
    }
    return fromDbError(profile.error);
  }

  // 4. O convite.
  const { error: iErr } = await admin.auth.admin.inviteUserByEmail(email, inviteOptions());
  if (iErr) {
    console.error("convite nao enviado:", iErr.message);
    return json(502, { error: "invite_failed", account_id: accountId });
  }

  return json(201, { account_id: accountId, role, profile_id: profile.data as string, pending: true });
});
