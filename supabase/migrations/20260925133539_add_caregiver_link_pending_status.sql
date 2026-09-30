-- Fase 4 das pendencias consolidadas — o vinculo ganha o estado `pending`.
-- Decisoes: ADR-026 §2.
--
-- Arquivo proprio porque valor novo de enum nao pode ser usado na mesma
-- transacao que o criou (55P04). A migration seguinte, create_caregiver_accounts,
-- ja escreve e indexa `pending`. Mesmo motivo de add_audit_export_action.
--
-- `pending` e o vinculo criado pelo paciente cuja senha provisoria ainda nao foi
-- trocada pelo acompanhante. O acesso delegado so existe em `active`, e todo
-- predicado do sistema ja filtra `status = 'active'`: o estado novo nasce
-- negado em toda parte sem que nenhuma politica seja reescrita.

ALTER TYPE public.caregiver_link_status ADD VALUE IF NOT EXISTS 'pending' BEFORE 'active';
