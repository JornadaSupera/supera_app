-- Relatorio agendado: o painel cadastra "o relatorio X, toda segunda as 8h,
-- para fulano", e o banco avisa na hora certa, com o periodo ja fechado.
-- Design e racional: supera-docs/ADRs/ADR-028 — Leituras e resumos do painel.md
-- Item 6.9 da lista consolidada (painel R-4).
--
-- O AVISO LEVA A REFERENCIA, NUNCA O ARQUIVO. Foi a recomendacao do proprio
-- painel, e e a unica compativel com o resto do projeto: um relatorio anexado
-- ao e-mail e dado de saude (contagens por protocolo, por especialidade) parado
-- numa caixa de correio fora do controle da clinica, sem trilha de quem abriu.
-- Aqui o banco grava QUAL relatorio e QUAL periodo (`report_runs`) e notifica o
-- destinatario; o painel abre o relatorio com o login dele, e a leitura paga o
-- pedagio de sempre (as `summarize_*` registram o acesso).
--
-- O E-MAIL AINDA NAO SAI, e isto e dependencia, nao desenho. O aviso entra pela
-- fila de notificacoes (private.notify), que ja planeja os tres canais. Push e
-- caixa do painel funcionam desde ja; a entrega `email` fica `skipped` pelo
-- send-push ate existir um provedor de e-mail transacional contratado — e,
-- entao, uma Edge Function que consuma o canal. Nenhuma migration nova sera
-- necessaria para isso.
--
-- O CODIGO DO RELATORIO E DO PAINEL. Os relatorios sao montados la, a partir das
-- `summarize_*`; o banco nao tem catalogo deles e nao ganha um aqui — seria uma
-- segunda lista para manter em sincronia com a tela. `report_code` tem forma
-- (minusculas e sublinhado), nao vocabulario, como `operational_parameters`.
--
-- SO ADMINISTRADOR, NOS DOIS LADOS. Relatorios sao do painel administrativo;
-- quem agenda e quem recebe precisam ser administradores ativos. O destinatario
-- e reconferido a cada disparo: quem perdeu o perfil deixa de receber sem que
-- ninguem precise lembrar de desligar o agendamento.


-- ============================================================
-- 1. report_schedules — o que mandar, quando e para quem
-- ============================================================
--
-- `frequency` em CHECK (ADR-002: dominio local, pequeno, sem dado de paciente).
-- O dia da semana so existe no semanal e o dia do mes so no mensal; o CHECK
-- par a par impede a linha ambigua "mensal no dia da semana 3".
--
-- `month_day` vai ate 28: todo mes tem dia 28, e "todo dia 31" pularia
-- fevereiro, abril, junho, setembro e novembro sem avisar ninguem.
--
-- `next_run_at` e MATERIALIZADO, e nao calculado na consulta da rotina: e o que
-- deixa a rotina ler um indice parcial em vez de recalcular o calendario de
-- todos os agendamentos a cada cinco minutos.
CREATE TABLE public.report_schedules (
  id                   uuid PRIMARY KEY DEFAULT public.uuid_generate_v7(),
  report_code          text NOT NULL CHECK (report_code ~ '^[a-z][a-z0-9_]{1,62}$'),
  frequency            text NOT NULL CHECK (frequency IN ('daily', 'weekly', 'monthly')),
  -- ISO: 1 = segunda, 7 = domingo.
  weekday              smallint CHECK (weekday BETWEEN 1 AND 7),
  month_day            smallint CHECK (month_day BETWEEN 1 AND 28),
  -- Hora LOCAL, no fuso da clinica (clinic_settings.time_zone).
  send_at              time NOT NULL,
  recipient_account_id uuid NOT NULL REFERENCES public.accounts (id) ON DELETE RESTRICT,
  is_active            boolean NOT NULL DEFAULT true,
  next_run_at          timestamptz NOT NULL,
  last_run_at          timestamptz,
  created_by           uuid NOT NULL REFERENCES public.accounts (id) ON DELETE RESTRICT,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_report_schedules_weekday   CHECK ((frequency = 'weekly')  = (weekday   IS NOT NULL)),
  CONSTRAINT ck_report_schedules_month_day CHECK ((frequency = 'monthly') = (month_day IS NOT NULL))
);

COMMENT ON TABLE public.report_schedules IS
  'Relatorios agendados pelo painel administrativo. O banco nao gera o relatorio: grava o periodo em report_runs e avisa o destinatario, que abre o relatorio no painel. Aposenta-se com is_active = false; nao se apaga.';
COMMENT ON COLUMN public.report_schedules.report_code IS
  'Codigo do relatorio, definido pelo painel. O banco confere a forma, nao a existencia.';
