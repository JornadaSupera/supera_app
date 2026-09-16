-- A lista clinica de fases encolhe para duas.
-- Fonte: resposta da CEON em 31/08/2026 — #1 em Requisitos/Questoes em aberto.md
-- Decisao ja tomada: ADR-006 §3 (fase e TABELA de dominio, nao enum)
--
-- As quatro fases semeadas em create_treatment_plans vieram do Anexo; duas
-- delas ("Em remissao" e "Em finalizacao") nunca apareceram em tela nenhuma. A
-- clinica respondeu que as fases sao *Tratamento ativo* e *Seguimento*, e
-- acrescentou o recorte que explica o porque: SO PACIENTE EM TRATAMENTO ATIVO
-- USA O APP.
--
-- E DML, nao DDL — que e exatamente o retorno da ADR-006 §3 por ter recusado
-- `enum` para um vocabulario que a #1 nao tinha fechado. Com enum, encolher
-- custaria tipo novo, USING e recriacao de indice; aqui custa dois UPDATEs.
--
-- DESATIVAR, NAO APAGAR: vocabulario se aposenta, nao se apaga. A FK de
-- patients.treatment_phase_id e RESTRICT e a fase pode ja estar em uso — e o
-- historico precisa continuar interpretavel depois.
--
-- A OUTRA METADE DA #1 ja estava comprada: os marcos do NPS sao EIXO SEPARADO,
-- e e para isso que treatment_phases.axis existe. Os marcos entram como
-- axis = 'nps' na migration do NPS, sem mudanca estrutural.

UPDATE public.treatment_phases
   SET is_active = false
 WHERE axis = 'clinical'
   AND code IN ('remissao', 'finalizacao');
