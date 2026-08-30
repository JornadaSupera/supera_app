-- Corrige private.has_permission(): checava apenas professionals.is_active,
-- deixando de fora accounts.is_active.
--
-- Design e racional: supera-docs/Modelo de Dados/Identidade e acesso.md
-- Decisão: ADR-003 §2 — a revogação vale nos DOIS níveis, conta e perfil.
--
-- Achado ao escrever a cobertura pgTAP das políticas: com a CONTA desligada e o
-- PERFIL ainda ativo, is_active_professional() negava (correto) e
-- has_permission() concedia. Os quatro helpers irmãos já faziam o join com
-- accounts; só este ficou de fora — divergia do comentário do próprio arquivo
-- que criou os cinco ("Todos checam OS DOIS níveis de is_active").
--
-- Latente, não explorável hoje: o catálogo de permissions nasce vazio (#12),
-- e nesse estado a primeira perna do OR já concede tudo; além disso nenhuma
-- política vigente chama has_permission(). Vira privilégio residual no dia em
-- que a primeira permissão for cadastrada — desligar a conta deixaria de
-- revogá-la. Barato agora, caro de descobrir depois.
--
-- A semântica do catálogo NÃO muda: permissão ausente do catálogo segue não
-- restringindo nada. has_permission() é REFINAMENTO de escopo, nunca portão
-- sozinho — em política, sempre em AND com is_active_professional().

CREATE OR REPLACE FUNCTION private.has_permission(p_code text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT NOT EXISTS (SELECT 1 FROM public.permissions WHERE code = p_code)
      OR EXISTS (
        SELECT 1
        FROM public.professional_permissions pp
        JOIN public.permissions   pm ON pm.id = pp.permission_id
        JOIN public.professionals p  ON p.id  = pp.professional_id
        -- O join que faltava. Alinhado aos outros quatro helpers, inclusive na
        -- forma: compara auth.uid() com a.id, não com p.account_id.
        JOIN public.accounts      a  ON a.id  = p.account_id
        WHERE pm.code = p_code
          AND a.id = auth.uid()
          AND a.is_active
          AND p.is_active
      );
$$;

-- CREATE OR REPLACE preserva os privilégios existentes; o GRANT de
-- create_identity_core continua valendo. Repetido por ser barato e explícito.
GRANT EXECUTE ON FUNCTION private.has_permission(text) TO authenticated;