COMMENT ON COLUMN public.report_schedules.send_at IS
  'Hora local no fuso da clinica. Mudar o fuso em clinic_settings nao recalcula next_run_at dos agendamentos existentes ate o proximo disparo.';

CREATE TRIGGER trg_set_updated_at
BEFORE UPDATE ON public.report_schedules
FOR EACH ROW
WHEN (OLD.* IS DISTINCT FROM NEW.*)
EXECUTE FUNCTION public.set_updated_at();

-- Trilha de escrita: quem agendou o que, e quem desligou. `-` porque nao ha
-- paciente na linha.
CREATE TRIGGER trg_audit_write
AFTER INSERT OR UPDATE OR DELETE ON public.report_schedules
FOR EACH ROW EXECUTE FUNCTION private.audit_write('-');

-- A fila da rotina.
CREATE INDEX idx_report_schedules_due
  ON public.report_schedules (next_run_at)
  WHERE is_active;

CREATE INDEX idx_report_schedules_recipient ON public.report_schedules (recipient_account_id);
CREATE INDEX idx_report_schedules_created_by ON public.report_schedules (created_by);


-- ============================================================
-- 2. report_runs — cada periodo fechado, uma linha
-- ============================================================
--
-- E o ALVO da notificacao (target_table = 'report_runs'). Sem esta tabela, o
-- periodo teria de viajar dentro da `dedup_key` e o painel teria de desmontar
-- texto para descobrir de que semana e o aviso.
--
-- UNIQUE (schedule_id, period_start) e a idempotencia: a rotina que rodar duas
-- vezes sobre o mesmo disparo nao cria dois avisos.
CREATE TABLE public.report_runs (
  id           uuid PRIMARY KEY DEFAULT public.uuid_generate_v7(),
  schedule_id  uuid NOT NULL REFERENCES public.report_schedules (id) ON DELETE RESTRICT,
  report_code  text NOT NULL,
  period_start date NOT NULL,
  period_end   date NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_report_runs_period UNIQUE (schedule_id, period_start),
  CONSTRAINT ck_report_runs_period CHECK (period_end >= period_start)
);

COMMENT ON TABLE public.report_runs IS
  'Um periodo fechado de um relatorio agendado. report_code e copiado do agendamento no disparo: se o painel trocar o codigo depois, o aviso antigo continua dizendo o que foi enviado.';


-- ============================================================
-- 3. O calendario
-- ============================================================
--
-- Proximo disparo estritamente depois de `p_after`, na hora local do fuso da
-- clinica. Varre dia a dia (no maximo 62 dias: o mensal mais distante e o do
-- dia 28 visto do dia 29 de um mes de 31). SEM generate_series sobre date, que
-- escolhe a versao timestamptz e erra o fuso em silencio (Fase 5).
--
-- `date + time` da `timestamp` sem fuso, e `timestamp AT TIME ZONE tz` o
-- interpreta como hora local daquele fuso. E o sentido certo; o inverso e o
-- erro de seis horas que a Fase 5 ja pagou.
CREATE FUNCTION private.next_report_run(
  p_frequency text,
  p_weekday   smallint,
  p_month_day smallint,
  p_send_at   time,
  p_after     timestamptz
)
RETURNS timestamptz
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_tz    text;
  v_local timestamp;
  v_day   date;
BEGIN
  SELECT s.time_zone INTO v_tz FROM public.clinic_settings s WHERE s.id = 1;
  v_local := p_after AT TIME ZONE v_tz;
  v_day   := v_local::date;

  FOR i IN 0..62 LOOP
    IF (p_frequency = 'daily'
        OR (p_frequency = 'weekly'  AND pg_catalog.date_part('isodow', v_day) = p_weekday)
        OR (p_frequency = 'monthly' AND pg_catalog.date_part('day',    v_day) = p_month_day))
       AND (v_day + p_send_at) > v_local
    THEN
      RETURN (v_day + p_send_at) AT TIME ZONE v_tz;
    END IF;
    v_day := v_day + 1;
  END LOOP;

  RAISE EXCEPTION 'calendario sem proximo disparo: %', p_frequency;
END;
$$;

COMMENT ON FUNCTION private.next_report_run(text, smallint, smallint, time, timestamptz) IS
  'Proximo instante de disparo depois de p_after, na hora local do fuso da clinica.';

