-- Fase 4 das pendencias consolidadas — o telefone que recebe SMS e WhatsApp.
-- Decisoes: ADR-026 §4.
--
-- Um helper so, usado pelo acompanhante criado pelo paciente (4.1) e pelo
-- convite do paciente por SMS (4.3). Devolve E.164 (`+55DDNNNNNNNNN`) ou NULL.
-- NULL e a resposta para "nao da para mandar mensagem para isto", e quem chama
-- transforma NULL em `invalid_phone`.
--
-- SO CELULAR, e isso e decisao, nao limitacao: os dois usos sao SMS e WhatsApp,
-- e telefone fixo nao recebe nenhum dos dois. Aceitar o fixo aqui faria o erro
-- aparecer depois, no provedor, como `sms_failed` — uma senha provisoria ja
-- emitida para um numero que nunca a recebera.
--
-- O que aceita: qualquer pontuacao (`(49) 99999-1234`, `49 9 9999 1234`), o
-- prefixo do pais com ou sem `+` (`+55`, `55`), e o zero de discagem
-- interurbana (`049...`). O que recusa: DDD com zero (nao existe DDD 10, 20...),
-- numero sem o nono digito, qualquer coisa que nao sobre com 11 digitos.
--
-- O prefixo `55` so e retirado quando sobram 13 digitos. Com 11, `55` e o DDD
-- de Santa Maria/RS, e retira-lo destruiria um numero valido.

CREATE FUNCTION private.normalize_br_phone(p_phone text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
DECLARE
  v_digits text := pg_catalog.regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g');
BEGIN
  IF pg_catalog.length(v_digits) = 13 AND pg_catalog.left(v_digits, 2) = '55' THEN
    v_digits := pg_catalog.substr(v_digits, 3);
  ELSIF pg_catalog.length(v_digits) = 12 AND pg_catalog.left(v_digits, 1) = '0' THEN
    v_digits := pg_catalog.substr(v_digits, 2);
  END IF;

  -- DDD de 11 a 99 sem zero em nenhum digito, nono digito 9, mais oito.
  IF v_digits !~ '^[1-9][1-9]9[0-9]{8}$' THEN
    RETURN NULL;
  END IF;

  RETURN '+55' || v_digits;
END;
$$;

COMMENT ON FUNCTION private.normalize_br_phone(text) IS
  'Celular brasileiro em E.164 (+55DDNNNNNNNNN), ou NULL se nao for celular valido. Fixo devolve NULL de proposito: SMS e WhatsApp nao chegam nele (ADR-026).';

-- Helper interno. Quem precisa dele de fora passa por uma RPC que o chama.
REVOKE EXECUTE ON FUNCTION private.normalize_br_phone(text) FROM PUBLIC, anon, authenticated;

DO $$
BEGIN
  IF pg_catalog.has_function_privilege('anon', 'private.normalize_br_phone(text)', 'EXECUTE')
     OR pg_catalog.has_function_privilege('authenticated', 'private.normalize_br_phone(text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'normalize_br_phone alcancavel pela API';
  END IF;
END;
$$;
