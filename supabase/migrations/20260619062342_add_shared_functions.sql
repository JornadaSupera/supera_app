-- Helpers compartilhados. Padrão: SECURITY INVOKER, search_path='', tudo qualificado.

-- Trigger BEFORE UPDATE; parear com WHEN (OLD.* IS DISTINCT FROM NEW.*).
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = pg_catalog.now();
  RETURN NEW;
END;
$$;

-- UUIDv7 (time-ordered); PG 17 não tem uuidv7() nativo. Usar como DEFAULT de PK.
-- overlay/substr/date_part na forma POSICIONAL de propósito — schema-qualificar quebra
-- ("syntax error at or near PLACING"). Manter posicional mesmo com search_path=''.
CREATE OR REPLACE FUNCTION public.uuid_generate_v7()
RETURNS uuid
LANGUAGE sql
SECURITY INVOKER
VOLATILE
PARALLEL SAFE
SET search_path = ''
AS $$
  SELECT pg_catalog.encode(
    pg_catalog.set_bit(
      pg_catalog.set_bit(
        pg_catalog.overlay(
          pg_catalog.uuid_send(pg_catalog.gen_random_uuid()),
          pg_catalog.substr(
            pg_catalog.int8send(
              pg_catalog.floor(
                pg_catalog.date_part('epoch', pg_catalog.clock_timestamp()) * 1000
              )::bigint
            ),
            3, 6
          ),
          1, 6
        ),
        52, 1
      ),
      53, 1
    ),
    'hex'
  )::uuid;
$$;

-- auth.uid() para RLS; nas policies usar (select public.get_my_uid()).
CREATE OR REPLACE FUNCTION public.get_my_uid()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT auth.uid();
$$;

-- Least privilege: REVOKE no fim (só afeta funções já criadas). EXECUTE é exigido
-- por DEFAULT de coluna (uuid_generate_v7) e por RLS (get_my_uid); trigger dispensa.
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.uuid_generate_v7() TO authenticated, service_role;
GRANT  EXECUTE ON FUNCTION public.get_my_uid()       TO authenticated;
