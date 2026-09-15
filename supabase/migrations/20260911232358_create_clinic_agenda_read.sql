-- A agenda da CLINICA INTEIRA — a leitura que o administrador nunca teve.
-- Design e racional: supera-docs/ADRs/ADR-021 — Funcoes de resumo do painel.md
--
-- O DIAGNOSTICO ERA DO DEV DO PAINEL, e estava certo: `read_appointments` exige
-- `p_patient_id`, e `read_my_agenda` resolve o PROFISSIONAL LOGADO por
-- `private.my_professional_id()`. O administrador nao tem perfil profissional —
-- entao a funcao devolve zero linhas para ele, sem erro, e a tela de agenda do
-- painel administrativo fica vazia sem explicar por que. Nao havia caminho
-- nenhum para "todos os compromissos da clinica nesta semana".
--
-- E LEITURA DE LINHAS, NAO RESUMO, e por isso se chama `read_`, nao
-- `summarize_`: ela devolve o compromisso identificado, com paciente e
-- profissional, porque a tela de agenda precisa disso para abrir a ficha. Quem
-- quer contagem usa `summarize_appointments`, que nao devolve identificador
-- nenhum. Duas perguntas diferentes, dois contratos diferentes.
--
-- NENHUMA REGRA DE PERFIL NO CORPO. A funcao nao pergunta se quem chama e
-- administrador: ela e SECURITY DEFINER com dono `clinical_reader`, e as
-- politicas de `appointments` decidem. Na pratica isso significa que o
-- administrador ve a agenda com `visibility = 'team'` (a sessao de psicologia
-- SOME da lista dele, ADR-003 §3), o profissional ve o que e da equipe mais o
-- da propria especialidade, e paciente/cuidador recebem vazio porque as
-- politicas deles sao `TO authenticated`. O sigilo entre especialidades vale na
-- agenda da clinica exatamente como valia na agenda de um paciente.

GRANT EXECUTE ON FUNCTION private.log_clinical_read(text, uuid, integer, uuid)
  TO clinical_reader;   -- ja concedido em create_clinical_read_audit; idempotente
                        -- de proposito, para esta migration nao depender da ordem
                        -- de leitura de quem vier depois.

CREATE FUNCTION public.read_clinic_agenda(
  p_from                timestamptz,
  p_to                  timestamptz,
  p_specialty_id        uuid    DEFAULT NULL,
  p_appointment_type_id uuid    DEFAULT NULL,
  p_status_code         text    DEFAULT NULL,
  p_limit               integer DEFAULT 100,
  p_offset              integer DEFAULT 0
)
RETURNS SETOF public.appointments
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_count integer;
BEGIN
  -- Janela obrigatoria, como em `read_my_agenda`: agenda sem periodo e a tabela
  -- inteira, e a tabela inteira nao e uma tela — e um dump com trilha.
  IF p_from IS NULL OR p_to IS NULL OR p_to < p_from THEN
    RAISE EXCEPTION 'janela invalida: p_from e p_to sao obrigatorios e p_to nao pode ser anterior a p_from'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  RETURN QUERY
    SELECT a.* FROM public.appointments a
     WHERE a.starts_at >= p_from
       AND a.starts_at <  p_to
       AND (p_specialty_id        IS NULL OR a.origin_specialty_id = p_specialty_id)
       AND (p_appointment_type_id IS NULL OR a.appointment_type_id = p_appointment_type_id)
       AND (p_status_code IS NULL OR EXISTS (
              SELECT 1 FROM public.appointment_statuses st
               WHERE st.id = a.status_id AND st.code = p_status_code))
     -- Crescente: a agenda se le do comeco do dia para o fim, ao contrario da
     -- timeline clinica. Mesma escolha de `read_my_agenda`.
     ORDER BY a.starts_at, a.id
     -- LEAST sem qualificacao: gramatica SQL, nao funcao. Teto de 200 no
     -- servidor, como em toda read_*.
     LIMIT LEAST(p_limit, 200) OFFSET p_offset;
  GET DIAGNOSTICS v_count = ROW_COUNT;

  -- patient_id NULL porque a consulta atravessa pacientes, com a contagem da
  -- janela. Mesma forma de `read_my_agenda` e `read_alerts`: o acesso fica
  -- registrado sem inventar um titular para ele.
  PERFORM private.log_clinical_read('appointments', NULL, v_count);
END;
$$;

COMMENT ON FUNCTION public.read_clinic_agenda(timestamptz, timestamptz, uuid, uuid, text, integer, integer) IS
  'Agenda da clinica inteira, paginada e auditada. Complementa read_my_agenda (profissional logado) e read_appointments (um paciente). O total da janela vem de summarize_appointments, nao daqui.';


-- ============================================================
-- Privilegios — SEMPRE no fim
-- ============================================================

GRANT CREATE ON SCHEMA public TO clinical_reader;

ALTER FUNCTION public.read_clinic_agenda(timestamptz, timestamptz, uuid, uuid, text, integer, integer)
  OWNER TO clinical_reader;

REVOKE CREATE ON SCHEMA public FROM clinical_reader;

-- ARMADILHA Nº 6 (ADR-016): REVOKE **e** GRANT saem de dentro do SET LOCAL ROLE
-- para o dono — sob `db push` a cadeia de SET ROLE nao propaga o direito de
-- administrar objeto alheio, e `db reset` nao reproduz a falha.
DO $$
BEGIN
  SET LOCAL ROLE clinical_reader;

  REVOKE EXECUTE ON FUNCTION
    public.read_clinic_agenda(timestamptz, timestamptz, uuid, uuid, text, integer, integer)
    FROM PUBLIC, anon;
  GRANT EXECUTE ON FUNCTION
    public.read_clinic_agenda(timestamptz, timestamptz, uuid, uuid, text, integer, integer)
    TO authenticated, service_role;

  RESET ROLE;
EXCEPTION WHEN OTHERS THEN
  RESET ROLE;
  RAISE;
END;
$$;

-- ASSERCAO DE EFEITO, nao de execucao (ADR-016): os dois lados.
DO $$
DECLARE
  v_sig text := 'public.read_clinic_agenda(timestamptz, timestamptz, uuid, uuid, text, integer, integer)';
BEGIN
  IF NOT pg_catalog.has_function_privilege('authenticated', v_sig, 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated ficou SEM EXECUTE em read_clinic_agenda: a agenda do painel continuaria vazia.';
  END IF;

  IF pg_catalog.has_function_privilege('anon', v_sig, 'EXECUTE') THEN
    RAISE EXCEPTION 'anon AINDA EXECUTA read_clinic_agenda: agenda clinica alcancavel sem login.';
  END IF;

  IF (SELECT r.rolname
        FROM pg_catalog.pg_proc p
        JOIN pg_catalog.pg_roles r ON r.oid = p.proowner
       WHERE p.oid = v_sig::regprocedure) <> 'clinical_reader' THEN
    RAISE EXCEPTION 'read_clinic_agenda com dono errado: a RLS nao valeria dentro dela.';
  END IF;
END;
$$;
