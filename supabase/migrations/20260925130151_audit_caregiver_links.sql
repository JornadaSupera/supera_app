-- Fase 3.3 das pendencias consolidadas (app #4): o vinculo de acompanhante
-- passa a deixar linha na trilha.
--
-- `caregivers` e auditada desde audit_access_grants (11/09/2026), e o motivo
-- escrito la — "da acesso delegado a prontuario de terceiro" — vale mais ainda
-- para o VINCULO: o perfil de cuidador sozinho nao abre ficha nenhuma; quem
-- abre e a linha ativa em `patient_caregivers`. A trilha registrava o
-- documento de identidade e deixava de fora a chave da porta.
--
-- Com `patient_id` como argumento, a linha entra na consulta "quem tocou no
-- dado deste titular?" — conceder e revogar acompanhante e exatamente isso.
-- Quem revogou aparece como ator, em que qualidade (titular, ou 'system'
-- quando foi a execucao de um pedido de exclusao), e quando.
--
-- Pre-requisito da Fase 4, que reescreve a criacao do acompanhante: o fluxo
-- novo ja nasce auditado, em vez de a trilha ser lembrada depois.

CREATE TRIGGER trg_audit_write
  AFTER INSERT OR UPDATE OR DELETE ON public.patient_caregivers
  FOR EACH ROW
  EXECUTE FUNCTION private.audit_write('patient_id');
