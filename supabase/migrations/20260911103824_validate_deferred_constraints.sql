-- Valida as constraints que nasceram NOT VALID nesta leva.
--
-- O padrao vem de validate_treatment_phase_fk (28/08/2026), imposto pelo
-- Squawk: constraint sobre tabela JA EXISTENTE nasce NOT VALID, e o VALIDATE
-- vive em migration SEPARADA — na mesma transacao ele bloquearia leitura,
-- anulando o motivo de ter separado. VALIDATE pega SHARE UPDATE EXCLUSIVE, que
-- convive com leitura e escrita.
--
-- ESTE ARQUIVO E O QUE PODE FALHAR EM HOMOLOGACAO, e a falha e a informacao.
-- Cada VALIDATE abaixo afirma algo sobre os dados que ja estao la:
--   * todo profissional cadastrado tem registro de conselho (#14);
--   * toda categoria de conteudo tem especialidade dona (#19).
-- Se um deles recusar, a correcao e preencher o dado REAL pelo painel e
-- reaplicar — nunca semear um valor de fachada, que num sistema de saude seria
-- um numero de conselho inventado.

-- FK do revogador da permissao (create_permission_grants §1).
ALTER TABLE public.professional_permissions
  VALIDATE CONSTRAINT fk_professional_permissions_revoked_by;

-- BACKFILL DE HOMOLOGACAO, acrescentado em 11/09/2026 depois de este VALIDATE
-- RECUSAR contra o banco real — exatamente o desfecho que o cabecalho previa.
--
-- Quem bloqueava: o profissional de PSICOLOGIA de homologacao (criado em
-- 04/09/2026), com 1 compromisso agendado e 1 conversa com 2 mensagens. NAO era
-- cadastro descartavel: e o dado sobre o qual se prova que a conversa restrita
-- da psicologia fica invisivel ao administrador. Apagar a linha derrubaria em
-- cascata a evidencia do sigilo, que e invariante do projeto — por isso a saida
-- foi preencher, nao remover.
--
-- O VALOR E DELIBERADAMENTE ILEGIVEL COMO REGISTRO AUTENTICO. A regra desta leva
-- e "nunca semear um numero de conselho inventado", e um 'CRP 12/34567'
-- plausivel violaria o espirito dela: passaria por real numa tela, num relatorio
-- ou numa auditoria. 'CRP-HOMOLOGACAO-NAO-VALIDO' nao passa por nenhum — quem o
-- ler sabe na hora o que e.
--
-- ESCOPO PELO PREDICADO, NAO PELO ID: descreve a condicao que bloqueia o
-- VALIDATE. Fixar o uuid faria isto virar no-op silencioso em qualquer outro
-- ambiente e deixaria a proxima linha violadora passar batida.
--
-- CONDICIONADO A HOMOLOGACAO pelo guard de VOLUME abaixo: em producao isto nao
-- roda, e la um profissional ativo sem registro tem de ser tratado pela clinica
-- com o dado real — o VALIDATE deve mesmo recusar.
DO $$
DECLARE v_preenchidos integer;
BEGIN
  -- GUARD POR VOLUME, e a primeira tentativa errou o sinal: "existe paciente com
  -- conta ativa" abortou contra a homologacao real em 11/09/2026, porque ela TEM
  -- paciente de teste com conta — 1 paciente, 4 contas, 1 registro de diario, 4
  -- mensagens. Presenca de dado nao distingue os ambientes; ESCALA distingue.
  --
  -- O limiar de 20 pacientes e folgado para qualquer base de teste e baixo para
  -- uma clinica em operacao (a CEON atende centenas). Erra para o lado seguro:
  -- se a homologacao crescer alem disso, o backfill para de rodar e alguem
  -- precisa decidir a mao — que e o comportamento desejado.
  IF (SELECT count(*) FROM public.patients) > 20 THEN
    RAISE EXCEPTION
      'Backfill de homologacao abortado: % pacientes cadastrados indicam ambiente de USO REAL. Preencha o registro de conselho verdadeiro pelo painel.',
      (SELECT count(*) FROM public.patients);
  END IF;

  UPDATE public.professionals
     SET council_registration = 'CRP-HOMOLOGACAO-NAO-VALIDO'
   WHERE is_active
     AND (council_registration IS NULL OR length(btrim(council_registration)) = 0);

  GET DIAGNOSTICS v_preenchidos = ROW_COUNT;

  IF v_preenchidos > 0 THEN
    RAISE WARNING
      'Backfill de homologacao: % profissional(is) receberam marcador de registro NAO VALIDO. Substituir pelo registro real antes de qualquer uso produtivo.',
      v_preenchidos;
  END IF;
END;
$$;

-- Registro de conselho obrigatorio (require_council_registration).
ALTER TABLE public.professionals
  VALIDATE CONSTRAINT ck_professionals_council_registration;

-- Com a CHECK (col IS NOT NULL) JA VALIDADA, o SET NOT NULL nao varre a tabela:
-- o planner usa a constraint como prova. E o unico caminho barato de chegar a
-- NOT NULL de verdade — e NOT NULL de verdade e o que o PostgREST publica no
-- schema, o que faz o painel administrativo exigir o campo no formulario em vez
-- de descobrir a regra no erro do INSERT.
ALTER TABLE public.professionals
  ALTER COLUMN council_registration SET NOT NULL;

-- Categoria de conteudo tem dona (align_content_categories §2).
ALTER TABLE public.content_categories
  VALIDATE CONSTRAINT ck_content_categories_specialty;

ALTER TABLE public.content_categories
  ALTER COLUMN specialty_id SET NOT NULL;
