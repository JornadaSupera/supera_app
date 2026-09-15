-- A enfermagem navegadora entra no catalogo de permissoes.
-- Design e racional: supera-docs/ADRs/ADR-017 — A enfermagem navegadora no catalogo de permissoes.md
-- Resposta da CEON (31/08/2026) que a originou: #25 e #37 em Requisitos/Questoes em aberto.md
--
-- A clinica nomeou tres vezes um papel que o modelo nao sabia representar:
-- "somente um contato vai assumir o alerta — enfermagem navegadora", "marcar/
-- alterar compromisso na agenda — enfermagem navegadora", e no chat "todos
-- podem, mas a obrigacao e da enfermagem navegadora".
--
-- Nao e especialidade (nem toda enfermeira cadastrada e navegadora) e nao e
-- perfil novo. E DIVISAO DE TRABALHO, que e exatamente o que a costura da
-- ADR-003 §4 foi instalada para receber — `permissions` e
-- `professional_permissions` nasceram vazias em 28/08/2026 porque essa era a
-- unica parte do desenho que NAO seria aditiva depois. O premio do seguro
-- venceu em catorze dias.
--
-- DOIS CODIGOS, nao um codigo `navigator`: o catalogo e de PERMISSOES, nao de
-- papeis (vocabulario do Anexo I: "permissoes granulares"), e um codigo em dois
-- predicados acopla alerta e agenda para sempre — no dia em que a recepcao
-- marcar compromisso, seria preciso dar-lhe a fila de alertas (ADR-017 §2).
--
-- O CHAT NAO GANHA CODIGO: "todos podem responder, mas a obrigacao e da
-- navegadora". Obrigacao nao e permissao — modelar a obrigacao como
-- has_permission INVERTERIA a resposta, tirando dos demais a escrita que a
-- clinica acabou de abrir. O que a obrigacao exige ja existe:
-- conversations.assigned_professional_id e as RPCs de atribuicao (ADR-017 §3).


-- ============================================================
-- 1. Os dois codigos
-- ============================================================
--
-- Na migration e nao em seed, como specialties, symptoms e content_categories:
-- seed NAO roda em `db push`, e um catalogo divergente entre ambientes muda
-- quem pode o que — e regra de seguranca, nao dado de exemplo.

INSERT INTO public.permissions (code, label) VALUES
  ('alerts.triage',   'Assumir, designar e resolver alerta de sintoma crítico'),
  ('schedule.manage', 'Marcar, remarcar e alterar compromisso na agenda')
ON CONFLICT (code) DO NOTHING;

COMMENT ON TABLE public.permissions IS
  'Catalogo de permissoes granulares. SEMANTICA INVERTIDA: codigo AUSENTE daqui concede a TODOS; codigo PRESENTE concede so a quem tem linha vigente em professional_permissions. Inserir codigo e ato RESTRITIVO; REMOVER a linha REABRE para todos, em silencio (ADR-017 §5).';


-- ============================================================
-- 2. A assimetria do primeiro dia
-- ============================================================
--
-- `alerts.triage` nasce SEM CONCESSAO NENHUMA. Nao ha comportamento a
-- preservar — o alerta nao existia ate a migration seguinte —, e fail-closed e
-- a mesma postura de `alert_rules`, que nasce vazia de proposito (ADR-007 §1).
--
-- `schedule.manage` NAO PODE nascer assim: a agenda esta de pe em homologacao
-- e hoje aceita qualquer profissional ativo (ADR-014 §5). Inserir o codigo sem
-- conceder QUEBRARIA UMA TELA QUE FUNCIONA, e o que a clinica pediu foi
-- estreitar o papel, nao parar a agenda. A clinica entao REVOGA de quem nao e
-- navegadora, pelo painel — estreitar por revogacao e auditavel; estreitar por
-- nunca ter concedido nao deixa registro de que houve um estado anterior.
--
-- granted_by_account NULL = concessao do SISTEMA, nao de um administrador.
-- Mesma convencao de audit_log.actor_account_id nulo.

INSERT INTO public.professional_permissions (professional_id, permission_id, granted_by_account)
SELECT p.id, pm.id, NULL
  FROM public.professionals p
  CROSS JOIN public.permissions pm
 WHERE pm.code = 'schedule.manage'
   AND p.is_active
ON CONFLICT DO NOTHING;

-- A CONCESSAO SEMEADA E DADO QUE ENVELHECE, e isto precisa estar escrito onde
-- alguem vai procurar: profissional cadastrado DEPOIS desta migration NAO
-- recebe `schedule.manage` e nao conseguira marcar compromisso ate alguem
-- conceder. E a direcao segura de falha, mas e surpreendente — sem esta nota,
-- vira chamado de suporte descrito como "a agenda parou para a pessoa nova"
-- (ADR-017 §5).
COMMENT ON TABLE public.professional_permissions IS
  'Concessoes vigentes e revogadas. `schedule.manage` foi semeada para os profissionais ATIVOS NA DATA desta migration: quem for cadastrado depois nasce SEM ela e precisa de concessao explicita pelo painel.';


