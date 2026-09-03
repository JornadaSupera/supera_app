// Tipos do domínio Paciente — cobre o mock em `src/mocks/patient.js` e os
// fluxos de autenticação/cadastro descritos via JSDoc em
// `src/services/mockApi.js` (verificarIdentidade, login, OTP, cadastro,
// recuperação de senha, exportação/exclusão LGPD). Esses fluxos não têm
// mock próprio — não existe um array pra comparar formas —, então seus
// tipos de entrada/saída moram aqui, junto da entidade Patient a que se
// referem.

/** CID-10 + descrição textual do diagnóstico oncológico do paciente. */
export interface Diagnosis {
  /** Código CID-10, ex.: 'C18.9'. */
  cid: string;
  descricao: string;
}

/**
 * Paciente autenticado.
 *
 * `nome`/`cpf`/`dataNascimento` vêm de `patients`; `celular`/`email` de
 * `accounts` (o próprio cadastro do paciente não tem essas duas colunas —
 * são a identidade de quem autentica, não a do paciente). O restante do
 * quadro clínico é opcional de verdade, não só no tipo: um cadastro recém
 * ativado, sem diagnóstico nem plano de tratamento lançados ainda, é o
 * estado normal de um paciente novo, não um erro de carregamento.
 */
export interface Patient {
  id: string;
  nome: string;
  /** Formato 'XXX.XXX.XXX-XX'. */
  cpf: string;
  /** ISO 8601, 'YYYY-MM-DD'. */
  dataNascimento: string;
  /** Formato '(XX) XXXXX-XXXX'. `null` quando a conta não tem telefone cadastrado. */
  celular: string | null;
  email: string;
  /**
   * Senha em texto puro — resquício do mock. O login já não a lê: quem
   * autentica é o Supabase Auth. Só o fluxo de Cadastro (ainda mockado, e
   * sem caminho no banco) continua escrevendo aqui. Some junto com
   * `src/mocks/patient.js`, quando o cadastro ganhar um caminho real.
   */
  senha: string;
  /** `null` quando nenhum CID foi lançado para este paciente ainda. */
  diagnostico: Diagnosis | null;
  /** Nome do protocolo do plano de tratamento vigente. `null` sem plano aberto. */
  protocolo: string | null;
  /** Estadiamento do diagnóstico principal. `null` quando não informado. */
  estadiamento: string | null;
  alergias: string[];
  reacoesPrevias: string[];
}

// `preferencias` saiu daqui: não é dado do PACIENTE. `biometria` e
// `temaEscuro` são preferência de APARELHO (sem tabela, vivem no
// `localStorage` deste dispositivo — ver `ProfileHub.tsx`); os três toggles
// de canal (lembretes 24h/2h, novidades da biblioteca) são
// `notification_preferences`, lidos por `useNotificationPreferences`
// (`hooks/useNotifications.ts`). Nenhum dos dois é atributo do cadastro
// clínico, então misturá-los em `Patient` inventava uma coluna que a tabela
// `patients` não tem.

// DIVERGÊNCIA (código vs. mock, não achada via JSDoc): `src/pages/Home/Home.jsx:120`
// lê `patient.foto` para montar o avatar da saudação
// (`<GreetingHeader nome={patient.nome} fotoUrl={patient.foto} />`), mas o
// mock de paciente não tem essa chave em nenhum lugar. `foto` NÃO entra em
// `Patient` propositalmente — a regra é tipar o que existe de verdade no
// mock, não inventar campo pra calar um consumidor. Hoje isso só resulta em
// `fotoUrl={undefined}` (sem crash, cai no fallback de iniciais do avatar);
// fica registrado aqui para quem for tocar em `patient.js` ou em Home.jsx.

/**
 * Envelope de sucesso genérico usado por várias mutações do mockApi que não
 * retornam nada além de `{ success: true }`: `enviarCodigoSms`,
 * `confirmarCodigoSms`, `concluirCadastro`, `requestPasswordReset`,
 * `resetPassword`, `solicitarExportacaoDados` e `solicitarExclusaoConta`
 * (todas aqui em patient/auth/LGPD), além de `marcarOrientacaoComoLida`
 * (orientations), `marcarConversaComoLida` (messages),
 * `marcarNotificacaoComoLida` / `marcarTodasNotificacoesComoLidas`
 * (notifications) e `convidarCuidador` / `removerCuidador` (caregiver).
 * Definido uma única vez aqui — o arquivo mais "central" dos 8 — em vez de
 * redeclarar a mesma forma em cada domínio; quem precisar noutro arquivo
 * importa `ApiSuccessResult` daqui.
 */
export interface ApiSuccessResult {
  success: true;
}

/** Entrada de `verificarIdentidade` — 1ª etapa do fluxo de Cadastro. */
export interface VerifyIdentityInput {
  cpf: string;
  /** ISO 8601, 'YYYY-MM-DD'. */
  nascimento: string;
  celular: string;
}

export interface VerifyIdentityResult {
  success: true;
  celular: string;
  nome: string;
}

/** Entrada de `concluirCadastro` — última etapa do fluxo de Cadastro. */
export interface CreatePasswordInput {
  senha: string;
}

// Os tipos de login e de recuperação de senha saíram daqui: agora que esses
// fluxos falam com o Supabase Auth, e não com este mock, eles pertencem à
// sessão — ver `SignInCredentials`, `PasswordResetRequestInput` e
// `ResetPasswordInput` em `./session`.
