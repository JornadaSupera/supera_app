-- Fase 3.5 das pendencias consolidadas (painel A-1): a trilha ganha o verbo
-- EXPORTAR.
--
-- SOZINHA NESTA MIGRATION, e nao por capricho: o Postgres aceita
-- `ALTER TYPE ... ADD VALUE` dentro de transacao, mas recusa USAR o valor novo
-- antes do COMMIT ("unsafe use of new value"). A constraint e as funcoes que
-- gravam 'export' vivem em record_data_exports, que roda na transacao seguinte.
--
-- POR QUE UM VERBO NOVO, e nao 'read' com outro nome de tabela: leitura e
-- exportacao respondem a perguntas diferentes numa investigacao de vazamento.
-- Quem LEU viu na tela; quem EXPORTOU levou uma copia para fora do banco, e e
-- essa copia que aparece depois num lugar onde nao deveria estar. Misturar os
-- dois no mesmo verbo obrigaria a trilha a ser filtrada por convencao de nome.

-- AFTER 'read' e explicito: exportar e uma leitura que sai do banco, e a
-- ordem do enum e a que um ORDER BY action mostraria no painel de auditoria.
ALTER TYPE public.audit_action ADD VALUE IF NOT EXISTS 'export' AFTER 'read';
