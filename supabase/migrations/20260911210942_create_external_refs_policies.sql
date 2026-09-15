-- A fila de conferencia do vinculo com o Gemed ganha leitura.
-- Design e racional: supera-docs/Modelo de Dados/Paciente.md (ADR-004)
-- Fonte: Requisitos/Integracao Gemed — escopo e contratos de dados
--
-- O QUE ESTAVA PELA METADE, apontado pelo dev do painel em 10/09/2026 e
-- confirmado pelo advisor de seguranca: `external_refs` tem RLS ligada e
-- NENHUMA politica. O painel tem o botao — `confirm_external_link` existe
-- desde 28/08/2026 — e nao tem a lista. Ha como confirmar um vinculo e nao ha
-- como saber que ele existe.
--
-- O COMENTARIO ORIGINAL NAO ESTAVA ERRADO, estava incompleto: "a chave de
-- origem nao e dado de tela, so a Edge Function a enxerga" descreve o
-- ESPELHAMENTO, que e mesmo maquina falando com maquina. O que ele nao previu
-- e que a ADR-004 poe uma PESSOA no meio: o vinculo nasce `proposed` e alguem
-- precisa confirma-lo. Essa pessoa e a administracao, e ela nao tinha olhos.
--
-- POR QUE ISSO IMPORTA MAIS DO QUE O TAMANHO SUGERE: vincular a ficha errada
-- ao paciente errado MISTURA PRONTUARIOS, e a conferencia humana e a unica
-- barreira contra isso — a RLS nao pega, porque vinculo errado nao e acesso
-- indevido, e o proprio comentario da coluna `link_status` ja dizia isso. A
-- fila precisa existir ANTES de a integracao ligar, nao depois.


-- ============================================================
-- 1. A politica — sob o pedagio, como todo resto que fala de paciente
-- ============================================================
--
-- `TO clinical_reader` e nao `TO authenticated`, e a escolha e deliberada.
-- `external_refs` nao guarda conteudo clinico, mas a FILA responde "quais
-- pacientes existem, e quais deles o Gemed conhece" — que e a mesma pergunta
-- que `read_patients` responde pagando pedagio desde 28/08/2026. Deixar a
-- mesma informacao sair sem trilha por uma tabela vizinha seria abrir, pela
-- porta lateral, exatamente o caminho que a ADR-008 fechou.
--
-- SO A ADMINISTRACAO. O profissional nao confirma vinculo — nenhuma fonte lhe
-- da essa atribuicao, e `confirm_external_link` ja exige admin no corpo desde
-- que nasceu. Politica e RPC passam a dizer a mesma coisa.
CREATE POLICY external_refs_select_admin ON public.external_refs
  FOR SELECT TO clinical_reader
  USING ( (SELECT private.is_active_admin()) );


-- ============================================================
-- 2. A leitura auditada
-- ============================================================

GRANT SELECT ON public.external_refs TO clinical_reader;

-- Devolve a fila do que ha para conferir. Parametro de status em vez de uma
-- funcao por estado: a tela precisa de "pendentes" no dia a dia e do historico
-- quando alguem pergunta quem confirmou o que.
CREATE FUNCTION public.read_external_refs(
  p_link_status public.external_link_status DEFAULT 'proposed',
  p_limit       integer DEFAULT 50,
  p_offset      integer DEFAULT 0
)
RETURNS SETOF public.external_refs
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_count integer;
BEGIN
  RETURN QUERY
    SELECT er.*
      FROM public.external_refs er
     WHERE er.link_status = p_link_status
     ORDER BY er.created_at
     -- Mesmo teto de 200 das demais: paginacao nao e gentileza do cliente
     -- quando a lista aponta prontuario.
     LIMIT LEAST(p_limit, 200) OFFSET p_offset;
  GET DIAGNOSTICS v_count = ROW_COUNT;

  -- Sem patient_id: a fila e lista, e `local_id` e polimorfico — nem toda
  -- linha aponta paciente. Com a contagem, que e o que separa "conferiu um
  -- vinculo" de "varreu a fila inteira".
  PERFORM private.log_clinical_read('external_refs', NULL, v_count);
END;
$$;

COMMENT ON FUNCTION public.read_external_refs(public.external_link_status, integer, integer) IS
  'Fila de conferencia do vinculo com o Gemed. So administracao, e paga pedagio: a lista responde quais pacientes o Gemed conhece.';


-- ============================================================
-- 3. Privilegios
-- ============================================================

REVOKE EXECUTE ON FUNCTION public.read_external_refs(public.external_link_status, integer, integer)
  FROM PUBLIC, anon;

-- A funcao precisa PERTENCER a clinical_reader — e isto, e so isto, que faz a
-- politica acima valer dentro dela. Dono `postgres` furaria a RLS em silencio.
GRANT CREATE ON SCHEMA public TO clinical_reader;

ALTER FUNCTION public.read_external_refs(public.external_link_status, integer, integer)
  OWNER TO clinical_reader;

REVOKE CREATE ON SCHEMA public FROM clinical_reader;

-- ARMADILHA Nº 6 (ADR-016, medida em 11/09/2026): o GRANT tambem tem de sair
-- daqui de dentro, como DONO. Sob `db push` a cadeia de SET ROLE nao propaga o
-- direito de administrar objeto alheio, e um GRANT como `postgres` sobre
-- funcao de `clinical_reader` falha com 42501 — que `db reset` NAO reproduz,
-- porque conecta direto como `postgres`. O caminho que vale e o que nao se
-- testa localmente.
DO $$
BEGIN
  SET LOCAL ROLE clinical_reader;

  REVOKE EXECUTE ON FUNCTION public.read_external_refs(public.external_link_status, integer, integer)
    FROM PUBLIC, anon;
  GRANT EXECUTE ON FUNCTION public.read_external_refs(public.external_link_status, integer, integer)
    TO authenticated, service_role;

  RESET ROLE;
EXCEPTION WHEN OTHERS THEN
  -- Sem o RESET, o papel vaza para o resto da migration.
  RESET ROLE;
  RAISE;
END;
$$;
