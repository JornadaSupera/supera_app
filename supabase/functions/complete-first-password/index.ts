// complete-first-password — o acompanhante troca a senha provisória e, na
// mesma chamada, ativa o vínculo. Fase 4.1 das pendências consolidadas
// (app #30). ADR-026.
//
// Quem chama: o app, com o JWT do ACOMPANHANTE logado com a senha provisória.
//
// Corpo: { new_password }
//
// Resposta (200): { link_id, refresh_session: true }
//   O app PRECISA chamar supabase.auth.refreshSession() depois: o JWT em mãos
//   ainda traz must_change_password = "true" em app_metadata, e a tela de troca
//   voltaria. O acesso em si não depende do JWT — o banco lê o estado do
//   vínculo a cada consulta.
//
// Erros ({ error }): not_first_login, temporary_password_expired,
// weak_password, password_unchanged.
//
// Três passos, e a ordem protege o caso de a rede cair no meio:
//   1. troca a senha no Auth, COMO O PRÓPRIO USUÁRIO — é o Auth que diz
//      `same_password` e aplica a política de senha do projeto;
//   2. zera must_change_password pela Admin API (só service_role escreve
//      app_metadata, e é isso que activate_my_caregiver_link exige);
//   3. ativa o vínculo, como o acompanhante: a trilha grava o ato em nome dele.
// Repetir a chamada depois de uma falha no 3 funciona: com o flag já zerado,
// a função pula direto para a ativação.

import "@supabase/functions-js/edge-runtime.d.ts";
import { adminClient, caller, fromDbError, json, preflight, readBody } from "../_shared/common.ts";

// Mínimo nosso, acima do que o Auth local exige (6). Letras e dígitos.
function weak(p: string): boolean {
  return p.length < 10 || !/[A-Za-z]/.test(p) || !/[0-9]/.test(p);
}

Deno.serve(async (req) => {
  const early = preflight(req);
  if (early) return early;

  const me = await caller(req);
  if (!me) return json(401, { error: "unauthorized" });

  const body = await readBody(req);
  const newPassword = typeof body?.new_password === "string" ? body.new_password : "";

  // Há vínculo pendente, e a senha provisória ainda vale?
  const win = await me.client.rpc("check_first_password_window");
  if (win.error) return fromDbError(win.error);

  const admin = adminClient();
  const { data: u, error: uErr } = await admin.auth.admin.getUserById(me.userId);
  if (uErr || !u.user) return json(500, { error: "internal_error" });

  if (u.user.app_metadata?.must_change_password === "true") {
    if (weak(newPassword)) return json(422, { error: "weak_password" });

    // 1. Como o usuário: supabase-js exige sessão para updateUser, e a função
    // não tem uma. A rota é a mesma.
    const res = await fetch(`${Deno.env.get("SUPABASE_URL")}/auth/v1/user`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${me.jwt}`,
        apikey: Deno.env.get("SUPABASE_ANON_KEY")!,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ password: newPassword }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({})) as { error_code?: string; code?: string };
      const code = err.error_code ?? err.code;
      if (code === "same_password") return json(422, { error: "password_unchanged" });
      if (code === "weak_password") return json(422, { error: "weak_password" });
      console.error("troca de senha falhou:", res.status, code);
      return json(500, { error: "internal_error" });
    }

    // 2. O flag.
    const { error: fErr } = await admin.auth.admin.updateUserById(me.userId, {
      app_metadata: { must_change_password: "false" },
    });
    if (fErr) {
      console.error("flag nao zerado:", fErr.message);
      return json(500, { error: "internal_error" });
    }
  }

  // 3. A ativação.
  const act = await me.client.rpc("activate_my_caregiver_link");
  if (act.error) return fromDbError(act.error);

  return json(200, { link_id: act.data, refresh_session: true });
});
