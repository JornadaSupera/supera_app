-- O contador de tentativas da ligacao pelo celular. Pendencia 26.2, de
-- 28/09/2026 (Fase B do plano de 29/09/2026).
--
-- A ligacao da conta a ficha por CPF + nascimento + celular confirmado
-- (link_patient_by_verified_phone, na migration seguinte) troca o token de 64
-- caracteres por dados que um parente conhece. O que segura a tentativa e
-- erro e o limite: 5 erros por hora, por conta.
--
-- A DECISAO B-1 (29/09/2026): a RPC DEVOLVE o erro em jsonb, em vez de
-- levantar excecao. Uma excecao desfaria a gravacao da tentativa na mesma
-- transacao, e o contador ficaria sempre em zero. Por isso esta tabela e
-- escrita pela propria RPC, na transacao que retorna normalmente.
--
-- O QUE A LINHA GUARDA: conta e instante. Nem CPF, nem data, nem telefone —
-- o contador precisa saber QUANTAS vezes, nunca O QUE se tentou. Guardar o
-- CPF tentado seria montar, dentro do banco, a lista de CPFs que alguem
-- procurou.
--
-- VIDA CURTA: a janela e de uma hora, e a linha nao serve para mais nada
-- depois disso. Uma rotina diaria apaga o que passou de um dia (a margem e
-- para investigar um ataque em andamento, nao para guardar historico). A
-- trilha de quem LIGOU e a de `patients` (trg_audit_write), nao esta.
--
-- CASCADE para a conta, e nao RESTRICT (desvio do plano): nenhuma rotina
-- apaga conta hoje (a exclusao encerra o acesso, ADR-005 com a emenda de
-- 31/08/2026), mas se um dia apagar, um carimbo tecnico de vida curta nao pode
-- ser o que a impede — mesmo racional de chat_off_hours_replies.


-- ============================================================
-- 1. A tabela
-- ============================================================
--
-- `private`, e nao `public`: so a RPC le e escreve. bigint identity (ADR-001):
-- interna, sem FK que aponte para ela, nenhum front-end a enumera.

CREATE TABLE private.patient_link_attempts (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  account_id   uuid NOT NULL REFERENCES public.accounts (id) ON DELETE CASCADE,
  attempted_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE private.patient_link_attempts IS
  'Uma linha por tentativa FRACASSADA de ligar conta a ficha pelo celular confirmado. So conta e instante — nunca o CPF, a data ou o telefone tentados. Janela de 1 h; apagada depois de 1 dia.';

-- A consulta e sempre "desta conta, na ultima hora". O indice tambem cobre a FK.
CREATE INDEX idx_patient_link_attempts_account_time
  ON private.patient_link_attempts (account_id, attempted_at DESC);

-- Para a limpeza diaria, que filtra so por instante.
CREATE INDEX idx_patient_link_attempts_time
  ON private.patient_link_attempts (attempted_at);

-- RLS ligada e nenhuma politica: nega tudo a quem nao e dono. Nao ha caminho
-- da API ate `private`, mas a segunda porta fechada nao custa nada.
ALTER TABLE private.patient_link_attempts ENABLE ROW LEVEL SECURITY;


-- ============================================================
-- 2. A limpeza
-- ============================================================
--
-- cron.schedule com NOME e upsert: reaplicar reescreve o job. `WHERE` sempre
-- presente — o safeupdate nao alcanca o cron, mas o habito do projeto e este.

SELECT cron.schedule(
  'purge-patient-link-attempts',
  '23 3 * * *',
  $$DELETE FROM private.patient_link_attempts WHERE attempted_at < pg_catalog.now() - interval '1 day'$$
);


-- ============================================================
-- 3. Privilegios — SEMPRE no fim
-- ============================================================

REVOKE ALL ON TABLE private.patient_link_attempts FROM PUBLIC, anon, authenticated, service_role;

DO $$
DECLARE
  v_role text;
BEGIN
  FOREACH v_role IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
    IF pg_catalog.has_table_privilege(v_role, 'private.patient_link_attempts',
                                      'SELECT, INSERT, UPDATE, DELETE') THEN
      RAISE EXCEPTION '% alcanca private.patient_link_attempts', v_role;
    END IF;
  END LOOP;

  -- O outro lado: o dono (que a RPC DEFINER usa) continua escrevendo.
  IF NOT pg_catalog.has_table_privilege('postgres', 'private.patient_link_attempts', 'SELECT, INSERT') THEN
    RAISE EXCEPTION 'postgres perdeu acesso a private.patient_link_attempts';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'purge-patient-link-attempts') THEN
    RAISE EXCEPTION 'rotina de limpeza das tentativas nao foi agendada';
  END IF;
END;
$$;
