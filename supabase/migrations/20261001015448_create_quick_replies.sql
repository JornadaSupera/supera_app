-- Respostas rapidas do chat: textos prontos que o profissional insere com um
-- clique, mantidos pela administracao sem mexer em codigo.
-- Plano das pendencias do painel de 30/09/2026, Fase H, item H.2 (painel #8;
-- Mapa 2.4.3, MVP).
-- Design e racional: supera-docs/ADRs/ADR-012 — Granularidade e corte do agregado Comunicação.md
--                    supera-docs/ADRs/ADR-027 — Configuração da clínica e vocabulários editáveis.md
--
-- create_conversations cortou esta tabela do agregado com o motivo certo, e
-- ele continua valendo: o texto reutilizavel nao tem paciente nem especialidade
-- de origem, e Configuracoes da clinica, nao chat. Por isso ela nasce aqui no
-- molde dos VOCABULARIOS EDITAVEIS (ADR-027), nao no da mensagem:
--
--   * NAO E DADO DE PACIENTE. Nao carrega visibility nem paga pedagio, e a
--     leitura e direta, com `authenticated`. O que o profissional insere vira
--     mensagem, e a mensagem e que e dado clinico.
--   * APOSENTA, NUNCA APAGA. DELETE recusado por gatilho, que vale ate para
--     service_role; is_active = false tira o texto da lista.
--   * ESCRITA SO POR RPC DE ADMINISTRADOR, com a trilha de escrita.
--   * NASCE VAZIA. Quem mantem os textos e a clinica (painel #8: "quem mantem
--     os textos esta com o cliente"). Semear frases seria escrever pela CEON o
--     que a equipe diz ao paciente.
--
-- specialty_id NULL = resposta geral, oferecida a todo profissional. Com area,
-- so a quem esta nela hoje — inclusive a Psicologia, cujas respostas nao
-- aparecem para a navegadora. Nao e sigilo de paciente (o texto nao fala de
-- ninguem); e so a lista certa para cada tela.
--
-- SEM `code`. Os vocabularios tem codigo porque sao chave de filtro, relatorio
-- e exportacao. A resposta rapida nao e chave de nada: e um texto que se cola.
-- Por isso ela nao entra em update_vocabulary_term (que serve as tabelas com
-- codigo) e tem RPCs proprias.


-- ============================================================
-- 1. A tabela
-- ============================================================

CREATE TABLE public.quick_replies (
  id           uuid PRIMARY KEY DEFAULT public.uuid_generate_v7(),
  label        text NOT NULL,
  body         text NOT NULL,
  specialty_id uuid REFERENCES public.specialties (id) ON DELETE RESTRICT,
  sort_order   smallint NOT NULL DEFAULT 0,
  is_active    boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),

  -- O rotulo e o que aparece no seletor; o corpo, o que vai para a conversa.
  -- O teto do corpo e generoso para uma orientacao curta e barra o texto
  -- colado por engano.
  CONSTRAINT ck_quick_replies_label CHECK (length(btrim(label)) BETWEEN 1 AND 80),
  CONSTRAINT ck_quick_replies_body  CHECK (length(btrim(body))  BETWEEN 1 AND 2000)
);

COMMENT ON TABLE public.quick_replies IS
  'Respostas prontas do chat (Mapa 2.4.3). Configuracao da clinica, nao dado de paciente: leitura direta pelo profissional, escrita por RPC de administrador, aposenta e nunca apaga. Nasce vazia.';
COMMENT ON COLUMN public.quick_replies.specialty_id IS
  'NULL = geral, para todo profissional. Com area, so para quem esta nela hoje.';

CREATE TRIGGER trg_set_updated_at
BEFORE UPDATE ON public.quick_replies
FOR EACH ROW
WHEN (OLD.* IS DISTINCT FROM NEW.*)
EXECUTE FUNCTION public.set_updated_at();

-- private.reject_vocabulary_delete cita OLD.code na mensagem, e esta tabela nao
-- tem codigo: a recusa levantaria "record old has no field code", o erro
-- certo pelo motivo errado. Funcao propria, mesma regra.
CREATE FUNCTION private.reject_quick_reply_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'resposta rapida se aposenta (is_active = false), nao se apaga: %', OLD.id
    USING ERRCODE = 'restrict_violation';
END;
$$;

CREATE TRIGGER trg_reject_delete
BEFORE DELETE ON public.quick_replies
FOR EACH ROW EXECUTE FUNCTION private.reject_quick_reply_delete();

CREATE TRIGGER trg_audit_write
AFTER INSERT OR UPDATE OR DELETE ON public.quick_replies
FOR EACH ROW EXECUTE FUNCTION private.audit_write('-');

-- A lista do profissional: as da area dele mais as gerais, na ordem da tela.
-- Cobre tambem a FK (unindexed_foreign_keys fica em zero).
CREATE INDEX idx_quick_replies_specialty ON public.quick_replies (specialty_id, sort_order);


-- ============================================================
-- 2. RLS
-- ============================================================

ALTER TABLE public.quick_replies ENABLE ROW LEVEL SECURITY;

CREATE POLICY quick_replies_select_professional ON public.quick_replies
  FOR SELECT TO authenticated
  USING (
    is_active
    AND (SELECT private.is_active_professional())
    AND ( specialty_id IS NULL
          OR specialty_id = ANY (ARRAY(SELECT unnest(private.my_specialty_ids()))) )
  );

-- A administracao ve todas, inclusive as aposentadas, para manter a lista.
CREATE POLICY quick_replies_select_admin ON public.quick_replies
  FOR SELECT TO authenticated
  USING ( (SELECT private.is_active_admin()) );

