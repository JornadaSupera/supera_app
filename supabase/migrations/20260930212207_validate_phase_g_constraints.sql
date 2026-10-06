-- VALIDATE das quatro constraints que allow_admin_content_authoring criou
-- NOT VALID: as duas FKs para admins e os dois CHECKs de autoria unica.
-- Plano das pendencias do painel de 30/09/2026, Fase G.
--
-- Toda linha existente tem autoria de profissional (a coluna era NOT NULL) e
-- nenhuma de administrador (a coluna nasceu nula), entao num_nonnulls = 1 vale
-- para todas e as FKs nao tem o que conferir. O VALIDATE fica em migration
-- propria pelo padrao do projeto: SHARE UPDATE EXCLUSIVE, sem bloquear
-- escrita, numa transacao que nao carrega o resto da fase.

ALTER TABLE public.content_items    VALIDATE CONSTRAINT content_items_author_admin_id_fkey;
ALTER TABLE public.content_items    VALIDATE CONSTRAINT ck_content_items_single_author;
ALTER TABLE public.content_versions VALIDATE CONSTRAINT content_versions_created_by_admin_id_fkey;
ALTER TABLE public.content_versions VALIDATE CONSTRAINT ck_content_versions_single_author;
