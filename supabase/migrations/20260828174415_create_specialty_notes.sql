-- Agregado Registro clinico — a anotacao pontual e a sinalizacao sem conteudo.
-- Design e racional: supera-docs/Modelo de Dados/Registro clinico.md
-- Decisao sob teste:  ADR-009 (granularidade do agregado), sobre o contrato
--                     transversal da ADR-003 §3 e o pedagio da ADR-008.
--
-- PRIMEIRA TABELA DO PROJETO A EXERCER O CONTRATO TRANSVERSAL. Ate aqui, ou a
-- tabela nao tinha especialidade (o diario, excecao declarada da ADR-007), ou
-- nao era conteudo de especialidade. Aqui patient_id + origin_specialty_id +
-- visibility valem pela primeira vez como a regra que a ADR-003 §3 escreveu.
--
-- O rascunho do pre-mortem tinha SETE objetos. Esta migration traz TRES tabelas
-- (uma delas em `private`) mais uma view. Cortados, e o motivo:
--   * note_revisions — historico de edicao guarda CONTEUDO clinico versionado,
--     que a eliminacao do titular nao alcanca (ADR-005). A nota passa a ser
--     IMUTAVEL, como o registro salvo do diario: correcao e nota nova.
--   * assessments (PHQ-9, GAD-7, ESAS) — registro estruturado por especialidade
--     e nivel COMPLETO. Quem digitaria o escore nao existe no MEDIO, e o Gemed
--     nao os fornece. Questao #31, fora ate a CEON responder.
--   * note_kind — o MEDIO tem UMA especie de nota (a anotacao pontual).
--     Vocabulario inventado para uma tela que nao existe.
--   * campo livre no sinal — era a porta de saida do conteudo sigiloso.
--     "Sinalizacao SEM conteudo" so e verdade se nao houver onde escrever.


-- ============================================================
-- 1. Vocabulario
-- ============================================================

-- Os dois escopos que as fontes descrevem. NAO ha 'private' (nota so do autor):
-- nenhuma fonte a menciona, e a #12 respondeu que dentro da especialidade nao
-- ha diferenca de acesso.
CREATE TYPE public.note_visibility AS ENUM ('team', 'specialty_restricted');

-- Um valor so, de proposito: a unica sinalizacao que as fontes descrevem e
-- "Sinalizar sofrimento". Enum e nao tabela porque isto e vocabulario fechado
-- de regra, nao categoria configuravel pelo administrador (ADR-002).
CREATE TYPE public.specialty_flag_kind AS ENUM ('distress');


-- ============================================================
-- 2. my_professional_id — o helper que faltava
-- ============================================================
--
-- is_active_professional() responde SE; este responde QUEM. A autoria da nota
-- precisa do id, e derivar isso no WITH CHECK com EXISTS repetiria o lookup em
-- toda politica.

CREATE FUNCTION private.my_professional_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT p.id
    FROM public.professionals p
    JOIN public.accounts a ON a.id = p.account_id
   WHERE p.account_id = auth.uid()
     AND p.is_active
     AND a.is_active;
$$;

COMMENT ON FUNCTION private.my_professional_id() IS
  'Id do profissional da sessao, ou NULL. Checa is_active nos DOIS niveis (conta e perfil), como is_active_professional() — conta desativada com perfil ativo e o caso que a fixture 7777 mede.';


-- ============================================================
-- 3. specialty_notes — a anotacao pontual
-- ============================================================