-- O periodo que um disparo fecha, a partir do DIA LOCAL do disparo. Sempre
-- dias completos e ja encerrados — o relatorio das 8h de segunda nao fala da
-- segunda, que mal comecou:
--   daily    ontem
--   weekly   os sete dias que terminam ontem
--   monthly  o mes calendario anterior inteiro
CREATE FUNCTION private.report_period(p_frequency text, p_run_day date)
RETURNS TABLE (period_start date, period_end date)
LANGUAGE sql
IMMUTABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT CASE p_frequency
           WHEN 'daily'   THEN p_run_day - 1
           WHEN 'weekly'  THEN p_run_day - 7
           ELSE (pg_catalog.date_trunc('month', p_run_day::timestamp) - interval '1 month')::date
         END,
         CASE p_frequency
           WHEN 'monthly' THEN pg_catalog.date_trunc('month', p_run_day::timestamp)::date - 1
           ELSE p_run_day - 1
         END;
$$;


-- ============================================================
-- 4. A rotina (pg_cron, a cada 5 minutos)
-- ============================================================
--
-- Um disparo atrasado (banco fora do ar, cron parado) gera UM aviso, o do
-- periodo do disparo previsto, e o proximo e calculado a partir de AGORA: tres
-- dias parado nao viram tres avisos seguidos, que e o que ninguem leria.
--
-- Destinatario que deixou de ser administrador ativo: o disparo passa sem
-- aviso e o calendario avanca. O agendamento continua ativo e visivel no
-- painel — desliga-lo seria decidir pela administracao.
--
-- FOR UPDATE SKIP LOCKED: duas execucoes sobrepostas nao pegam o mesmo
-- agendamento. O UNIQUE de report_runs seria a segunda barreira.
CREATE FUNCTION private.run_due_report_schedules()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_tz     text;
  v_s      record;
  v_period record;
  v_run_id uuid;
  v_count  integer := 0;
BEGIN
  SELECT s.time_zone INTO v_tz FROM public.clinic_settings s WHERE s.id = 1;

  FOR v_s IN
    SELECT *
      FROM public.report_schedules rs
     WHERE rs.is_active
       AND rs.next_run_at <= pg_catalog.now()
     ORDER BY rs.next_run_at
     FOR UPDATE SKIP LOCKED
  LOOP
    SELECT * INTO v_period
      FROM private.report_period(v_s.frequency, (v_s.next_run_at AT TIME ZONE v_tz)::date);

    v_run_id := NULL;

    IF EXISTS (SELECT 1
                 FROM public.admins ad
                 JOIN public.accounts a ON a.id = ad.account_id
                WHERE ad.account_id = v_s.recipient_account_id
                  AND a.is_active) THEN
      INSERT INTO public.report_runs (schedule_id, report_code, period_start, period_end)
      VALUES (v_s.id, v_s.report_code, v_period.period_start, v_period.period_end)
      ON CONFLICT ON CONSTRAINT uq_report_runs_period DO NOTHING
      RETURNING id INTO v_run_id;

      IF v_run_id IS NOT NULL THEN
        PERFORM private.notify(v_s.recipient_account_id, 'report_ready',
                               'report_run:' || v_run_id::text,
                               'report_runs', v_run_id, NULL);
        v_count := v_count + 1;
      END IF;
    END IF;

    UPDATE public.report_schedules
       SET last_run_at = pg_catalog.now(),
           next_run_at = private.next_report_run(v_s.frequency, v_s.weekday, v_s.month_day,
                                                 v_s.send_at,
                                                 GREATEST(v_s.next_run_at, pg_catalog.now()))
     WHERE id = v_s.id;
  END LOOP;

  RETURN v_count;
END;
$$;

COMMENT ON FUNCTION private.run_due_report_schedules() IS
  'Rotina do pg_cron: fecha o periodo de cada agendamento vencido, grava report_runs e avisa o destinatario pela fila de notificacoes. Devolve quantos avisos criou.';

SELECT cron.schedule(
  'report-schedules',
  '*/5 * * * *',
  $$SELECT private.run_due_report_schedules()$$
);


-- ============================================================
-- 5. O tipo de notificacao
-- ============================================================
--
-- Silenciavel: aviso de relatorio nao e dever clinico, e o administrador pode
-- preferir so a caixa do painel. Publico `team`: nunca aparece no app.
INSERT INTO public.notification_types (code, label, category, is_silenceable, sort_order, audience) VALUES
  ('report_ready', 'Relatório agendado disponível', 'report', true, 10, 'team')
ON CONFLICT (code) DO NOTHING;


-- ============================================================
-- 6. RLS
-- ============================================================

ALTER TABLE public.report_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.report_runs      ENABLE ROW LEVEL SECURITY;

-- Toda a administracao ve todos os agendamentos: a tela e compartilhada, e um
-- administrador precisa ver o que o colega agendou para nao duplicar.
CREATE POLICY report_schedules_select_admin ON public.report_schedules
  FOR SELECT TO authenticated
  USING ( (SELECT private.is_active_admin()) );

