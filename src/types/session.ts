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
   *
   * O campo diz **como esta sessão está agindo**, não que perfis a conta tem.
   * Conta com ficha própria devolve `false` mesmo tendo perfil de acompanhante
   * de outra pessoa — senão um registro que o titular faz sobre si mesmo iria
   * para a auditoria assinado como acompanhante. A regra de desempate mora em
   * `getSessionIdentity`.
   */
  isCaregiver: boolean;
  /**
   * `app_metadata.must_change_password`: o acompanhante entrou com a senha
   * provisória e ainda não escolheu a sua. Enquanto for `true`, nenhuma outra
   * tela abre (ver `RequireAuth`) e o banco também não devolve nenhum dado.
   *
   * Lido de `app_metadata`, nunca de `user_metadata`: este último a própria
   * pessoa edita, e a troca deixaria de ser obrigatória.
   */
  mustChangePassword: boolean;
}

/**
 * Provedores de login federado habilitados. O nome é o que o GoTrue espera em
 * `signInWithOAuth` — não inventar apelido, ou o provedor não é reconhecido.
 *
 * Cada um precisa estar ligado no painel do Supabase (Authentication →
 * Providers) com as credenciais do respectivo console. Enquanto não estiver, a
 * chamada volta com erro do próprio GoTrue, não com falha silenciosa.
 */
export type OAuthProvider = 'google' | 'apple';

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
  /**
   * Celular no formato internacional (`+5549999999999`). Não vai no metadata do
   * Auth: o trigger de criação de `accounts` só lê `full_name`. É gravado em
   * `accounts.phone` logo depois, com a sessão que o cadastro devolve.
   */
  phone: string;
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
  /**
   * O celular foi gravado em `accounts.phone`. `false` sem sessão (não há
   * `auth.uid()` para a política deixar gravar) ou quando a gravação falhou —
   * o cadastro em si não depende disso.
   */
  phoneSaved: boolean;
}

/**
 * Entrada de `linkPatientByVerifiedPhone` — liga a conta da sessão à ficha que
 * a clínica cadastrou no painel, com o celular já confirmado por SMS. O CPF e o
 * nascimento têm de bater com a ficha: os dois são obrigatórios.
 */
export interface PatientLinkInput {
  /** CPF, com ou sem máscara — o banco normaliza. */
  cpf: string;
  /** ISO 8601, 'YYYY-MM-DD' (formato do `<input type="date">`). */
  birthDate: string;
}

/**
 * Entrada de `activatePatientAccount` — liga a conta da sessão à ficha que a
 * recepção cadastrou no painel, com o código de ativação que ela gerou. Os
 * três campos são obrigatórios: o banco exige código E CPF E nascimento.
 */
export interface PatientActivationInput {
  /** Código de ativação: 64 caracteres hexadecimais, já sem espaços e em minúsculas. */
  token: string;
  /** CPF, com ou sem máscara — o banco normaliza. */
  cpf: string;
  /** ISO 8601, 'YYYY-MM-DD'. */
  birthDate: string;
}

/**
 * Entrada de `requestPasswordReset`. `identifier` é o e-mail que a pessoa
 * digitou — só e-mail tem caminho no backend hoje (sem SMS no Auth).
 */
export interface PasswordResetRequestInput {
  identifier: string;
}

/** Entrada de `resetPassword` — última etapa da recuperação. */
export interface ResetPasswordInput {
  password: string;
}
