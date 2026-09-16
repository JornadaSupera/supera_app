-- O registro de conselho passa a ser obrigatorio.
-- Fonte: resposta da CEON em 31/08/2026 — #14 em Requisitos/Questoes em aberto.md
--
-- `professionals.council_registration` nasceu nullable e sem validacao de
-- formato porque nenhuma fonte detalhava o registro (create_identity_core). A
-- clinica respondeu: e OBRIGATORIO.
--
-- A RESPOSTA DIZ "OBRIGATORIO", NAO "VALIDADO", e a diferenca e deliberada:
-- CRM, CRF, COREN, CRN, CRP, CRO e CREFITO tem formatos distintos por conselho
-- e por UF, e inventar a expressao regular rejeitaria cadastro LEGITIMO — que
-- e o defeito caro. A obrigatoriedade entra; o formato continua fora.
--
-- CHECK NOT VALID agora, VALIDATE em migration separada: na mesma transacao o
-- VALIDATE bloquearia leitura, anulando o motivo de ter separado. Padrao
-- estabelecido em validate_treatment_phase_fk.
--
-- SE O VALIDATE FALHAR EM HOMOLOGACAO, a falha e a informacao: significa que
-- ha profissional cadastrado sem registro de conselho, e a saida e preencher o
-- dado real — nao semear um valor de fachada. Dado fabricado e pior que dado
-- ausente, e aqui seria um numero de conselho falso num sistema de saude.

ALTER TABLE public.professionals
  ADD CONSTRAINT ck_professionals_council_registration
  CHECK (council_registration IS NOT NULL AND length(btrim(council_registration)) > 0)
  NOT VALID;

COMMENT ON COLUMN public.professionals.council_registration IS
  'CRM/CRF/COREN/CRN/CRP/CRO/CREFITO. OBRIGATORIO desde 11/09/2026 (#14), por CHECK validado. Sem validacao de FORMATO: a resposta da clinica diz obrigatorio, nao validado, e uma regex por conselho rejeitaria cadastro legitimo.';