CREATE POLICY report_runs_select_admin ON public.report_runs
  FOR SELECT TO authenticated
  USING ( (SELECT private.is_active_admin()) );


-- ============================================================
-- 7. RPCs
-- ============================================================

-- A guarda comum de forma: o CHECK da tabela diria o mesmo, mas com o nome da
-- constraint na mensagem, que a tela nao sabe traduzir.
CREATE FUNCTION private.assert_report_schedule_input(
  p_report_code          text,
  p_frequency            text,
  p_weekday              smallint,
  p_month_day            smallint,
  p_send_at              time,
  p_recipient_account_id uuid
)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT private.is_active_admin() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF p_report_code IS NULL OR p_report_code !~ '^[a-z][a-z0-9_]{1,62}$' THEN
    RAISE EXCEPTION 'invalid_report_code' USING ERRCODE = '22023';
  END IF;

  IF p_frequency IS NULL OR p_frequency NOT IN ('daily', 'weekly', 'monthly')
     OR p_send_at IS NULL
     OR (p_frequency = 'weekly')  <> (p_weekday   IS NOT NULL)
     OR (p_frequency = 'monthly') <> (p_month_day IS NOT NULL)
     OR p_weekday   NOT BETWEEN 1 AND 7
     OR p_month_day NOT BETWEEN 1 AND 28 THEN
    RAISE EXCEPTION 'invalid_schedule' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (SELECT 1
                   FROM public.admins ad
                   JOIN public.accounts a ON a.id = ad.account_id
                  WHERE ad.account_id = p_recipient_account_id
                    AND a.is_active) THEN
    RAISE EXCEPTION 'recipient_not_admin' USING ERRCODE = '22023';
  END IF;
END;
$$;

