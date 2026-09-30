-- Fase 5.6 (painel G-3) e 5.7 (painel G-3b): os vocabularios passam a ser
-- editaveis pela administracao — e a regra "aposenta, nunca apaga" passa a
-- ser do BANCO, nao da tela.
-- Design e racional: supera-docs/ADRs/ADR-027 — Configuracao da clinica e vocabularios editaveis.md
--
-- O QUE HAVIA: cinco vocabularios (sintomas, categorias de orientacao,
-- assuntos do chat, tipos de compromisso, tipos de notificacao) nasceram com
-- RLS, leitura e `REVOKE` de escrita — legiveis, referenciaveis e
-- impossiveis de mudar sem migration. A regra de nao apagar existia em
-- comentario e em habito; `service_role` apagaria sem ninguem saber.
--
-- O QUE ENTRA:
--   1. tres regras de gatilho, que valem ate para service_role:
--      * DELETE recusado — vocabulario se aposenta com is_active = false;
--      * CODIGO imutavel — e a chave de filtro, relatorio e exportacao, e
--        renomea-lo quebra a serie historica em silencio (a mesma regra do
--        motivo de falta, ADR-022);
--      * tipo de notificacao OBRIGATORIO nao se desliga — `private.notify`
--        ignora tipo inativo, e desligar `critical_alert` calaria o alerta
--        critico para a clinica inteira. A ADR-015 fez "nao silenciavel" ser
--        chave; aqui ele deixa de poder ser contornado pelo interruptor
--        global;
--   2. RPCs de administrador: criar (uma por vocabulario, porque os atributos
--      diferem), corrigir rotulo e ordem, aposentar e reativar;
--   3. leitura dos APOSENTADOS pela administracao (5.7), sem mudar o que o
--      resto ve;
--   4. trilha de escrita nos seis vocabularios.
--
-- O QUE FICA DE FORA, de proposito:
--   * CRIAR tipo de notificacao. O tipo so existe porque um produtor no banco
--     o emite (Fase 2.2); tipo criado pelo painel seria um rotulo que nada
--     dispara. Rotulo, ordem e aposentadoria dos silenciaveis entram.
--   * o ROTEAMENTO do assunto do chat (`conversation_subjects.specialty_id`).
--     Rotear a especialidade confidencial fecha a conversa por sigilo, e a
--     CEON respondeu que quem atende e sempre a navegadora. Assunto novo nasce
--     sem rota, como todos os existentes.
--   * trocar a especialidade de uma categoria ou a marca psicologica de um
--     sintoma depois de criados. Muda o significado de linhas ja usadas;
--     o caminho e aposentar e criar outro.


-- ============================================================
-- 1. As regras de gatilho
-- ============================================================

CREATE FUNCTION private.reject_vocabulary_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'vocabulario se aposenta (is_active = false), nao se apaga: %.%',
    TG_TABLE_NAME, OLD.code
    USING ERRCODE = 'restrict_violation';
END;
$$;

CREATE FUNCTION private.reject_vocabulary_code_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF NEW.code IS DISTINCT FROM OLD.code THEN
    RAISE EXCEPTION 'o codigo de % nao se renomeia (% -> %): aposente e crie outro',
      TG_TABLE_NAME, OLD.code, NEW.code
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE FUNCTION private.guard_notification_type()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF NEW.is_silenceable IS DISTINCT FROM OLD.is_silenceable THEN
    RAISE EXCEPTION 'is_silenceable de % e regra de seguranca clinica, nao configuracao', OLD.code
      USING ERRCODE = 'restrict_violation';
  END IF;

  IF NOT NEW.is_silenceable AND NOT NEW.is_active THEN
    RAISE EXCEPTION 'o tipo % e obrigatorio e nao pode ser desligado: desligar o calaria para todos', OLD.code
      USING ERRCODE = 'restrict_violation';
  END IF;

  RETURN NEW;
END;
$$;

