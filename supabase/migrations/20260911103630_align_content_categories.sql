-- As categorias de conteudo passam a ser as sete especialidades.
-- Fonte: resposta da CEON em 31/08/2026 — #19 em Requisitos/Questoes em aberto.md
-- Decisao ja tomada: ADR-002 (tabela de dominio) e ADR-010, emenda de 31/08/2026
--
-- As fontes davam SEIS categorias (Nutricao, Psicologia, Odontologia,
-- Fisioterapia, Enfermagem, Medicacao Oral) contra SETE especialidades:
-- faltava oncologia, faltava farmacia, e sobrava "Medicacao Oral", que nao e
-- especialidade nenhuma. A clinica respondeu que sao as sete especialidades.
--
-- A FLEXIBILIDADE COMPRADA EM AGOSTO SE PAGOU PELO LADO BARATO: `specialty_id`
-- nullable acomodava os dois desfechos, e o desfecho foi o que exige preencher.
-- NENHUMA mudanca de forma nas colunas — so DML, e o aperto do NOT NULL.
--
-- O QUE MUDA DE VERDADE E A REGRA DE ESCRITA. A excecao "categoria sem
-- especialidade fica aberta a qualquer profissional ativo" existia so por causa
-- de Medicacao Oral, e perde o caso. Com toda categoria tendo dona, a regra da
-- #9 volta a ser UNICA: so escrevo em categoria cuja especialidade e minha.


-- ============================================================
-- 1. As duas que faltavam, e a orfa que ganha dona
-- ============================================================
--
-- Medicacao Oral NAO e apagada nem desativada: ela existe nas fontes como
-- chip de filtro da tela de Orientacoes, e conteudo sobre medicacao oral e
-- conteudo de FARMACIA. Ela deixa de ser orfa, que era o unico problema.

INSERT INTO public.content_categories (code, label, specialty_id, sort_order)
SELECT v.code, v.label, s.id, v.sort_order
  FROM (VALUES
          ('oncology', 'Oncologia', 'oncology', 7::smallint),
          ('pharmacy', 'Farmácia',  'pharmacy', 8)
       ) AS v (code, label, specialty_code, sort_order)
  JOIN public.specialties s ON s.code = v.specialty_code
ON CONFLICT (code) DO NOTHING;

UPDATE public.content_categories c
   SET specialty_id = s.id
  FROM public.specialties s
 WHERE c.code = 'oral_medication'
   AND s.code = 'pharmacy'
   AND c.specialty_id IS NULL;


-- ============================================================
-- 2. A excecao deixa de ter caso — e de ter linha possivel
-- ============================================================
--
-- ESCOLHA DE FORMA, e a ADR-010 (emenda de 31/08/2026) a deixou explicitamente
-- em aberto: `specialty_id` vira NOT NULL, ou fica nullable sem uso?
--
-- NOT NULL, pelo mesmo criterio que decidiu notification_preferences na
-- ADR-015 §1: invariante que a CHAVE impoe nao depende de ninguem lembrar.
-- Manter nullable preservaria viva, na politica de escrita, uma regra sem caso
-- — e regra sem caso e a que ninguem testa e a primeira que alguem "conserta"
-- criando a proxima categoria orfa. Se um dia houver categoria editorial sem
-- dona, isso volta como decisao explicita, nao como porta que ficou encostada.
--
-- CHECK NOT VALID + VALIDATE separado, e nao SET NOT NULL direto: mesmo padrao
-- de require_council_registration e validate_treatment_phase_fk.

ALTER TABLE public.content_categories
  ADD CONSTRAINT ck_content_categories_specialty
  CHECK (specialty_id IS NOT NULL)
  NOT VALID;

COMMENT ON COLUMN public.content_categories.specialty_id IS
  'A especialidade dona da categoria. OBRIGATORIA desde 11/09/2026 (#19): as categorias SAO as sete especialidades, e Medicacao Oral e conteudo de farmacia. A excecao "categoria sem dona e aberta a qualquer profissional" morreu com a ultima linha que a exercia.';


-- ============================================================
-- 3. A regra de escrita volta a ser uma so
-- ============================================================
--
-- A perna `c.specialty_id IS NULL` sai. Nao e limpeza cosmetica: enquanto ela
-- estivesse la, bastaria uma categoria nova sem dona para abrir a producao de
-- conteudo de QUALQUER area a QUALQUER profissional ativo — e a #9 vale para a
-- producao de conteudo por analogia confirmada pela resposta 6 A de
-- 31/08/2026, que manteve a anotacao na ficha como escrita da propria area.

DROP POLICY content_items_insert_professional ON public.content_items;

CREATE POLICY content_items_insert_professional ON public.content_items
  FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT private.is_active_professional())
    AND author_professional_id = (SELECT private.my_professional_id())
    AND authored_by = (SELECT public.get_my_uid())
    AND EXISTS (
      SELECT 1 FROM public.content_categories c
       WHERE c.id = category_id
         AND c.is_active
         AND c.specialty_id = ANY (ARRAY(SELECT unnest(private.my_specialty_ids())))
    )
  );