CREATE TABLE public.specialty_notes (
  id uuid PRIMARY KEY DEFAULT public.uuid_generate_v7(),
  -- As TRES colunas do contrato transversal da ADR-003 §3.
  patient_id          uuid NOT NULL REFERENCES public.patients (id)    ON DELETE RESTRICT,
  origin_specialty_id uuid NOT NULL REFERENCES public.specialties (id) ON DELETE RESTRICT,
  visibility          public.note_visibility NOT NULL DEFAULT 'team',
  -- Autoria em duas colunas: o PERFIL (para a regra de escrita por area) e a
  -- CONTA (para a trilha). Um profissional pode perder o perfil; a conta que
  -- escreveu nao muda.
  author_professional_id uuid NOT NULL REFERENCES public.professionals (id) ON DELETE RESTRICT,
  authored_by            uuid NOT NULL REFERENCES public.accounts (id)      ON DELETE RESTRICT,
  body text NOT NULL CHECK (length(btrim(body)) > 0),
  -- Correcao e nota NOVA que aponta para a anterior — nao UPDATE, nao versao.
  -- UNIQUE: uma nota e corrigida uma vez; a segunda correcao aponta para a
  -- primeira correcao, e a cadeia fica legivel.
  supersedes_note_id uuid REFERENCES public.specialty_notes (id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_specialty_notes_supersedes UNIQUE (supersedes_note_id),
  -- Nota nao corrige a si mesma.
  CONSTRAINT ck_specialty_notes_supersedes_self CHECK (supersedes_note_id IS DISTINCT FROM id)
);

COMMENT ON TABLE public.specialty_notes IS
  'Anotacao pontual do profissional ("Registrar atendimento"), SEM carater de evolucao oficial — a evolucao formal segue no Gemed. Registro estruturado por especialidade e nivel COMPLETO e NAO existe aqui.';
COMMENT ON COLUMN public.specialty_notes.visibility IS
  'Escopo de leitura. Nasce team; especialidade confidencial forca specialty_restricted por trigger — vale tambem para service_role, que ignora RLS.';
COMMENT ON COLUMN public.specialty_notes.supersedes_note_id IS
  'A nota e IMUTAVEL (ADR-009 §2): corrigir e criar nota nova apontando para a anterior. Sem tabela de revisao — historico de edicao guardaria conteudo clinico que a eliminacao do titular nao alcanca (ADR-005).';

-- SEM updated_at, de proposito: a tabela e imutavel, e uma coluna que nunca
-- muda so mente. A convencao do projeto e "havendo updated_at, anexe o
-- trigger" — aqui nao ha o que atualizar.


-- ============================================================
-- 4. Imutabilidade e sigilo — em trigger, porque service_role ignora RLS
-- ============================================================

CREATE FUNCTION private.enforce_note_confidentiality()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER              -- le specialties sem depender da RLS de quem escreve
SET search_path = ''
AS $$
DECLARE v_confidential boolean;
BEGIN
  SELECT s.is_confidential INTO v_confidential
    FROM public.specialties s WHERE s.id = NEW.origin_specialty_id;

  -- Psicologia e fechada por PROPRIEDADE DA ESPECIALIDADE, nao por escolha de
  -- quem escreve: a psicologa nao pode publicar em team nem por engano nem de
  -- proposito. O caminho contrario (marcar restrito numa especialidade aberta)
  -- continua livre — apertar e sempre permitido.
  IF v_confidential THEN
    NEW.visibility := 'specialty_restricted';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_enforce_confidentiality
BEFORE INSERT ON public.specialty_notes
FOR EACH ROW EXECUTE FUNCTION private.enforce_note_confidentiality();

CREATE FUNCTION private.enforce_note_immutability()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  -- A UNICA mutacao admitida no projeto: APERTAR o escopo de team para
  -- specialty_restricted. Existe por causa da especialidade que so vira
  -- confidencial DEPOIS (secao 5) — sem ela, "psicologia e fechada" viraria
  -- "e fechada a partir de terca", e as notas antigas ficariam abertas.
  IF NEW.visibility = 'specialty_restricted'
     AND OLD.visibility = 'team'
     AND to_jsonb(NEW) - 'visibility' = to_jsonb(OLD) - 'visibility' THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'nota de especialidade e imutavel (id=%): corrija com nota nova apontando para esta', OLD.id
    USING ERRCODE = 'check_violation';
END;
$$;

CREATE TRIGGER trg_enforce_immutability
BEFORE UPDATE ON public.specialty_notes
FOR EACH ROW EXECUTE FUNCTION private.enforce_note_immutability();


-- ============================================================
-- 5. Confidencialidade que chega tarde
-- ============================================================
--
-- O trigger da secao 4 le is_confidential NO INSTANTE DO INSERT. Se uma
-- especialidade for marcada confidencial depois, tudo que ela escreveu antes
-- continuaria legivel pela equipe inteira — e ninguem voltaria para corrigir.

CREATE FUNCTION private.tighten_notes_on_confidential()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER              -- dono das tabelas: passa pelo REVOKE UPDATE
SET search_path = ''
AS $$
BEGIN
  IF NEW.is_confidential AND NOT OLD.is_confidential THEN
    UPDATE public.specialty_notes
       SET visibility = 'specialty_restricted'
     WHERE origin_specialty_id = NEW.id
       AND visibility = 'team';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_tighten_notes_on_confidential
AFTER UPDATE OF is_confidential ON public.specialties
FOR EACH ROW EXECUTE FUNCTION private.tighten_notes_on_confidential();

COMMENT ON FUNCTION private.tighten_notes_on_confidential() IS
  'Sigilo retroage. So aperta (team -> specialty_restricted); desmarcar is_confidential NAO reabre nota nenhuma — o que ja foi escrito sob sigilo continua sob sigilo.';


-- ============================================================
-- 6. specialty_flags — sinalizacao SEM conteudo
-- ============================================================
--
-- "Sinalizar sofrimento" avisa a equipe SEM compartilhar o conteudo da sessao.
-- Nao e flag na nota: se fosse `sigiloso = true`, negar a leitura da nota
-- esconderia tambem o sinal (ADR-003 §3).
--
-- A tabela mora em `private` e o vinculo com a nota de origem so existe aqui.
-- Em `public`, `?select=source_note_id` derrotaria a intencao inteira.

CREATE TABLE private.specialty_flags (
  id uuid PRIMARY KEY DEFAULT public.uuid_generate_v7(),
  patient_id          uuid NOT NULL REFERENCES public.patients (id)    ON DELETE RESTRICT,
  origin_specialty_id uuid NOT NULL REFERENCES public.specialties (id) ON DELETE RESTRICT,
  flag_kind           public.specialty_flag_kind NOT NULL DEFAULT 'distress',
  -- A referencia que NUNCA sai daqui.
  source_note_id      uuid NOT NULL REFERENCES public.specialty_notes (id) ON DELETE RESTRICT,
  raised_by_professional_id uuid NOT NULL REFERENCES public.professionals (id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  -- Um sinal por nota: reenviar o mesmo sinal e ruido, nao informacao nova.
  CONSTRAINT uq_specialty_flags_source UNIQUE (source_note_id)
);

COMMENT ON TABLE private.specialty_flags IS
  'Sinalizacao sem conteudo. Em `private` porque source_note_id nao pode existir em nenhuma superficie legivel pelo cliente. SEM campo de texto livre, de proposito: um campo livre num registro de escopo amplo seria a porta de saida do conteudo sigiloso (ADR-009 §3).';

ALTER TABLE private.specialty_flags ENABLE ROW LEVEL SECURITY;

-- A view e a UNICA superficie legivel — e ela nao tem source_note_id.
-- security_invoker: a RLS aplicada e a de quem consulta, nao a do dono.
CREATE VIEW public.specialty_flags
WITH (security_invoker = true) AS
  SELECT f.id,
         f.patient_id,
         f.origin_specialty_id,
         f.flag_kind,
         f.raised_by_professional_id,
         f.created_at
    FROM private.specialty_flags f;

COMMENT ON VIEW public.specialty_flags IS
  'O sinal como a equipe o ve: existe, e de qual especialidade, sobre qual paciente, quando. A nota de origem NAO aparece — e o que separa "sinalizacao" de "conteudo".';


-- ============================================================
-- 7. RLS
-- ============================================================

ALTER TABLE public.specialty_notes ENABLE ROW LEVEL SECURITY;

-- --- leitura: paga pedagio (ADR-008) ----------------------------------------
--
-- A regra da #9, respondida pela CEON, colapsada em uma linha: le tudo que e
-- da equipe, mais o que e da propria especialidade. A psicologia e o unico
-- caso do segundo termo hoje.
CREATE POLICY specialty_notes_select_professional ON public.specialty_notes
  FOR SELECT TO clinical_reader
  USING (
    (SELECT private.is_active_professional())
    AND ( visibility = 'team'
          OR origin_specialty_id = ANY (ARRAY(SELECT unnest(private.my_specialty_ids()))) )
  );

-- #11 + #23: a administracao ve conteudo clinico, EXCETO psicologia. O
-- `visibility = 'team'` e a regra confirmada por escrito em 28/08/2026.
CREATE POLICY specialty_notes_select_admin ON public.specialty_notes
  FOR SELECT TO clinical_reader
  USING ( (SELECT private.is_active_admin()) AND visibility = 'team' );

-- NENHUMA politica para paciente e cuidador — e decisao, nao esquecimento.
-- Fonte alguma diz que o titular le a anotacao da equipe sobre ele, e o
-- direito de acesso da LGPD nao define POR ONDE o acesso se da (a exportacao
-- do titular pode atende-lo sem expor a anotacao na tela do app). Questao #30.
-- Enquanto ela nao fecha, vale o default deny — abrir depois e uma politica
-- aditiva; ter aberto antes e incidente com dado sensivel.

-- --- escrita: so na propria area (#9), direto na tabela ---------------------
CREATE POLICY specialty_notes_insert_professional ON public.specialty_notes
  FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT private.is_active_professional())
    AND origin_specialty_id = ANY (ARRAY(SELECT unnest(private.my_specialty_ids())))
    AND author_professional_id = (SELECT private.my_professional_id())
    AND authored_by = (SELECT public.get_my_uid())
  );

-- --- o sinal ----------------------------------------------------------------
--
-- Escopo DELIBERADAMENTE mais amplo que o da nota de origem: qualquer
-- profissional ativo ve o sinal, inclusive quando ele nasce na psicologia.
-- E exatamente para isso que ele existe.
CREATE POLICY specialty_flags_select_professional ON private.specialty_flags
  FOR SELECT TO clinical_reader
  USING ( (SELECT private.is_active_professional()) );

-- Administracao NAO le o sinal. "Ve tudo menos psicologia" (#23) e o sinal
-- revela que existe paciente em sofrimento acompanhado pela psicologia —
-- informacao gerencial sobre conteudo sigiloso. Abrir e politica aditiva se a
-- CEON pedir; a inversa nao existe.


-- ============================================================
-- 8. RPC — o unico caminho de escrita do sinal
-- ============================================================
--
-- PostgREST nao expoe `private`, e view nao aceita INSERT sem INSTEAD OF: sem
-- esta funcao, o front-end nao teria como criar o sinal — e improvisaria uma
-- nota `team` com o texto "sinalizo sofrimento", que e o vazamento que todo o
-- desenho existe para evitar. Achado do pre-mortem (falha #4).

CREATE FUNCTION public.raise_specialty_flag(p_source_note_id uuid)
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_professional_id uuid := private.my_professional_id();
  v_note            public.specialty_notes;
  v_flag_id         uuid;
BEGIN
  IF v_professional_id IS NULL THEN
    RAISE EXCEPTION 'apenas profissional ativo sinaliza' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Sinaliza-se a PROPRIA nota. Sem isto, qualquer profissional criaria sinal
  -- sobre nota de psicologia que ele nao pode nem ler — e a contagem de sinais
  -- por paciente viraria um oraculo do que a psicologia registrou.
  SELECT n.* INTO v_note
    FROM public.specialty_notes n
   WHERE n.id = p_source_note_id
     AND n.author_professional_id = v_professional_id;

  IF v_note.id IS NULL THEN
    RAISE EXCEPTION 'nota inexistente ou de outro autor' USING ERRCODE = 'insufficient_privilege';
  END IF;

  INSERT INTO private.specialty_flags
    (patient_id, origin_specialty_id, source_note_id, raised_by_professional_id)
  VALUES
    (v_note.patient_id, v_note.origin_specialty_id, p_source_note_id, v_professional_id)
  RETURNING id INTO v_flag_id;

  RETURN v_flag_id;
END;
$$;

COMMENT ON FUNCTION public.raise_specialty_flag(uuid) IS
  'Cria a sinalizacao sem conteudo a partir de uma nota do PROPRIO autor. Devolve o id do sinal — nunca o da nota.';


-- ============================================================
-- 9. Leitura auditada (ADR-008)
-- ============================================================

GRANT SELECT ON public.specialty_notes TO clinical_reader;
GRANT SELECT ON private.specialty_flags, public.specialty_flags TO clinical_reader;
GRANT EXECUTE ON FUNCTION private.my_professional_id() TO clinical_reader;

CREATE FUNCTION public.read_specialty_notes(
  p_patient_id uuid,
  p_limit      integer     DEFAULT 50,
  p_before     timestamptz DEFAULT NULL
)
RETURNS SETOF public.specialty_notes
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_count integer;
BEGIN
  RETURN QUERY
    SELECT n.* FROM public.specialty_notes n
     WHERE n.patient_id = p_patient_id
       AND (p_before IS NULL OR n.created_at < p_before)
     ORDER BY n.created_at DESC
     LIMIT LEAST(p_limit, 200);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  PERFORM private.log_clinical_read('specialty_notes', p_patient_id, v_count);
END;
$$;

CREATE FUNCTION public.read_specialty_flags(p_patient_id uuid)
RETURNS SETOF public.specialty_flags
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_count integer;
BEGIN
  RETURN QUERY
    SELECT f.* FROM public.specialty_flags f
     WHERE f.patient_id = p_patient_id
     ORDER BY f.created_at DESC;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  PERFORM private.log_clinical_read('specialty_flags', p_patient_id, v_count);
END;
$$;


-- ============================================================
-- 10. Trilha de escrita (#12) e indices
-- ============================================================

CREATE TRIGGER trg_audit_write AFTER INSERT OR UPDATE OR DELETE ON public.specialty_notes
  FOR EACH ROW EXECUTE FUNCTION private.audit_write('patient_id');
CREATE TRIGGER trg_audit_write AFTER INSERT OR UPDATE OR DELETE ON private.specialty_flags
  FOR EACH ROW EXECUTE FUNCTION private.audit_write('patient_id');

-- Timeline da ficha: sempre por paciente, do mais recente para tras.
CREATE INDEX idx_specialty_notes_patient
  ON public.specialty_notes (patient_id, created_at DESC);
-- O espaco da especialidade: "o que a nutricao registrou".
CREATE INDEX idx_specialty_notes_specialty
  ON public.specialty_notes (origin_specialty_id, created_at DESC);
CREATE INDEX idx_specialty_notes_author
  ON public.specialty_notes (author_professional_id);
CREATE INDEX idx_specialty_flags_patient
  ON private.specialty_flags (patient_id, created_at DESC);


-- ============================================================
-- 11. Privilegios — SEMPRE no fim
-- ============================================================

-- A nota nao se edita nem se apaga por caminho nenhum de usuario. O UPDATE que
-- aperta o sigilo (secao 5) roda como DONO das tabelas, e o dono nao e atingido
-- por REVOKE.
REVOKE UPDATE, DELETE ON public.specialty_notes FROM authenticated, service_role;

-- O sinal so nasce pela RPC, e nao morre.
REVOKE INSERT, UPDATE, DELETE ON public.specialty_flags FROM authenticated, service_role;

-- PADRAO QUE SE REPETE EM TODA MIGRATION COM FUNCAO read_*: o novo dono
-- precisa de CREATE no schema da funcao, e create_clinical_read_audit devolveu
-- esse privilegio no fim. Concede, transfere, revoga — a propriedade fica.
-- A friccao e deliberada: clinical_reader com CREATE permanente em `public`
-- deixaria de ser um leitor.
GRANT CREATE ON SCHEMA public TO clinical_reader;

ALTER FUNCTION public.read_specialty_notes(uuid, integer, timestamptz) OWNER TO clinical_reader;
ALTER FUNCTION public.read_specialty_flags(uuid)                       OWNER TO clinical_reader;

REVOKE CREATE ON SCHEMA public FROM clinical_reader;

REVOKE EXECUTE ON FUNCTION private.my_professional_id()             FROM PUBLIC;
-- my_professional_id entra na POLITICA DE INSERT, e EXECUTE e exigido em
-- runtime por quem escreve: sem este GRANT, todo INSERT de nota morre com
-- "permission denied for function my_professional_id". Mesma armadilha ja
-- anotada no CLAUDE.md para uuid_generate_v7 e get_my_uid.
GRANT  EXECUTE ON FUNCTION private.my_professional_id()             TO authenticated;
REVOKE EXECUTE ON FUNCTION private.enforce_note_confidentiality()   FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION private.enforce_note_immutability()      FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION private.tighten_notes_on_confidential()  FROM PUBLIC;

REVOKE EXECUTE ON FUNCTION public.raise_specialty_flag(uuid)                      FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.read_specialty_notes(uuid, integer, timestamptz) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.read_specialty_flags(uuid)                       FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.raise_specialty_flag(uuid)                       TO authenticated;
GRANT EXECUTE ON FUNCTION public.read_specialty_notes(uuid, integer, timestamptz) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.read_specialty_flags(uuid)                       TO authenticated, service_role;

-- authenticated escreve a nota direto (politica da secao 7) mas NAO le a
-- tabela: a leitura da equipe passa pela funcao auditada, sem excecao.
REVOKE SELECT ON public.specialty_notes FROM authenticated;
REVOKE SELECT ON public.specialty_flags FROM authenticated;
