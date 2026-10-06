// Tipos do domínio Paciente — a ficha lida por `getPatient` e o envelope de
// sucesso que várias mutações compartilham. Ligar a conta à ficha é da sessão:
// ver `PatientLinkInput` em `./session`.

/** CID-10 + descrição textual do diagnóstico oncológico do paciente. */
export interface Diagnosis {
  /** Código CID-10, ex.: 'C18.9'. */
  cid: string;
  description: string;
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
  name: string;
  /**
   * Formato 'XXX.XXX.XXX-XX'.
   *
   * **`null` na sessão do acompanhante**, e isso é do banco: desde 25/09/2026 a
   * política `patients_select_caregiver` não existe mais, e o acompanhante lê o
   * tutelado por `get_my_ward()`, que projeta só id, nome, fase e situação.
   * Antes o valor completo chegava ao cliente e a tela apenas o escondia.
   */
  cpf: string | null;
  /** ISO 8601, 'YYYY-MM-DD'. `null` na sessão do acompanhante (ver `cpf`). */
  birthDate: string | null;
  /** Formato '(XX) XXXXX-XXXX'. `null` sem telefone cadastrado e na sessão do acompanhante. */
  phone: string | null;
  /** `null` na sessão do acompanhante (ver `cpf`). */
  email: string | null;
  /** `null` quando nenhum CID foi lançado para este paciente ainda. */
  diagnosis: Diagnosis | null;
  /** Nome do protocolo do plano de tratamento vigente. `null` sem plano aberto. */
  protocol: string | null;
  /** Ciclos previstos no plano vigente (`treatment_plans.cycles_planned`). `null` se não informado. */
  cyclesPlanned: number | null;
  /** Ciclo em andamento (`treatment_plans.current_cycle_number`). `null` se não informado. */
  currentCycle: number | null;
  /** Estadiamento do diagnóstico principal. `null` quando não informado. */
  stage: string | null;
  allergies: string[];
  previousReactions: string[];
}

// `preferencias` saiu daqui: não é dado do PACIENTE. `biometria` e
// `darkTheme` são preferência de APARELHO (sem tabela, vivem no
// `localStorage` deste dispositivo — ver `ProfileHub.tsx`); os três toggles
// de canal (lembretes 24h/2h, novidades da biblioteca) são
// `notification_preferences`, lidos por `useNotificationPreferences`
// (`hooks/useNotifications.ts`). Nenhum dos dois é atributo do cadastro
// clínico, então misturá-los em `Patient` inventava uma coluna que a tabela
// `patients` não tem.

/**
 * Envelope de sucesso genérico das mutações que não devolvem nada além de
 * `{ success: true }` (recuperação de senha, LGPD, marcar como lida…).
 * Definido uma única vez, em vez de redeclarar a mesma forma em cada domínio.
 */
export interface ApiSuccessResult {
  success: true;
}

// Os tipos de login e de recuperação de senha moram na sessão — ver
// `SignInCredentials`, `PasswordResetRequestInput` e `ResetPasswordInput` em
// `./session`.
