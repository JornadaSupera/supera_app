-- O tipo de compromisso "Encerramento de tratamento". Pendencia [37] do time,
-- Fase L (06/10/2026).
--
-- O CODIGO E CONTRATO COM O APP. A tela do sino (o fim do tratamento) e
-- disparada pelo compromisso deste tipo, e o app o reconhece SO pelo codigo
-- `treatment_closure`, nunca pelo rotulo: o administrador pode renomear o
-- rotulo (update_vocabulary_term), e o app deixaria de reconhecer o tipo.
-- O codigo nao muda por nenhuma RPC: update_vocabulary_term so altera `label`
-- e `sort_order`, e um gatilho recusa a troca de `code`
-- (20260925142215_create_vocabulary_admin.sql).
--
-- Rotulo, ordem e `is_active` continuam com a clinica, pelas RPCs de
-- vocabulario. Cor e icone nascem nulos, como os dos outros sete tipos: quem
-- os define e a clinica (comentario de create_appointments).
--
-- ON CONFLICT DO NOTHING: se o painel ja criou a linha com este codigo, ela
-- fica como esta, com o rotulo e a ordem que a clinica escolheu. E de
-- proposito: o que importa ao app e o codigo, e ele ja existe.
--
-- Vocabulario, nao decisao estrutural (ADR-002): sem ADR propria.

INSERT INTO public.appointment_types (code, label, sort_order, is_active)
VALUES ('treatment_closure', 'Encerramento de tratamento', 8, true)
ON CONFLICT (code) DO NOTHING;


-- ============================================================
-- Verificacao — o efeito, nao o comando
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.appointment_types WHERE code = 'treatment_closure'
  ) THEN
    RAISE EXCEPTION 'appointment_types sem o codigo treatment_closure — o app nao reconhece o encerramento';
  END IF;
END;
$$;
