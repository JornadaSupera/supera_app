// Tipos da sessão autenticada — quem está logado e o que o app pode fazer
// em nome dessa pessoa.
//
// Autenticar e *ser paciente* são coisas separadas no banco: `accounts` nasce
// no signup (trigger sobre `auth.users`), mas `patients` é cadastro da
// clínica e só passa a ser visível ao titular quando alguém liga as duas
// linhas por `patients.account_id`. Enquanto esse vínculo não existe, a
// pessoa entra no app e não é paciente nenhum — daí `patientId` ser
// nullable, e não um `string` otimista.

/**
 * Situação da sessão, na ordem em que o app a descobre.
 *
 * - `verificando`: o cofre criptografado ainda não respondeu. Estado inicial;
 *   decidir antes disso expulsaria o usuário autenticado a cada abertura.
 * - `anonimo`: sem sessão. Vai para o login.
 * - `autenticado`: sessão válida **e** vínculo de paciente resolvido.
 * - `sem-vinculo`: autenticou, mas nenhuma linha de `patients` é visível.
 *   Cadastro ainda não vinculado (ou paciente inativo) — a pessoa não
 *   consegue ler nem escrever nada clínico, então a UI precisa dizer isso em
 *   vez de mostrar listas vazias.
 * - `conta-inativa`: `accounts.is_active = false`. É a revogação de acesso
 *   (`set_account_active`), e vale na hora. Distinta de `sem-vinculo` de
 *   propósito: o desfecho para o usuário é outro (acesso revogado, não
 *   cadastro pendente).
 */
export type SessionStatus =
  | 'verificando'
  | 'anonimo'
  | 'autenticado'
  | 'sem-vinculo'
  | 'conta-inativa';

/**
 * Identidade da sessão. Montada a partir de `accounts` (a linha do próprio
 * usuário) e de `patients` (a linha que a RLS deixa o titular enxergar).
 *
 * Não persistir: é PII, vive em memória e no cache do TanStack Query.
 */
export interface SessionIdentity {
  /** `auth.uid()` — também a PK de `accounts`. */
  accountId: string;
  /**
   * `patients.id`. `null` enquanto a conta não estiver vinculada a um
   * cadastro de paciente ativo. Todo módulo clínico depende deste valor.
   */
  patientId: string | null;
  /** `accounts.full_name` — nullable no banco (o signup não exige nome). */
  fullName: string | null;
  email: string;
  phone: string | null;
  /**
   * `accounts.is_active`. A política de leitura da própria conta não filtra
   * por este campo, então uma conta desativada ainda lê a própria linha — é
   * o que permite distinguir revogação de vínculo pendente.
   */
  isAccountActive: boolean;
}

/** Entrada de `signIn`. */
export interface SignInCredentials {
  email: string;
  password: string;
}

/**
 * Entrada de `requestPasswordReset`. `identifier` é o que a pessoa digitou —
 * a tela aceita e-mail ou celular, mas só e-mail tem caminho no backend hoje.
 */
export interface PasswordResetRequestInput {
  identifier: string;
}

/** Entrada de `resetPassword` — última etapa da recuperação. */
export interface ResetPasswordInput {
  password: string;
}
