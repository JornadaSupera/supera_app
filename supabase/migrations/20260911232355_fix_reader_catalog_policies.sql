-- O catalogo de vocabulario passa a ser legivel pelo leitor auditado.
-- Design e racional: supera-docs/ADRs/ADR-021 — Funcoes de resumo do painel.md
--
-- ISTO E CORRECAO DE UM GRANT INERTE, MEDIDO EM 11/09/2026.
-- A migration create_clinical_read_audit (28/08/2026) escreveu:
--
--     GRANT SELECT ON public.cid10, public.treatment_phases,
--                     public.symptoms, public.specialties TO clinical_reader;
--
-- e o GRANT nunca produziu efeito nenhum. As quatro tabelas tem RLS LIGADA e
-- uma unica politica de SELECT, declarada `TO authenticated`. `clinical_reader`
-- nao e membro de `authenticated` — logo, nenhuma politica casa, e o Postgres
-- devolve ZERO LINHAS, sem erro. Medido no stack local:
--
--     SET ROLE clinical_reader;
--     SELECT count(*) FROM public.symptoms;          -- 0  (a tabela tem 12)
--     SELECT count(*) FROM public.specialties;       -- 0  (a tabela tem 7)
--     SELECT count(*) FROM public.treatment_phases;  -- 0  (a tabela tem 2)
--     SELECT count(*) FROM public.appointment_statuses;  -- 5, porque ESTA tem
--                                                        -- politica de reader
--
-- Nada quebrou ate hoje porque nenhuma read_* existente faz join com catalogo:
-- todas devolvem `SETOF <tabela>` e o front-end resolve o rotulo por conta
-- propria, lendo o catalogo com `.from()` (ele nao paga pedagio). O furo estava
-- dormindo, esperando a primeira funcao que precisasse do rotulo por dentro.
--
-- POR QUE ISSO IMPORTA AGORA: as funcoes de resumo agrupam POR sintoma, POR
-- especialidade e POR fase, e devolvem o rotulo junto do identificador — sem
-- isso a tela do painel receberia uma coluna de uuid e teria de casar tudo no
-- cliente. E o modo de falhar seria o pior possivel: um INNER JOIN com catalogo
-- invisivel nao devolve linha com rotulo nulo, ele DESCARTA A LINHA INTEIRA. O
-- resumo mostraria zero eventos sobre uma base cheia, e o numero seria
-- silenciosamente falso.
--
-- A forma da correcao copia a que `create_appointments` ja tinha usado para
-- `appointment_types`/`appointment_statuses`/`appointment_status_reasons`:
-- politica gemea `TO clinical_reader`, `USING (true)`. Vocabulario nao e dado
-- de paciente — nao ha o que filtrar por titular numa lista de sintomas.
--
-- `USING (true)` e nao `USING (is_active)`, de proposito, e pela mesma razao da
-- nota do guia: **vocabulario se aposenta, nunca se apaga**. Um resumo
-- historico precisa do rotulo do sintoma desativado no ano passado; filtrar por
-- `is_active` aqui reintroduziria o descarte silencioso pela porta dos fundos,
-- so que restrito ao passado — que e exatamente onde ninguem olha.

CREATE POLICY symptoms_select_reader ON public.symptoms
  FOR SELECT TO clinical_reader USING ( true );

CREATE POLICY specialties_select_reader ON public.specialties
  FOR SELECT TO clinical_reader USING ( true );

CREATE POLICY treatment_phases_select_reader ON public.treatment_phases
  FOR SELECT TO clinical_reader USING ( true );

CREATE POLICY cid10_select_reader ON public.cid10
  FOR SELECT TO clinical_reader USING ( true );


-- ASSERCAO DE EFEITO, nao de execucao (ADR-016): o que interessa nao e que os
-- quatro CREATE POLICY tenham rodado, e que o papel PASSE A ENXERGAR linha.
-- Aqui isso se mede de verdade, assumindo o papel e contando — a unica forma
-- que teria pego o engano de 28/08/2026.
DO $$
DECLARE
  v_symptoms integer;
  v_specialties integer;
  v_phases integer;
BEGIN
  SET LOCAL ROLE clinical_reader;

  SELECT count(*) INTO v_symptoms    FROM public.symptoms;
  SELECT count(*) INTO v_specialties FROM public.specialties;
  SELECT count(*) INTO v_phases      FROM public.treatment_phases;

  RESET ROLE;

  -- Os numeros exatos nao entram na condicao: o seed pode crescer. O que se
  -- afirma e que o papel deixou de enxergar VAZIO onde a tabela tem linha.
  IF v_symptoms = 0 OR v_specialties = 0 OR v_phases = 0 THEN
    RAISE EXCEPTION
      'clinical_reader continua cego ao catalogo (sintomas=%, especialidades=%, fases=%). Todo resumo com join de rotulo devolveria vazio.',
      v_symptoms, v_specialties, v_phases;
  END IF;
EXCEPTION WHEN OTHERS THEN
  -- Sem o RESET o papel vaza para o resto da migration, e o primeiro comando
  -- que dependa de uuid_generate_v7 morre por privilegio (medido em ADR-016).
  RESET ROLE;
  RAISE;
END;
$$;