-- ============================================================
-- 3. Os predicados novos
-- ============================================================

-- A agenda ESTREITA. O codigo `appointment.write` que o predicado consultava
-- nunca existiu no catalogo — por isso ele concedia a todo profissional ativo,
-- que era a premissa P1 da ADR-014 enquanto a #35 estivesse aberta. A #35 e a
-- #25 foram respondidas em 31/08/2026 e nomearam a navegadora: o predicado
-- passa a consultar o codigo que ACABA de entrar no catalogo.
CREATE OR REPLACE FUNCTION private.can_manage_schedule()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT private.is_active_professional()
     AND private.has_permission('schedule.manage');
$$;

COMMENT ON FUNCTION private.can_manage_schedule() IS
  'Unico predicado de escrita da agenda (ADR-014 §1). Desde 11/09/2026 consulta `schedule.manage` — a #35 e a #25 nomearam a enfermagem navegadora (ADR-017 §5).';

-- O chat ALARGA, e pelo lado oposto. A ADR-012 §4 decidiu sem esperar a CEON,
-- na direcao restritiva, com o argumento escrito de que modelar permissivo e
-- receber "restrito" deixaria texto clinico escrito por quem nao podia,
-- enquanto o inverso seria troca de predicado numa funcao. A resposta veio
-- PERMISSIVA — "todos podem responder" — e alargar e, de fato, uma linha.
--
-- Sem consultar o catalogo, de proposito (ADR-017 §3): obrigacao nao e
-- permissao. Quem responde volta a ser qualquer profissional ativo; a obrigacao
-- da navegadora se expressa em ATRIBUICAO
-- (conversations.assigned_professional_id), nao em autorizacao.
--
-- O QUE **NAO** CAI JUNTO, e e a parte que um "alargar e uma linha" atropelaria:
-- O SIGILO DA PSICOLOGIA. O predicado antigo misturava DUAS regras na mesma
-- expressao — a #25 ("so na propria area") e a #9 ("todas leem todas, EXCETO
-- psicologia") —, e so a primeira foi respondida em 31/08/2026. Trocar o
-- predicado por `is_active_professional()` puro abriria a conversa restrita a
-- psicologia para a clinica inteira, revogando por descuido uma regra que a
-- clinica confirmou DUAS vezes (#9 e #23).
--
-- A forma correta e ESPELHAR A REGRA DE LEITURA: responde quem PODE VER —
-- exatamente o predicado de conversations_select_professional (ADR-003 §3).
-- Conversa `team` e de todos; `specialty_restricted` continua sendo so da area
-- de origem.
--
-- Consequencia colateral declarada: "conversa NAO ROTEADA nao aceita resposta"
-- (ADR-012) DEIXA DE VALER. Aquilo nunca foi regra propria — era efeito de
-- origin_specialty_id NULL nao casar com nenhuma especialidade. Assumir a
-- conversa continua existindo, e continua sendo o ato que registra quem
-- atende; so nao e mais portao de autorizacao.
CREATE OR REPLACE FUNCTION private.can_reply_as_professional(p_conversation_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT private.is_active_professional()
     AND EXISTS (
           SELECT 1 FROM public.conversations c
            WHERE c.id = p_conversation_id
              AND c.status = 'open'
              AND ( c.visibility = 'team'
                    OR c.origin_specialty_id = ANY (ARRAY(SELECT unnest(private.my_specialty_ids()))) )
         );
$$;

COMMENT ON FUNCTION private.can_reply_as_professional(uuid) IS
  'A #25 no chat, respondida em 31/08/2026: TODOS os profissionais ativos respondem — dentro do que podem VER. O recorte por area caiu; o sigilo da psicologia (#9/#23) NAO, e por isso o predicado espelha conversations_select_professional (ADR-017 §3).';


-- ============================================================
-- 4. Privilegios — SEMPRE no fim
-- ============================================================
--
-- CREATE OR REPLACE preserva os privilegios das funcoes substituidas; os
-- GRANTs originais continuam valendo. Repetidos por serem baratos e por a
-- ausencia deles ja ter derrubado escrita duas vezes neste projeto — helper
-- que entra em politica precisa de EXECUTE em RUNTIME, de quem consulta e de
-- quem escreve.
GRANT EXECUTE ON FUNCTION private.can_manage_schedule()               TO authenticated;
GRANT EXECUTE ON FUNCTION private.can_reply_as_professional(uuid)     TO authenticated;
