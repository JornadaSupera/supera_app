-- Os rotulos semeados sem acento em sintomas, CID-10 e fases do tratamento
-- ganham a grafia correta.
-- Plano das pendencias do painel de 30/09/2026, Fase E, item E.6 (painel #19).
-- Design e racional: supera-docs/ADRs/ADR-027 — Configuração da clínica e vocabulários editáveis.md
--
-- O padrao e o de refine_notification_types: SO TROCA O QUE AINDA E O TEXTO
-- DA CARGA. Desde a Fase 5 o administrador corrige rotulo de sintoma pelo
-- painel (update_vocabulary_term), e um rotulo que ele ja corrigiu — ou
-- reescreveu de outro jeito — nao pode ser sobrescrito por migration. O WHERE
-- compara codigo E texto original; o que nao casar fica como esta.
--
-- Os codigos nao mudam: sao a chave estavel que o app, os relatorios e o
-- Gemed usam. So o rotulo exibido muda.
--
-- CID-10 continua sem edicao pelo painel: e base de referencia espelhada do
-- Gemed (ADR-004). Quando a sincronizacao existir, o rotulo que vier de la
-- prevalece.
--
-- As fases aposentadas (remissao, finalizacao) entram: o historico de fase de
-- um paciente as mostra, e o rotulo aposentado continua sendo lido.
--
-- "Leucemia linfoide" fica como esta: sem acento desde o Acordo de 1990.


-- ============================================================
-- 1. Sintomas
-- ============================================================

UPDATE public.symptoms t
   SET label = v.novo
  FROM (VALUES
    ('nausea',        'Nausea',             'Náusea'),
    ('vomiting',      'Vomito',             'Vômito'),
    ('constipation',  'Constipacao',        'Constipação'),
    ('mouth_changes', 'Alteracoes na boca', 'Alterações na boca'),
    ('skin_changes',  'Alteracoes na pele', 'Alterações na pele')
  ) AS v(code, antigo, novo)
 WHERE t.code = v.code
   AND t.label = v.antigo;


-- ============================================================
-- 2. CID-10
-- ============================================================

UPDATE public.cid10 t
   SET label = v.novo
  FROM (VALUES
    ('C18', 'Neoplasia maligna do colon',                 'Neoplasia maligna do cólon'),
    ('C34', 'Neoplasia maligna dos bronquios e do pulmao', 'Neoplasia maligna dos brônquios e do pulmão'),
    ('C61', 'Neoplasia maligna da prostata',              'Neoplasia maligna da próstata'),
    ('C16', 'Neoplasia maligna do estomago',              'Neoplasia maligna do estômago'),
    ('C25', 'Neoplasia maligna do pancreas',              'Neoplasia maligna do pâncreas'),
    ('C56', 'Neoplasia maligna do ovario',                'Neoplasia maligna do ovário'),
    ('C73', 'Neoplasia maligna da glandula tireoide',     'Neoplasia maligna da glândula tireoide')
  ) AS v(code, antigo, novo)
 WHERE t.code = v.code
   AND t.label = v.antigo;


-- ============================================================
-- 3. Fases do tratamento (inclusive as aposentadas)
-- ============================================================

UPDATE public.treatment_phases t
   SET label = v.novo
  FROM (VALUES
    ('clinical', 'remissao',    'Em remissao',    'Em remissão'),
    ('clinical', 'finalizacao', 'Em finalizacao', 'Em finalização')
  ) AS v(axis, code, antigo, novo)
 WHERE t.axis = v.axis
   AND t.code = v.code
   AND t.label = v.antigo;
