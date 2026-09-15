-- O caminho de escrita dos motivos de falta, cancelamento e remarcacao.
-- Design e racional: supera-docs/ADRs/ADR-022 — O que ainda dependia so de nos.md
-- Requisito: supera-docs/Requisitos/Painel Administrativo/Relatorios e estatisticas.md
--
-- O QUE ESTAVA PELA METADE: `appointment_status_reasons` nasceu com RLS, duas
-- politicas de leitura, FK vinda de `appointments.status_reason_id` — e
-- `REVOKE INSERT, UPDATE, DELETE ... FROM authenticated`. Ou seja: a tabela e
-- legivel, referenciavel e IMPOSSIVEL de preencher por qualquer caminho da
-- aplicacao. Enquanto assim, `set_appointment_status(…, p_reason_id)` so aceita
-- NULL, e o relatorio de faltas conta quantas houve sem nunca dizer por que.
--
-- A CLINICA JA RESPONDEU A FORMA: lista fixa, cadastrada no painel, e nao texto
-- livre. Texto livre inviabilizaria justamente o recorte por motivo que o
-- requisito pede. O que falta e a LISTA em si, que sai de uma conversa com a
-- recepcao — e por isso esta migration entrega o mecanismo e NAO semeia
-- nenhuma linha. Motivo de falta inventado por engenharia vira estatistica
-- clinica falsa, e a #5 ja custou essa licao uma vez.
--
-- O MOTIVO PERTENCE A UM ESTADO. `status_reason_id` sozinho nao diz se "paciente
-- internado" explica uma falta ou um cancelamento, e a tabela ja carregava
-- `status_id` desde que nasceu. As RPCs abaixo preservam esse vinculo em vez de
-- deixarem a tela escolher qualquer par.
--
-- DESATIVA, NUNCA APAGA. Mesma regra de todo vocabulario do projeto: apagar um
-- motivo ja usado quebraria `appointments.status_reason_id` (a FK e RESTRICT) e
-- falsificaria relatorio antigo. `set_status_reason_active` e o par completo.


-- ============================================================
-- 1. As tres RPCs
-- ============================================================

CREATE FUNCTION public.create_status_reason(
  p_status_code text,
  p_code        text,
  p_label       text,
  p_sort_order  smallint DEFAULT 0
)
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_status_id uuid;
  v_id        uuid;
