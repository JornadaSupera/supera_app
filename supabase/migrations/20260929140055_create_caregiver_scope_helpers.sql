-- Os helpers que as politicas do acompanhante passam a usar (Fase C1, ADR-030).
--
-- private.my_ward_patient_ids_for(area): o mesmo recorte de
-- my_ward_patient_ids() — conta ativa, perfil ativo, ficha ativa, vinculo
-- `active` —, mais a area ligada naquele vinculo. E ESTA a forma que entra
-- nas politicas:
--
--   patient_id = ANY (ARRAY(SELECT unnest(private.my_ward_patient_ids_for('chat'))))
--
-- O argumento e constante e nao ha correlacao com a linha: o planner avalia
-- o subselect uma vez por consulta (InitPlan). O pedido sugeria somar
-- `AND private.caregiver_scope_allows(patient_id, ...)` a politica; como
-- depende da linha, seria avaliado linha a linha — a forma que o comentario
-- de my_ward_patient_ids() mediu 111x mais lenta.
--
-- private.caregiver_scope_allows(paciente, area): o mesmo teste para UM
-- paciente, com o nome do pedido. Usada dentro de funcoes, onde a linha ja
-- foi escolhida.
--
-- LINHA AUSENTE NEGA (fail-closed, ADR-003): o JOIN exige a linha da area com
-- enabled = true. O trigger de criacao do vinculo garante que ela nao falte;
-- se faltar, o acompanhante perde a area, nao ganha.
--
-- my_ward_patient_ids() NAO muda: continua sendo o "tem vinculo ativo", usado
-- por get_my_ward (o nome do tutelado aparece mesmo com todas as areas
-- desligadas) e pelos ramos de notificacao que a Fase C2 vai recortar.


-- ============================================================
-- 1. O recorte por area
-- ============================================================

CREATE FUNCTION private.my_ward_patient_ids_for(p_scope public.caregiver_scope)
RETURNS uuid[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT coalesce(pg_catalog.array_agg(pc.patient_id), '{}'::uuid[])
  FROM public.patient_caregivers pc
  JOIN public.caregivers c ON c.id = pc.caregiver_id
  JOIN public.accounts   a ON a.id = c.account_id
  JOIN public.patients   p ON p.id = pc.patient_id
  JOIN public.patient_caregiver_scopes s
    ON s.link_id = pc.id
   AND s.scope   = p_scope
   AND s.enabled
  WHERE a.id = auth.uid()
    AND a.is_active
    AND c.is_active
    AND p.is_active
    AND pc.status = 'active';
$$;

COMMENT ON FUNCTION private.my_ward_patient_ids_for(public.caregiver_scope) IS
  'Tutelados do acompanhante (vinculo active) com a area ligada. Linha de area ausente nega. Forma de uso em politica: patient_id = ANY (ARRAY(SELECT unnest(private.my_ward_patient_ids_for(<area>)))).';


CREATE FUNCTION private.caregiver_scope_allows(p_patient_id uuid, p_scope public.caregiver_scope)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT p_patient_id IS NOT NULL
     AND p_patient_id = ANY (private.my_ward_patient_ids_for(p_scope));
$$;

COMMENT ON FUNCTION private.caregiver_scope_allows(uuid, public.caregiver_scope) IS
  'O acompanhante da sessao alcanca esta area deste paciente? Para uso dentro de funcoes; em politica, use my_ward_patient_ids_for.';


-- ============================================================
-- 2. Privilegios — SEMPRE no fim
-- ============================================================
--
-- As duas entram em politica (ou em funcao chamada por politica), e o papel
-- que CONSULTA precisa de EXECUTE. Em `private` nao ha default privilege do
-- Supabase, mas PUBLIC ganha EXECUTE de toda funcao nova (armadilha 2).

REVOKE EXECUTE ON FUNCTION private.my_ward_patient_ids_for(public.caregiver_scope)      FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION private.caregiver_scope_allows(uuid, public.caregiver_scope) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION private.my_ward_patient_ids_for(public.caregiver_scope)      TO authenticated;
GRANT  EXECUTE ON FUNCTION private.caregiver_scope_allows(uuid, public.caregiver_scope) TO authenticated;


DO $$
BEGIN
  IF pg_catalog.has_function_privilege('anon', 'private.my_ward_patient_ids_for(public.caregiver_scope)', 'EXECUTE')
     OR pg_catalog.has_function_privilege('anon', 'private.caregiver_scope_allows(uuid, public.caregiver_scope)', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon alcanca os helpers de area do acompanhante';
  END IF;

  IF NOT pg_catalog.has_function_privilege('authenticated', 'private.my_ward_patient_ids_for(public.caregiver_scope)', 'EXECUTE')
     OR NOT pg_catalog.has_function_privilege('authenticated', 'private.caregiver_scope_allows(uuid, public.caregiver_scope)', 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated sem EXECUTE nos helpers de area — as politicas do acompanhante morreriam';
  END IF;

  IF NOT pg_catalog.has_function_privilege('authenticated', 'private.my_ward_patient_ids()', 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated perdeu EXECUTE em my_ward_patient_ids';
  END IF;
END;
$$;
