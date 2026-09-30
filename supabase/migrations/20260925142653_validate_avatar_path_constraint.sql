-- VALIDATE da constraint que create_branding_and_avatar_storage criou NOT VALID.
--
-- Migration separada pelo motivo de sempre: o ADD segura ACCESS EXCLUSIVE em
-- `accounts` ate o COMMIT, e o VALIDATE so vale a pena fora dessa transacao.
-- A coluna nasceu nula em toda linha, entao o VALIDATE nao pode falhar.

ALTER TABLE public.accounts VALIDATE CONSTRAINT ck_accounts_avatar_path_own_folder;