BEGIN
  IF NOT private.is_active_admin() THEN
    RAISE EXCEPTION 'apenas administrador cadastra motivo'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT s.id INTO v_status_id
    FROM public.appointment_statuses s
   WHERE s.code = p_status_code AND s.is_active;

  IF v_status_id IS NULL THEN
    RAISE EXCEPTION 'estado de compromisso inexistente: %', p_status_code
      USING ERRCODE = 'no_data_found';
  END IF;

  -- So estado TERMINAL tem motivo. "Agendado" nao se explica por um motivo, e
  -- aceitar o par abriria recorte que o relatorio nunca vai saber ler.
  IF NOT EXISTS (SELECT 1 FROM public.appointment_statuses s
                  WHERE s.id = v_status_id AND s.is_terminal) THEN
    RAISE EXCEPTION 'motivo so se cadastra para estado terminal, e % nao e', p_status_code
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  IF p_code !~ '^[a-z0-9_]+$' THEN
    RAISE EXCEPTION 'codigo do motivo aceita apenas minusculas, digitos e underscore'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  IF p_label IS NULL OR length(btrim(p_label)) = 0 THEN
    RAISE EXCEPTION 'o rotulo do motivo nao pode ser vazio'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  INSERT INTO public.appointment_status_reasons (status_id, code, label, sort_order)
  VALUES (v_status_id, p_code, btrim(p_label), COALESCE(p_sort_order, 0::smallint))
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- O ROTULO SE CORRIGE, O CODIGO NAO. O codigo e a chave que relatorio, filtro e
-- exportacao usam; renomea-lo depois de a recepcao ter registrado faltas com
-- ele quebraria a serie historica em silencio. Erro de portugues no rotulo se
-- conserta; erro de escolha de motivo se conserta desativando e criando outro.
CREATE FUNCTION public.update_status_reason(
  p_reason_id  uuid,
  p_label      text     DEFAULT NULL,
  p_sort_order smallint DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT private.is_active_admin() THEN
    RAISE EXCEPTION 'apenas administrador corrige motivo'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_label IS NOT NULL AND length(btrim(p_label)) = 0 THEN
    RAISE EXCEPTION 'o rotulo do motivo nao pode ser vazio'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  UPDATE public.appointment_status_reasons
     SET label      = COALESCE(btrim(p_label), label),
         sort_order = COALESCE(p_sort_order, sort_order)
   WHERE id = p_reason_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'motivo inexistente' USING ERRCODE = 'no_data_found';
  END IF;
END;
$$;

CREATE FUNCTION public.set_status_reason_active(
  p_reason_id uuid,
  p_is_active boolean
)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT private.is_active_admin() THEN
    RAISE EXCEPTION 'apenas administrador aposenta motivo'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  UPDATE public.appointment_status_reasons
     SET is_active = p_is_active
   WHERE id = p_reason_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'motivo inexistente' USING ERRCODE = 'no_data_found';
  END IF;
END;
$$;

COMMENT ON FUNCTION public.create_status_reason(text, text, text, smallint) IS
  'Cadastra motivo para um estado TERMINAL de compromisso. A lista e da clinica; esta migration nao semeia nenhuma linha.';
COMMENT ON FUNCTION public.update_status_reason(uuid, text, smallint) IS
  'Corrige rotulo e ordem. O CODIGO nao muda: e a chave da serie historica do relatorio de faltas.';


-- ============================================================
-- 2. Privilegios — SEMPRE no fim
-- ============================================================

-- `service_role` tambem perde a escrita direta: o vinculo motivo-estado e a
-- barra de estado terminal vivem nas RPCs, e uma rotina que inserisse direto
-- criaria par que o relatorio nao sabe ler.
REVOKE INSERT, UPDATE, DELETE ON public.appointment_status_reasons FROM service_role;

REVOKE EXECUTE ON FUNCTION public.create_status_reason(text, text, text, smallint)    FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.update_status_reason(uuid, text, smallint)          FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.set_status_reason_active(uuid, boolean)             FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.create_status_reason(text, text, text, smallint)     TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_status_reason(uuid, text, smallint)           TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_status_reason_active(uuid, boolean)              TO authenticated;

DO $$
DECLARE
  v_assinaturas text[] := ARRAY[
    'public.create_status_reason(text, text, text, smallint)',
    'public.update_status_reason(uuid, text, smallint)',
    'public.set_status_reason_active(uuid, boolean)'
  ];
  v_faltando text;
  v_aberto   text;
BEGIN
  SELECT pg_catalog.string_agg(sig, ', ') INTO v_faltando
    FROM pg_catalog.unnest(v_assinaturas) AS sig
   WHERE NOT pg_catalog.has_function_privilege('authenticated', sig, 'EXECUTE');

  IF v_faltando IS NOT NULL THEN
    RAISE EXCEPTION 'authenticated ficou SEM EXECUTE em: %. A tela de Configuracoes nao cadastraria motivo.', v_faltando;
  END IF;

  SELECT pg_catalog.string_agg(sig, ', ') INTO v_aberto
    FROM pg_catalog.unnest(v_assinaturas) AS sig
   WHERE pg_catalog.has_function_privilege('anon', sig, 'EXECUTE');

  IF v_aberto IS NOT NULL THEN
    RAISE EXCEPTION 'anon EXECUTA escrita de vocabulario clinico: %.', v_aberto;
  END IF;
END;
$$;
