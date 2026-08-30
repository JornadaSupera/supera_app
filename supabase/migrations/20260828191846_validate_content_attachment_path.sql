-- Valida a convencao de caminho de content_attachments, criada NOT VALID em
-- create_content_storage.
--
-- Migration separada pelo mesmo motivo de validate_treatment_phase_fk: na
-- mesma transacao do ALTER, o VALIDATE mantem o lock que bloqueia leitura —
-- e ai nao havia por que ter separado o NOT VALID.

ALTER TABLE public.content_attachments
  VALIDATE CONSTRAINT ck_content_attachments_path_prefix;