-- Destinatario padrao: quem agenda. E o caso comum ("me mande toda segunda").
CREATE FUNCTION public.create_report_schedule(
  p_report_code          text,
  p_frequency            text,
  p_send_at              time,
  p_weekday              smallint DEFAULT NULL,
  p_month_day            smallint DEFAULT NULL,
  p_recipient_account_id uuid     DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_recipient uuid := COALESCE(p_recipient_account_id, auth.uid());
  v_id        uuid;
BEGIN
  PERFORM private.assert_report_schedule_input(
    p_report_code, p_frequency, p_weekday, p_month_day, p_send_at, v_recipient);

  INSERT INTO public.report_schedules
    (report_code, frequency, weekday, month_day, send_at, recipient_account_id,
     next_run_at, created_by)
  VALUES
    (p_report_code, p_frequency, p_weekday, p_month_day, p_send_at, v_recipient,
     private.next_report_run(p_frequency, p_weekday, p_month_day, p_send_at, pg_catalog.now()),
     auth.uid())
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- Salva o agendamento inteiro (o formulario da tela), e recalcula o proximo
-- disparo a partir de agora. Nao reativa: ligar e desligar e outra RPC, para a
-- trilha distinguir "mudou o horario" de "voltou a mandar".
CREATE FUNCTION public.update_report_schedule(
  p_schedule_id          uuid,
  p_report_code          text,
  p_frequency            text,
  p_send_at              time,
  p_weekday              smallint,
  p_month_day            smallint,
  p_recipient_account_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_updated bigint;
BEGIN
  PERFORM private.assert_report_schedule_input(
    p_report_code, p_frequency, p_weekday, p_month_day, p_send_at, p_recipient_account_id);

  UPDATE public.report_schedules
     SET report_code          = p_report_code,
         frequency            = p_frequency,
         weekday              = p_weekday,
         month_day            = p_month_day,
         send_at              = p_send_at,
         recipient_account_id = p_recipient_account_id,
         next_run_at          = private.next_report_run(p_frequency, p_weekday, p_month_day,
                                                        p_send_at, pg_catalog.now())
   WHERE id = p_schedule_id;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated = 0 THEN
    RAISE EXCEPTION 'report_schedule_not_found' USING ERRCODE = 'P0002';
  END IF;
END;
$$;

-- Desligar aposenta; religar recalcula o proximo disparo a partir de agora,
-- para nao disparar na hora um periodo que venceu enquanto estava desligado.
CREATE FUNCTION public.set_report_schedule_active(p_schedule_id uuid, p_is_active boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_updated bigint;
BEGIN
  IF NOT private.is_active_admin() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_is_active IS NULL THEN
    RAISE EXCEPTION 'invalid_schedule' USING ERRCODE = '22023';
  END IF;

  UPDATE public.report_schedules rs
     SET is_active   = p_is_active,
         next_run_at = CASE WHEN p_is_active AND NOT rs.is_active
                            THEN private.next_report_run(rs.frequency, rs.weekday, rs.month_day,
                                                         rs.send_at, pg_catalog.now())
                            ELSE rs.next_run_at END
   WHERE rs.id = p_schedule_id;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated = 0 THEN
    RAISE EXCEPTION 'report_schedule_not_found' USING ERRCODE = 'P0002';
  END IF;
END;
$$;

COMMENT ON FUNCTION public.create_report_schedule(text, text, time, smallint, smallint, uuid) IS
  'Agenda um relatorio. weekday (1-7, ISO) so no semanal; month_day (1-28) so no mensal. Destinatario padrao: quem agenda; precisa ser administrador ativo.';
COMMENT ON FUNCTION public.update_report_schedule(uuid, text, text, time, smallint, smallint, uuid) IS
  'Salva o agendamento inteiro e recalcula o proximo disparo a partir de agora. Nao liga nem desliga.';
COMMENT ON FUNCTION public.set_report_schedule_active(uuid, boolean) IS
  'Liga ou desliga (aposenta) um agendamento. Nao ha DELETE.';


-- ============================================================
-- 8. Privilegios — SEMPRE no fim
-- ============================================================

-- Escrita so por RPC; a rotina escreve como dona (SECURITY DEFINER). DELETE
-- sai de todos, service_role incluido: agendamento se aposenta, e o periodo
-- ja avisado e historico do aviso que esta na caixa de alguem.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.report_schedules FROM PUBLIC, anon, authenticated, service_role;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.report_runs      FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON public.report_schedules FROM anon;
REVOKE ALL ON public.report_runs      FROM anon;

REVOKE EXECUTE ON FUNCTION private.next_report_run(text, smallint, smallint, time, timestamptz)                        FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION private.report_period(text, date)                                                           FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION private.run_due_report_schedules()                                                          FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION private.assert_report_schedule_input(text, text, smallint, smallint, time, uuid)            FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.create_report_schedule(text, text, time, smallint, smallint, uuid)                   FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.update_report_schedule(uuid, text, text, time, smallint, smallint, uuid)             FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.set_report_schedule_active(uuid, boolean)                                            FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.create_report_schedule(text, text, time, smallint, smallint, uuid)                    TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_report_schedule(uuid, text, text, time, smallint, smallint, uuid)              TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_report_schedule_active(uuid, boolean)                                             TO authenticated;

DO $$
DECLARE
  v_rpcs text[] := ARRAY[
    'public.create_report_schedule(text, text, time, smallint, smallint, uuid)',
    'public.update_report_schedule(uuid, text, text, time, smallint, smallint, uuid)',
    'public.set_report_schedule_active(uuid, boolean)'
  ];
  v_ruim text;
BEGIN
  SELECT pg_catalog.string_agg(sig, ', ') INTO v_ruim
    FROM pg_catalog.unnest(v_rpcs) AS sig
   WHERE NOT pg_catalog.has_function_privilege('authenticated', sig, 'EXECUTE')
      OR pg_catalog.has_function_privilege('anon', sig, 'EXECUTE');
  IF v_ruim IS NOT NULL THEN
    RAISE EXCEPTION 'privilegio errado (authenticated sem EXECUTE ou anon com) em: %', v_ruim;
  END IF;

  IF pg_catalog.has_function_privilege('authenticated', 'private.run_due_report_schedules()', 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated executa a rotina de relatorios: qualquer um anteciparia os avisos';
  END IF;

  SELECT pg_catalog.string_agg(t || ':' || p, ', ') INTO v_ruim
    FROM pg_catalog.unnest(ARRAY['public.report_schedules', 'public.report_runs']) AS t
   CROSS JOIN pg_catalog.unnest(ARRAY['INSERT', 'UPDATE', 'DELETE']) AS p
   WHERE pg_catalog.has_table_privilege('authenticated', t, p)
      OR pg_catalog.has_table_privilege('service_role', t, p);
  IF v_ruim IS NOT NULL THEN
    RAISE EXCEPTION 'escrita direta ainda concedida: %', v_ruim;
  END IF;

  IF pg_catalog.has_table_privilege('anon', 'public.report_schedules', 'SELECT')
  OR pg_catalog.has_table_privilege('anon', 'public.report_runs', 'SELECT') THEN
    RAISE EXCEPTION 'anon le agendamento de relatorio';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'report-schedules') THEN
    RAISE EXCEPTION 'o job report-schedules nao foi agendado';
  END IF;
END;
$$;
