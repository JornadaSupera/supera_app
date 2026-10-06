-- O bloqueio de agenda passa a proteger o horario: nao se marca nem se remarca
-- compromisso sobre ele, a agenda da clinica ve QUANDO alguem esta
-- indisponivel (sem ver por que), e quem bloqueia fica sabendo do compromisso
-- que ja estava la.
-- Plano das pendencias do painel de 30/09/2026, Fase J, item J.1 (painel #17,
-- decisao D7).
-- Design e racional: supera-docs/ADRs/ADR-014 — Granularidade, autoria e corte do agregado Agenda.md (emenda §12)
--
-- O QUE MUDA NA ADR-014. A premissa P4 ("o bloqueio pessoal nao e informacao
-- da equipe") e a frase "a ausencia e a decisao" caem. Sem checagem, o
-- bloqueio nao protegia nada: a navegadora marcava em cima dele sem saber que
-- existia. O §3 continua de pe no que importa: o ROTULO ("consulta medica
-- pessoal") e da pessoa e nao sai da tabela, o bloqueio nao vira linha de
-- `appointments`, e nao entra na trilha de acesso a dado clinico.
--
-- QUATRO PECAS:
--
--   1. private.is_slot_blocked(professional, inicio, fim) — o predicado de
--      colisao, num lugar so. Intervalo semiaberto [inicio, fim): o bloqueio
--      que termina as 14h NAO colide com o compromisso que comeca as 14h.
--   2. schedule_appointment e reschedule_appointment recusam o horario que
--      colide com bloqueio do profissional do compromisso, com
--      `slot_blocked` (23P01, o 409 do PostgREST). A mensagem nao diz o
--      motivo do bloqueio, e o rotulo nao sai. Compromisso SEM profissional
--      (ADR-014 §9) nao tem agenda pessoal a colidir.
--   3. read_professional_busy_intervals(p_from, p_to) — para o administrador
--      e para quem tem `schedule.manage`. Devolve so professional_id,
--      starts_at e ends_at. Sem rotulo, sem id do bloqueio. Janela
--      obrigatoria e de no maximo 62 dias.
--   4. save_professional_block(...) — cria ou move o PROPRIO bloqueio e
--      devolve os compromissos que ja estavam no intervalo, para a tela
--      avisar. O bloqueio e aceito, o compromisso continua: nada e cancelado
--      sozinho.
--
-- POR QUE CHECAGEM NA FUNCAO E NAO `EXCLUDE`: sao duas tabelas, e EXCLUDE so
-- compara linhas da mesma; alem disso `btree_gist` nao esta instalada. O
-- custo declarado e a corrida: um bloqueio gravado no mesmo instante em que
-- outra sessao agenda pode passar. O aviso de conflito da peca 4 cobre o
-- caso do lado de quem bloqueia, e e o mesmo caso do compromisso anterior ao
-- bloqueio, que esta migration aceita de proposito.
--
-- O PREDICADO E `starts_at < fim AND ends_at > inicio`, e nao
-- `tstzrange(...) && tstzrange(...)`: e a mesma conta para intervalos
-- semiabertos, e a forma explicita usa o indice
-- idx_professional_blocks_owner (professional_id, starts_at). Com &&, sem
-- indice gist, seria varredura dos bloqueios do profissional.
--
-- O QUE CONTINUA IGUAL:
--   * o profissional le, cria, altera e apaga os PROPRIOS bloqueios direto na
--     tabela, pelas mesmas quatro politicas. save_professional_block e
--     SECURITY INVOKER: grava sob essas mesmas politicas, e so acrescenta o
--     aviso de conflito. A escrita direta continua valendo, sem aviso;
--   * o administrador continua SEM politica em professional_blocks: le pela
--     funcao, que corta o rotulo. A tabela nao ganhou leitura alheia;
--   * a E.3b (quem remarca sessao de Psicologia, D6) continua aguardando a
--     CEON. Esta migration nao toca nisso: reescreve as duas RPCs a partir da
--     versao de guard_appointment_writes e preserva cada linha dela.


-- ============================================================
-- 1. O predicado de colisao
-- ============================================================
--
-- SECURITY DEFINER: quem agenda (a navegadora) nao le os bloqueios de outra
-- pessoa, e a RPC de agendamento ja e definer; o helper fica privado para a
-- regra morar num lugar so. Devolve so um booleano.

CREATE FUNCTION private.is_slot_blocked(
  p_professional_id uuid,
  p_starts_at       timestamptz,
  p_ends_at         timestamptz
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT p_professional_id IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM public.professional_blocks b
        WHERE b.professional_id = p_professional_id
          AND b.starts_at < p_ends_at
          AND b.ends_at   > p_starts_at
     );
$$;

COMMENT ON FUNCTION private.is_slot_blocked(uuid, timestamptz, timestamptz) IS
  'O intervalo [inicio, fim) colide com bloqueio do profissional? Nulo (compromisso sem profissional) nunca colide. Fase J, ADR-014 §12.';


-- ============================================================
-- 2. schedule_appointment — recusa horario bloqueado
-- ============================================================
--
-- CREATE OR REPLACE preserva o ACL. O corpo e o de guard_appointment_writes
-- (E.3a) com a checagem nova depois da de especialidade: o erro de permissao
-- vem antes do de horario, e quem nao pode agendar nao descobre bloqueio.

CREATE OR REPLACE FUNCTION public.schedule_appointment(
  p_patient_id          uuid,
  p_appointment_type_id uuid,
  p_title               text,
  p_starts_at           timestamptz,
  p_ends_at             timestamptz,
  p_location_label      text,
  p_professional_id     uuid DEFAULT NULL,
  p_origin_specialty_id uuid DEFAULT NULL,
  p_patient_notes       text DEFAULT NULL,
  p_location_address    text DEFAULT NULL,
  p_location_phone      text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_id        uuid;
  v_scheduled uuid;
BEGIN
  IF NOT private.can_manage_schedule() THEN
    RAISE EXCEPTION 'apenas profissional ativo marca compromisso';
  END IF;

  -- E.3a (c). A checagem vem antes de qualquer escrita e nao distingue
  -- "especialidade sigilosa" de "especialidade de outra pessoa": so e
  -- recusado o par sigilosa + nao minha.
  IF p_origin_specialty_id IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.specialties s
                  WHERE s.id = p_origin_specialty_id AND s.is_confidential)
     AND NOT (p_origin_specialty_id = ANY (private.my_specialty_ids())) THEN
    RAISE EXCEPTION 'origin_specialty_not_allowed'
      USING ERRCODE = '42501',
            HINT    = 'Compromisso de especialidade sigilosa so e marcado por quem e da especialidade.';
  END IF;

  -- J.1. O motivo do bloqueio nao sai: so que o horario esta indisponivel.
  IF private.is_slot_blocked(p_professional_id, p_starts_at, p_ends_at) THEN
    RAISE EXCEPTION 'slot_blocked'
      USING ERRCODE = '23P01',
            HINT    = 'O profissional bloqueou este horario. Escolha outro (read_professional_busy_intervals).';
  END IF;

  SELECT s.id INTO v_scheduled
    FROM public.appointment_statuses s WHERE s.code = 'scheduled';

  INSERT INTO public.appointments (
    patient_id, professional_id, appointment_type_id, status_id, title,
    starts_at, ends_at, location_label, location_address, location_phone,
    patient_notes, origin_specialty_id, created_by_account_id
  ) VALUES (
    p_patient_id, p_professional_id, p_appointment_type_id, v_scheduled, p_title,
    p_starts_at, p_ends_at, p_location_label, p_location_address, p_location_phone,
    p_patient_notes, p_origin_specialty_id, auth.uid()
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;


-- ============================================================
-- 3. reschedule_appointment — o horario novo tambem
-- ============================================================
--
-- O profissional do compromisso remarcado e o do original (a RPC nao troca
-- profissional), entao a colisao e conferida contra a agenda dele. A
-- checagem vem depois do appointment_not_found: id inexistente continua
-- respondendo o mesmo erro, sem revelar nada sobre bloqueio.

CREATE OR REPLACE FUNCTION public.reschedule_appointment(
  p_appointment_id uuid,
  p_starts_at      timestamptz,
  p_ends_at        timestamptz,
  p_reason_id      uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_old         public.appointments;
  v_new_id      uuid;
  v_scheduled   uuid;
  v_rescheduled uuid;
BEGIN
  IF NOT private.can_manage_schedule() THEN
    RAISE EXCEPTION 'apenas profissional ativo remarca compromisso';
  END IF;

  SELECT * INTO v_old FROM public.appointments WHERE id = p_appointment_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'appointment_not_found' USING ERRCODE = 'P0002';
  END IF;

  -- J.1.
  IF private.is_slot_blocked(v_old.professional_id, p_starts_at, p_ends_at) THEN
    RAISE EXCEPTION 'slot_blocked'
      USING ERRCODE = '23P01',
            HINT    = 'O profissional bloqueou este horario. Escolha outro (read_professional_busy_intervals).';
  END IF;

  SELECT s.id INTO v_scheduled   FROM public.appointment_statuses s WHERE s.code = 'scheduled';
  SELECT s.id INTO v_rescheduled FROM public.appointment_statuses s WHERE s.code = 'rescheduled';

  INSERT INTO public.appointments (
    patient_id, professional_id, appointment_type_id, status_id, title,
    starts_at, ends_at, location_label, location_address, location_phone,
    patient_notes, origin_specialty_id, rescheduled_from_id, created_by_account_id
  ) VALUES (
    v_old.patient_id, v_old.professional_id, v_old.appointment_type_id, v_scheduled, v_old.title,
    p_starts_at, p_ends_at, v_old.location_label, v_old.location_address, v_old.location_phone,
    v_old.patient_notes, v_old.origin_specialty_id, v_old.id, auth.uid()
  )
  RETURNING id INTO v_new_id;

  UPDATE public.appointments
     SET status_id = v_rescheduled, status_reason_id = p_reason_id
   WHERE id = p_appointment_id;

  RETURN v_new_id;
END;
$$;


-- ============================================================
-- 4. read_professional_busy_intervals — quando, sem o porque
-- ============================================================
--
-- Quem le: o administrador ativo (com o segundo fator, quando exigido) e o
-- profissional com `schedule.manage` — os dois que montam agenda de outra
-- pessoa. O profissional sem a permissao recebe `forbidden`: a propria agenda
-- ele le direto na tabela, com rotulo.
--
-- Sem pedagio de auditoria: nao ha paciente na linha (ADR-014 §3). Sem
-- parametro de profissional: a tela da agenda da clinica mostra a equipe
-- inteira na janela, e o filtro por pessoa e do lado do cliente.
--
-- A janela e obrigatoria e limitada a 62 dias (dois meses de calendario):
-- sem limite, a funcao viraria a exportacao da agenda pessoal da equipe.

CREATE FUNCTION public.read_professional_busy_intervals(
  p_from timestamptz,
  p_to   timestamptz
)
RETURNS TABLE (
  professional_id uuid,
  starts_at       timestamptz,
  ends_at         timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  c_max_window CONSTANT interval := interval '62 days';
BEGIN
  IF NOT (private.is_active_admin() OR private.can_manage_schedule()) THEN
    RAISE EXCEPTION 'forbidden'
      USING ERRCODE = '42501',
            HINT    = 'Intervalos ocupados da equipe: administrador ou profissional com schedule.manage.';
  END IF;

  IF p_from IS NULL OR p_to IS NULL OR p_to <= p_from THEN
    RAISE EXCEPTION 'janela invalida: p_from e p_to sao obrigatorios e p_to deve ser posterior a p_from'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  IF p_to - p_from > c_max_window THEN
    RAISE EXCEPTION 'window_too_large'
      USING ERRCODE = 'invalid_parameter_value',
            HINT    = 'A janela de read_professional_busy_intervals e de no maximo 62 dias.';
  END IF;

  RETURN QUERY
    SELECT b.professional_id, b.starts_at, b.ends_at
      FROM public.professional_blocks b
     WHERE b.starts_at < p_to
       AND b.ends_at   > p_from
     ORDER BY b.starts_at, b.professional_id;
END;
$$;

COMMENT ON FUNCTION public.read_professional_busy_intervals(timestamptz, timestamptz) IS
  'Intervalos bloqueados da equipe na janela (max. 62 dias), SEM rotulo e sem id do bloqueio. Administrador ou schedule.manage. Sem trilha: nao ha paciente (ADR-014 §3 e §12).';


-- ============================================================
-- 5. save_professional_block — grava e avisa
-- ============================================================
--
-- O aviso de conflito precisa ler `appointments`, que o profissional nao le
-- como `authenticated` (desde a ADR-008 a leitura da equipe e de
-- clinical_reader). O helper privado e SECURITY DEFINER e devolve so os
-- INTERVALOS dos compromissos do proprio profissional, nao terminais, que ele
-- ja enxerga: o filtro de visibilidade e o da politica
-- appointments_select_professional, para que a sessao sigilosa de outra area
-- atribuida a ele por engano nao vire oraculo de existencia. Sem id do
-- compromisso, sem paciente, sem titulo: a tela ja tem a agenda carregada
-- (read_my_agenda) e destaca pelo horario. Por isso nao ha pedagio.

CREATE FUNCTION private.my_appointment_conflicts(
  p_starts_at timestamptz,
  p_ends_at   timestamptz
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE(
           pg_catalog.jsonb_agg(
             pg_catalog.jsonb_build_object('starts_at', a.starts_at, 'ends_at', a.ends_at)
             ORDER BY a.starts_at),
           '[]'::jsonb)
    FROM public.appointments a
    JOIN public.appointment_statuses s ON s.id = a.status_id
   WHERE a.professional_id = private.my_professional_id()
     AND a.starts_at < p_ends_at
     AND a.ends_at   > p_starts_at
     AND NOT s.is_terminal
     AND ( a.visibility = 'team'
           OR a.origin_specialty_id = ANY (private.my_specialty_ids()) );
$$;

COMMENT ON FUNCTION private.my_appointment_conflicts(timestamptz, timestamptz) IS
  'Intervalos dos compromissos NAO terminais do proprio profissional que colidem com [inicio, fim), sob o mesmo filtro de visibilidade da leitura da equipe. So horarios, nunca paciente ou id. Uso: save_professional_block.';

-- INVOKER: a escrita passa pelas politicas professional_blocks_*_own, as
-- mesmas da escrita direta. A funcao nao e porta nova, so devolve o aviso.
CREATE FUNCTION public.save_professional_block(
  p_starts_at timestamptz,
  p_ends_at   timestamptz,
  p_label     text DEFAULT NULL,
  p_block_id  uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_me uuid;
  v_id uuid;
BEGIN
  v_me := private.my_professional_id();
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'professional_profile_required'
      USING ERRCODE = '42501',
            HINT    = 'Bloqueio de agenda e do proprio profissional ativo.';
  END IF;

  IF p_starts_at IS NULL OR p_ends_at IS NULL OR p_ends_at <= p_starts_at THEN
    RAISE EXCEPTION 'invalid_period'
      USING ERRCODE = '22023',
            HINT    = 'O fim do bloqueio deve ser posterior ao inicio.';
  END IF;

  IF p_block_id IS NULL THEN
    INSERT INTO public.professional_blocks (professional_id, label, starts_at, ends_at)
    VALUES (v_me, NULLIF(pg_catalog.btrim(p_label), ''), p_starts_at, p_ends_at)
    RETURNING id INTO v_id;
  ELSE
    -- A RLS esconde o bloqueio alheio: alheio e inexistente dao o mesmo erro.
    UPDATE public.professional_blocks
       SET label = NULLIF(pg_catalog.btrim(p_label), ''),
           starts_at = p_starts_at,
           ends_at   = p_ends_at
     WHERE id = p_block_id
    RETURNING id INTO v_id;
    IF v_id IS NULL THEN
      RAISE EXCEPTION 'block_not_found' USING ERRCODE = 'P0002';
    END IF;
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'block_id',  v_id,
    'conflicts', private.my_appointment_conflicts(p_starts_at, p_ends_at)
  );
END;
$$;

COMMENT ON FUNCTION public.save_professional_block(timestamptz, timestamptz, text, uuid) IS
  'Cria (p_block_id nulo) ou move o PROPRIO bloqueio e devolve {block_id, conflicts:[{starts_at, ends_at}]}: os compromissos do profissional que ja estavam no intervalo. Nada e cancelado. ADR-014 §12.';

COMMENT ON TABLE public.professional_blocks IS
  'Bloqueio de horario pessoal. NAO e dado clinico: RLS direta do dono, fora do pedagio read_*. Desde 30/09/2026 (ADR-014 §12) impede agendar no intervalo, e administrador/schedule.manage veem o intervalo SEM o rotulo por read_professional_busy_intervals.';
COMMENT ON COLUMN public.professional_blocks.label IS
  'Rotulo livre do proprio profissional. Ninguem alem dele le esta coluna: read_professional_busy_intervals nao a devolve.';


-- ============================================================
-- 6. Privilegios — no fim, e medidos
-- ============================================================

REVOKE EXECUTE ON FUNCTION private.is_slot_blocked(uuid, timestamptz, timestamptz)       FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION private.my_appointment_conflicts(timestamptz, timestamptz)    FROM PUBLIC, anon;
-- save_professional_block e INVOKER: quem a chama precisa do helper.
GRANT  EXECUTE ON FUNCTION private.my_appointment_conflicts(timestamptz, timestamptz)    TO authenticated;

REVOKE EXECUTE ON FUNCTION public.read_professional_busy_intervals(timestamptz, timestamptz)          FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.save_professional_block(timestamptz, timestamptz, text, uuid)      FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.schedule_appointment(uuid, uuid, text, timestamptz, timestamptz, text, uuid, uuid, text, text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.reschedule_appointment(uuid, timestamptz, timestamptz, uuid)        FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.read_professional_busy_intervals(timestamptz, timestamptz)           TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_professional_block(timestamptz, timestamptz, text, uuid)       TO authenticated;
GRANT EXECUTE ON FUNCTION public.schedule_appointment(uuid, uuid, text, timestamptz, timestamptz, text, uuid, uuid, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reschedule_appointment(uuid, timestamptz, timestamptz, uuid)         TO authenticated;

DO $$
DECLARE
  v_rpcs text[] := ARRAY[
    'public.read_professional_busy_intervals(timestamptz, timestamptz)',
    'public.save_professional_block(timestamptz, timestamptz, text, uuid)',
    'public.schedule_appointment(uuid, uuid, text, timestamptz, timestamptz, text, uuid, uuid, text, text, text)',
    'public.reschedule_appointment(uuid, timestamptz, timestamptz, uuid)',
    'private.my_appointment_conflicts(timestamptz, timestamptz)'
  ];
  v_ruim text;
BEGIN
  SELECT pg_catalog.string_agg(sig, ', ') INTO v_ruim
    FROM pg_catalog.unnest(v_rpcs) AS sig
   WHERE NOT pg_catalog.has_function_privilege('authenticated', sig, 'EXECUTE')
      OR pg_catalog.has_function_privilege('anon', sig, 'EXECUTE');
  IF v_ruim IS NOT NULL THEN
    RAISE EXCEPTION 'privilegio errado (authenticated sem EXECUTE ou anon com) em: %', v_ruim;
  END IF;

  SELECT pg_catalog.string_agg(r, ', ') INTO v_ruim
    FROM pg_catalog.unnest(ARRAY['anon', 'authenticated']) AS r
   WHERE pg_catalog.has_function_privilege(r, 'private.is_slot_blocked(uuid, timestamptz, timestamptz)', 'EXECUTE');
  IF v_ruim IS NOT NULL THEN
    RAISE EXCEPTION 'is_slot_blocked executavel por: %', v_ruim;
  END IF;

  IF pg_catalog.has_table_privilege('anon', 'public.professional_blocks', 'SELECT') THEN
    RAISE EXCEPTION 'anon le professional_blocks';
  END IF;
END;
$$;