-- Os seis vocabularios que o painel edita. appointment_status_reasons ja
-- tinha RPCs (ADR-022) e so ganha as regras e a trilha.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'symptoms', 'content_categories', 'conversation_subjects',
    'appointment_types', 'notification_types', 'appointment_status_reasons'
  ] LOOP
    EXECUTE pg_catalog.format(
      'CREATE TRIGGER trg_reject_delete BEFORE DELETE ON public.%I
         FOR EACH ROW EXECUTE FUNCTION private.reject_vocabulary_delete()', t);
    EXECUTE pg_catalog.format(
      'CREATE TRIGGER trg_reject_code_change BEFORE UPDATE OF code ON public.%I
         FOR EACH ROW EXECUTE FUNCTION private.reject_vocabulary_code_change()', t);
    EXECUTE pg_catalog.format(
      'CREATE TRIGGER trg_audit_write AFTER INSERT OR UPDATE OR DELETE ON public.%I
         FOR EACH ROW EXECUTE FUNCTION private.audit_write(''-'')', t);
  END LOOP;
END;
$$;

CREATE TRIGGER trg_guard_notification_type
BEFORE UPDATE ON public.notification_types
FOR EACH ROW EXECUTE FUNCTION private.guard_notification_type();


-- ============================================================
-- 2. A administracao le tambem o que esta aposentado (5.7)
-- ============================================================
--
-- Politica ADITIVA, de proposito, e nao troca da existente: quem registra
-- compromisso, abre conversa ou filtra notificacao continua vendo so os
-- ativos. Sintomas e categorias ja eram legiveis por inteiro (USING true).

CREATE POLICY appointment_status_reasons_select_admin ON public.appointment_status_reasons
  FOR SELECT TO authenticated USING ( (SELECT private.is_active_admin()) );
CREATE POLICY appointment_types_select_admin ON public.appointment_types
  FOR SELECT TO authenticated USING ( (SELECT private.is_active_admin()) );
CREATE POLICY conversation_subjects_select_admin ON public.conversation_subjects
  FOR SELECT TO authenticated USING ( (SELECT private.is_active_admin()) );
CREATE POLICY notification_types_select_admin ON public.notification_types
  FOR SELECT TO authenticated USING ( (SELECT private.is_active_admin()) );


-- ============================================================
-- 3. As RPCs
-- ============================================================

-- A guarda comum: perfil, forma do codigo e rotulo. O regex e o mais estreito
-- dos CHECKs existentes (o de symptoms nao aceita digito), para que a RPC
-- recuse com mensagem clara o que a tabela recusaria com check_violation.
CREATE FUNCTION private.assert_vocabulary_input(p_code text, p_label text)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT private.is_active_admin() THEN
    RAISE EXCEPTION 'apenas administrador edita vocabulario'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_code IS NOT NULL AND p_code !~ '^[a-z][a-z_]*$' THEN
    RAISE EXCEPTION 'codigo aceita apenas letras minusculas e underscore, comecando por letra'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  IF p_label IS NOT NULL AND length(btrim(p_label)) = 0 THEN
    RAISE EXCEPTION 'o rotulo nao pode ser vazio'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;
END;
$$;

-- --- criar: uma por vocabulario ---------------------------------------------
--
-- Codigo repetido devolve 23505 (unique_violation) direto da tabela: e o erro
-- que o painel ja sabe traduzir como "ja existe".

CREATE FUNCTION public.create_symptom(
  p_code             text,
  p_label            text,
  p_sort_order       smallint DEFAULT 0,
  p_is_psychological boolean  DEFAULT false
)
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_id uuid;
BEGIN
  PERFORM private.assert_vocabulary_input(COALESCE(p_code, ''), COALESCE(p_label, ''));

  INSERT INTO public.symptoms (code, label, sort_order, is_psychological)
  VALUES (p_code, btrim(p_label), COALESCE(p_sort_order, 0::smallint),
          COALESCE(p_is_psychological, false))
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

CREATE FUNCTION public.create_content_category(
  p_code         text,
  p_label        text,
  p_specialty_id uuid,
  p_sort_order   smallint DEFAULT 0
)
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_id uuid;
BEGIN
  PERFORM private.assert_vocabulary_input(COALESCE(p_code, ''), COALESCE(p_label, ''));

  -- Toda categoria tem especialidade desde a #19 (31/08/2026): e ela que diz
  -- quem produz a orientacao.
  IF NOT EXISTS (SELECT 1 FROM public.specialties s
                  WHERE s.id = p_specialty_id AND s.is_active) THEN
    RAISE EXCEPTION 'especialidade inexistente ou inativa'
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  INSERT INTO public.content_categories (code, label, specialty_id, sort_order)
  VALUES (p_code, btrim(p_label), p_specialty_id, COALESCE(p_sort_order, 0::smallint))
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

CREATE FUNCTION public.create_conversation_subject(
  p_code       text,
  p_label      text,
  p_sort_order smallint DEFAULT 0
)
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_id uuid;
BEGIN
  PERFORM private.assert_vocabulary_input(COALESCE(p_code, ''), COALESCE(p_label, ''));

  -- Sem specialty_id: assunto novo nasce sem rota, como todos os existentes.
  INSERT INTO public.conversation_subjects (code, label, sort_order)
  VALUES (p_code, btrim(p_label), COALESCE(p_sort_order, 0::smallint))
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

CREATE FUNCTION public.create_appointment_type(
  p_code       text,
  p_label      text,
  p_color      text     DEFAULT NULL,
  p_icon_name  text     DEFAULT NULL,
  p_sort_order smallint DEFAULT 0
)
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_id    uuid;
  v_color text := pg_catalog.lower(btrim(p_color));
BEGIN
  PERFORM private.assert_vocabulary_input(COALESCE(p_code, ''), COALESCE(p_label, ''));

  IF v_color !~ '^#[0-9a-f]{6}$' THEN
    RAISE EXCEPTION 'cor invalida: use #rrggbb' USING ERRCODE = 'invalid_parameter_value';
  END IF;

  INSERT INTO public.appointment_types (code, label, color, icon_name, sort_order)
  VALUES (p_code, btrim(p_label), v_color, NULLIF(btrim(p_icon_name), ''),
          COALESCE(p_sort_order, 0::smallint))
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- --- corrigir e aposentar: uma para todos -----------------------------------
--
-- Rotulo, ordem e is_active existem nos cinco com o mesmo nome e o mesmo
-- sentido, e cinco copias da mesma funcao divergiriam na primeira correcao.
-- O nome da tabela vem de uma LISTA FECHADA e entra por %I: nenhum texto do
-- chamador vira SQL.

CREATE FUNCTION private.vocabulary_table(p_vocabulary text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
BEGIN
  IF p_vocabulary IN ('symptoms', 'content_categories', 'conversation_subjects',
                      'appointment_types', 'notification_types') THEN
    RETURN p_vocabulary;
  END IF;
  RAISE EXCEPTION 'vocabulario desconhecido: %', p_vocabulary
    USING ERRCODE = 'invalid_parameter_value';
END;
$$;

CREATE FUNCTION public.update_vocabulary_term(
  p_vocabulary text,
  p_id         uuid,
  p_label      text     DEFAULT NULL,
  p_sort_order smallint DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_rows integer;
BEGIN
  PERFORM private.assert_vocabulary_input(NULL, p_label);

  EXECUTE pg_catalog.format(
    'UPDATE public.%I
        SET label      = COALESCE($1, label),
            sort_order = COALESCE($2, sort_order)
      WHERE id = $3', private.vocabulary_table(p_vocabulary))
  USING btrim(p_label), p_sort_order, p_id;

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows = 0 THEN
    RAISE EXCEPTION 'termo inexistente em %', p_vocabulary USING ERRCODE = 'no_data_found';
  END IF;
END;
$$;

CREATE FUNCTION public.set_vocabulary_term_active(
  p_vocabulary text,
  p_id         uuid,
  p_is_active  boolean
)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_rows integer;
BEGIN
  PERFORM private.assert_vocabulary_input(NULL, NULL);

  IF p_is_active IS NULL THEN
    RAISE EXCEPTION 'informe true ou false' USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- O tipo de notificacao obrigatorio e barrado pelo gatilho, nao aqui: a
  -- regra precisa valer tambem para quem nao passa por esta funcao.
  EXECUTE pg_catalog.format(
    'UPDATE public.%I SET is_active = $1 WHERE id = $2',
    private.vocabulary_table(p_vocabulary))
  USING p_is_active, p_id;

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows = 0 THEN
    RAISE EXCEPTION 'termo inexistente em %', p_vocabulary USING ERRCODE = 'no_data_found';
  END IF;
END;
$$;

-- Cor e icone so existem no tipo de compromisso. NULL APAGA: a tela salva o
-- que mostra, e "sem cor" e escolha valida.
CREATE FUNCTION public.set_appointment_type_style(
  p_id        uuid,
  p_color     text,
  p_icon_name text
)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_color text := pg_catalog.lower(btrim(p_color));
BEGIN
  PERFORM private.assert_vocabulary_input(NULL, NULL);

  IF v_color !~ '^#[0-9a-f]{6}$' THEN
    RAISE EXCEPTION 'cor invalida: use #rrggbb' USING ERRCODE = 'invalid_parameter_value';
  END IF;

  UPDATE public.appointment_types
     SET color = v_color, icon_name = NULLIF(btrim(p_icon_name), '')
   WHERE id = p_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'tipo de compromisso inexistente' USING ERRCODE = 'no_data_found';
  END IF;
END;
$$;

COMMENT ON FUNCTION public.update_vocabulary_term(text, uuid, text, smallint) IS
  'Corrige rotulo e ordem de um termo em symptoms, content_categories, conversation_subjects, appointment_types ou notification_types. O CODIGO nao muda (gatilho).';
COMMENT ON FUNCTION public.set_vocabulary_term_active(text, uuid, boolean) IS
  'Aposenta (false) ou reativa (true). Vocabulario nunca se apaga. Tipo de notificacao obrigatorio recusa false (gatilho).';


-- ============================================================
-- 4. Privilegios — SEMPRE no fim
-- ============================================================

-- A escrita direta sai de todos, service_role incluido: a regra de nao apagar
-- e de nao renomear agora e gatilho e vale para ele, mas a validacao de forma
-- e de perfil so existe nas RPCs.
REVOKE INSERT, UPDATE, DELETE ON public.symptoms              FROM PUBLIC, anon, authenticated, service_role;
REVOKE INSERT, UPDATE, DELETE ON public.content_categories    FROM PUBLIC, anon, authenticated, service_role;
REVOKE INSERT, UPDATE, DELETE ON public.conversation_subjects FROM PUBLIC, anon, authenticated, service_role;
REVOKE INSERT, UPDATE, DELETE ON public.appointment_types     FROM PUBLIC, anon, authenticated, service_role;
REVOKE INSERT, UPDATE, DELETE ON public.notification_types    FROM PUBLIC, anon, authenticated, service_role;

REVOKE EXECUTE ON FUNCTION private.reject_vocabulary_delete()                         FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION private.reject_vocabulary_code_change()                    FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION private.guard_notification_type()                          FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION private.assert_vocabulary_input(text, text)                FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION private.vocabulary_table(text)                             FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.create_symptom(text, text, smallint, boolean)                    FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.create_content_category(text, text, uuid, smallint)              FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.create_conversation_subject(text, text, smallint)                FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.create_appointment_type(text, text, text, text, smallint)        FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.update_vocabulary_term(text, uuid, text, smallint)               FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.set_vocabulary_term_active(text, uuid, boolean)                  FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.set_appointment_type_style(uuid, text, text)                     FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.create_symptom(text, text, smallint, boolean)                     TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_content_category(text, text, uuid, smallint)               TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_conversation_subject(text, text, smallint)                 TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_appointment_type(text, text, text, text, smallint)         TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_vocabulary_term(text, uuid, text, smallint)                TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_vocabulary_term_active(text, uuid, boolean)                   TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_appointment_type_style(uuid, text, text)                      TO authenticated;

DO $$
DECLARE
  v_rpcs text[] := ARRAY[
    'public.create_symptom(text, text, smallint, boolean)',
    'public.create_content_category(text, text, uuid, smallint)',
    'public.create_conversation_subject(text, text, smallint)',
    'public.create_appointment_type(text, text, text, text, smallint)',
    'public.update_vocabulary_term(text, uuid, text, smallint)',
    'public.set_vocabulary_term_active(text, uuid, boolean)',
    'public.set_appointment_type_style(uuid, text, text)'
  ];
  v_tabelas text[] := ARRAY[
    'public.symptoms', 'public.content_categories', 'public.conversation_subjects',
    'public.appointment_types', 'public.notification_types', 'public.appointment_status_reasons'
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

  SELECT pg_catalog.string_agg(t, ', ') INTO v_ruim
    FROM pg_catalog.unnest(v_tabelas) AS t
   WHERE pg_catalog.has_table_privilege('service_role', t, 'DELETE')
      OR pg_catalog.has_table_privilege('authenticated', t, 'DELETE');
  IF v_ruim IS NOT NULL THEN
    RAISE EXCEPTION 'DELETE ainda concedido em vocabulario: %', v_ruim;
  END IF;

  SELECT pg_catalog.string_agg(t, ', ') INTO v_ruim
    FROM pg_catalog.unnest(v_tabelas) AS t
   WHERE NOT EXISTS (SELECT 1 FROM pg_catalog.pg_trigger g
                      WHERE g.tgrelid = t::regclass AND g.tgname = 'trg_reject_delete'
                        AND g.tgenabled <> 'D');
  IF v_ruim IS NOT NULL THEN
    RAISE EXCEPTION 'vocabulario sem o gatilho que recusa DELETE: %', v_ruim;
  END IF;
END;
$$;
