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
  /**
   * A sessão é de um acompanhante, e não do titular.
   *
   * Muda o que o app pode fazer, não só o que ele mostra: o registro do
   * diário precisa ir com `acting_as = 'caregiver'` (a política do titular
   * exige `'patient'` e recusaria), e favoritar/marcar orientação como lida
   * é ato do titular — `patient_content_states` não tem política para o
   * acompanhante.
   *
   * Note que `patientId` continua preenchido: é o id do **tutelado**, que a
   * RLS deixa o acompanhante enxergar. Ser acompanhante não é não ter
   * paciente; é ter o paciente de outra pessoa.
   */
  isCaregiver: boolean;
}

/** Entrada de `signIn`. */
export interface SignInCredentials {
  email: string;
  password: string;
}

/**
 * Entrada de `signUp`.
 *
 * `fullName` vai para `options.data.full_name` do signup — a única chave do
 * metadata que o trigger de criação de `accounts` aproveita.
 */
export interface SignUpInput {
  fullName: string;
  email: string;
  password: string;
}

/** Retorno de `signUp`. */
export interface SignUpResult {
  /**
   * `true` quando o projeto exige confirmação de e-mail: o cadastro foi
   * aceito, mas ainda **não há sessão** — e sem `auth.uid()` nada que dependa
   * de estar autenticado funciona. A tela precisa dizer isso em vez de seguir
   * para um passo que vai falhar.
   */
  needsEmailConfirmation: boolean;
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
