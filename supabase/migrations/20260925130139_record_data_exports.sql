-- Fase 3.5 das pendencias consolidadas (painel A-1): registrar exportacao.
-- Design e racional: supera-docs/ADRs/ADR-025 — Ciclo do pedido do titular e exportacao.md
--
-- O painel exporta — CSV da trilha, relatorios, a lista de pacientes — e ate
-- aqui o banco nao sabia. A leitura que alimentou o arquivo esta na trilha, mas
-- "leu 300 linhas" e "levou 300 linhas embora num arquivo" sao fatos diferentes,
-- e o segundo e o que mais interessa numa investigacao de vazamento.
--
-- O ARQUIVO E GERADO NO CLIENTE, e por isso o banco nao tem como observar a
-- exportacao sozinho: so a aplicacao sabe que o usuario clicou em "baixar". O
-- caminho e uma declaracao — `log_data_export` — e a trilha guarda o que foi
-- declarado. Declaracao que o cliente pode deixar de fazer: e o limite, e esta
-- escrito no guia. O que a funcao garante e que a declaracao feita nao se
-- perde, nao se altera e nao carrega conteudo.


-- ============================================================
-- 1. A constraint de row_count passa a aceitar 'export'
-- ============================================================
--
-- Exportacao carrega contagem pela mesma razao que leitura: e o numero que
-- distingue "exportou a ficha de um paciente" de "exportou a base".
--
-- NOT VALID aqui e VALIDATE em validate_audit_export_constraint, o padrao do
-- projeto para constraint nova em tabela populada: `audit_log` e a maior tabela
-- do banco, e VALIDATE na mesma transacao seguraria o lock que o NOT VALID
-- existe para evitar. As linhas novas ja sao checadas a partir deste COMMIT.

ALTER TABLE public.audit_log DROP CONSTRAINT ck_audit_log_row_count;

ALTER TABLE public.audit_log
  ADD CONSTRAINT ck_audit_log_row_count
  CHECK ((action IN ('read', 'export')) = (row_count IS NOT NULL))
  NOT VALID;


-- ============================================================
-- 2. O escritor interno
-- ============================================================
--
-- Separado da RPC publica porque ha dois chamadores com portoes diferentes: a
-- equipe declarando a exportacao do painel (abaixo) e o titular baixando o
-- proprio pacote LGPD (close_data_subject_request_cycle). A linha e a mesma.

CREATE FUNCTION private.log_data_export(
  p_scope       text,
  p_row_count   bigint,
  p_patient_id  uuid DEFAULT NULL,
  p_resource_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
  INSERT INTO public.audit_log
    (actor_account_id, action, resource_table, resource_id, patient_id,
     row_count, origin, actor_capacity)
  VALUES
    (auth.uid(), 'export', p_scope, p_resource_id, p_patient_id,
     p_row_count, private.request_origin(), private.actor_capacity());
$$;

COMMENT ON FUNCTION private.log_data_export(text, bigint, uuid, uuid) IS
  'Linha de exportacao na trilha: quem, quando, que recorte, quantas linhas. Nunca o conteudo exportado.';


-- ============================================================
-- 3. A RPC que a aplicacao chama
-- ============================================================
--
-- O RECORTE E UM IDENTIFICADOR, NAO UM TEXTO. O CHECK de formato abaixo e o
-- que impede a trilha de virar o lugar onde alguem escreve "exportei a ficha
-- da Maria da Silva": `audit_log` e imutavel, e nome gravado nela nao se
-- elimina (ADR-005 §3). Com `^[a-z][a-z0-9_]{0,62}$`, cabe `patient_list`,
-- `audit_log`, `report_symptoms_by_protocol` — e nao cabe espaco, acento,
-- maiuscula nem digito solto de CPF no comeco.
--
-- QUEM DECLARA: administrador e profissional ativo, que sao quem exporta no
-- painel. O titular exporta pelo pedido LGPD, que registra sozinho; o cuidador
-- nao exporta. Uma conta sem perfil que pudesse escrever na trilha seria um
-- jeito de encher de ruido o registro que precisa servir para investigar.
--
-- `p_patient_id` e opcional: exportar a lista inteira nao tem titular; exportar
-- a ficha de um paciente tem, e e por paciente que a trilha e consultada
-- ("quem levou o dado deste titular?").

CREATE FUNCTION public.log_data_export(
  p_scope      text,
  p_row_count  bigint,
  p_patient_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT (private.is_active_admin() OR private.is_active_professional()) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF p_scope IS NULL OR p_scope !~ '^[a-z][a-z0-9_]{0,62}$' THEN
    RAISE EXCEPTION 'invalid_export_scope' USING ERRCODE = '22023';
  END IF;

  IF p_row_count IS NULL OR p_row_count < 0 THEN
    RAISE EXCEPTION 'invalid_row_count' USING ERRCODE = '22023';
  END IF;

  -- Mensagem propria em vez da violacao de FK: o erro que chega ao painel
  -- precisa dizer o que fazer, e "violates foreign key" nao diz.
  IF p_patient_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.patients WHERE id = p_patient_id) THEN
    RAISE EXCEPTION 'patient_not_found' USING ERRCODE = 'P0002';
  END IF;

  PERFORM private.log_data_export(p_scope, p_row_count, p_patient_id);
END;
$$;

COMMENT ON FUNCTION public.log_data_export(text, bigint, uuid) IS
  'Declara uma exportacao feita no painel (A-1). Recorte e identificador snake_case, nunca texto livre; a trilha nao guarda o conteudo.';


-- ============================================================
-- 4. Privilegios — no fim, e medidos
-- ============================================================

REVOKE EXECUTE ON FUNCTION private.log_data_export(text, bigint, uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.log_data_export(text, bigint, uuid)         FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.log_data_export(text, bigint, uuid)         TO authenticated;

DO $$
BEGIN
  IF pg_catalog.has_function_privilege('anon', 'public.log_data_export(text, bigint, uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon alcanca log_data_export';
  END IF;
  IF NOT pg_catalog.has_function_privilege('authenticated', 'public.log_data_export(text, bigint, uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated perdeu log_data_export';
  END IF;
  IF pg_catalog.has_function_privilege('authenticated', 'private.log_data_export(text, bigint, uuid, uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated escreve export na trilha sem passar pelo portao';
  END IF;
END;
$$;