-- Nenhuma politica de escrita: so as RPCs abaixo escrevem.


-- ============================================================
-- 3. As RPCs do painel administrativo
-- ============================================================

CREATE FUNCTION private.assert_quick_reply_input(
  p_label        text,
  p_body         text,
  p_specialty_id uuid
)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT private.is_active_admin() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF p_label IS NULL OR length(btrim(p_label)) NOT BETWEEN 1 AND 80 THEN
    RAISE EXCEPTION 'invalid_label' USING ERRCODE = '22023',
      HINT = 'Rotulo de 1 a 80 caracteres.';
  END IF;

  IF p_body IS NULL OR length(btrim(p_body)) NOT BETWEEN 1 AND 2000 THEN
    RAISE EXCEPTION 'invalid_body' USING ERRCODE = '22023',
      HINT = 'Texto de 1 a 2000 caracteres.';
  END IF;

  IF p_specialty_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.specialties s
                      WHERE s.id = p_specialty_id AND s.is_active) THEN
    RAISE EXCEPTION 'unknown_specialty' USING ERRCODE = '23503';
  END IF;
END;
$$;

CREATE FUNCTION public.create_quick_reply(
  p_label        text,
  p_body         text,
  p_specialty_id uuid     DEFAULT NULL,
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
  PERFORM private.assert_quick_reply_input(p_label, p_body, p_specialty_id);

  INSERT INTO public.quick_replies (label, body, specialty_id, sort_order)
  VALUES (btrim(p_label), btrim(p_body), p_specialty_id, coalesce(p_sort_order, 0::smallint))
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- SUBSTITUI TUDO: a tela salva o que mostra. specialty_id NULL torna a
-- resposta geral — nao e "manter a area". Mesma convencao de
-- set_appointment_type_style ("NULL apaga").
CREATE FUNCTION public.update_quick_reply(
  p_id           uuid,
  p_label        text,
  p_body         text,
  p_specialty_id uuid,
  p_sort_order   smallint
)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM private.assert_quick_reply_input(p_label, p_body, p_specialty_id);

  UPDATE public.quick_replies
     SET label        = btrim(p_label),
         body         = btrim(p_body),
         specialty_id = p_specialty_id,
         sort_order   = coalesce(p_sort_order, 0::smallint)
   WHERE id = p_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'quick_reply_not_found' USING ERRCODE = 'P0002';
  END IF;
END;
$$;

CREATE FUNCTION public.set_quick_reply_active(
  p_id        uuid,
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
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF p_is_active IS NULL THEN
    RAISE EXCEPTION 'informe true ou false' USING ERRCODE = '22023';
  END IF;

  UPDATE public.quick_replies SET is_active = p_is_active WHERE id = p_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'quick_reply_not_found' USING ERRCODE = 'P0002';
  END IF;
END;
$$;

COMMENT ON FUNCTION public.create_quick_reply(text, text, uuid, smallint) IS
  'Administrador cria resposta rapida. specialty_id NULL = geral.';
COMMENT ON FUNCTION public.update_quick_reply(uuid, text, text, uuid, smallint) IS
  'Administrador substitui rotulo, texto, area e ordem. specialty_id NULL torna a resposta geral.';
COMMENT ON FUNCTION public.set_quick_reply_active(uuid, boolean) IS
  'Aposenta (false) ou reativa (true). Resposta rapida nunca se apaga.';


-- ============================================================
-- 4. Privilegios — SEMPRE no fim
-- ============================================================
--
-- O default privilege do Supabase deu tudo a anon, authenticated e
-- service_role na criacao da tabela. Sai a escrita de todos (as regras de
-- forma e perfil so existem nas RPCs) e a leitura de anon.

REVOKE ALL ON public.quick_replies FROM PUBLIC, anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.quick_replies FROM authenticated, service_role;
GRANT  SELECT ON public.quick_replies TO authenticated;

REVOKE EXECUTE ON FUNCTION private.reject_quick_reply_delete()                     FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION private.assert_quick_reply_input(text, text, uuid)      FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.create_quick_reply(text, text, uuid, smallint)         FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.update_quick_reply(uuid, text, text, uuid, smallint)   FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.set_quick_reply_active(uuid, boolean)                  FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.create_quick_reply(text, text, uuid, smallint)          TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_quick_reply(uuid, text, text, uuid, smallint)    TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_quick_reply_active(uuid, boolean)                   TO authenticated;

DO $$
DECLARE
  v_rpcs text[] := ARRAY[
    'public.create_quick_reply(text, text, uuid, smallint)',
    'public.update_quick_reply(uuid, text, text, uuid, smallint)',
    'public.set_quick_reply_active(uuid, boolean)'
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

  IF pg_catalog.has_table_privilege('anon', 'public.quick_replies', 'SELECT') THEN
    RAISE EXCEPTION 'anon le quick_replies';
  END IF;

  IF NOT pg_catalog.has_table_privilege('authenticated', 'public.quick_replies', 'SELECT') THEN
    RAISE EXCEPTION 'authenticated perdeu a leitura de quick_replies';
  END IF;

  SELECT pg_catalog.string_agg(r || ':' || p, ', ') INTO v_ruim
    FROM pg_catalog.unnest(ARRAY['authenticated', 'service_role']) AS r,
         pg_catalog.unnest(ARRAY['INSERT', 'UPDATE', 'DELETE']) AS p
   WHERE pg_catalog.has_table_privilege(r, 'public.quick_replies', p);
  IF v_ruim IS NOT NULL THEN
    RAISE EXCEPTION 'escrita direta em quick_replies ainda concedida: %', v_ruim;
  END IF;
END;
$$;
