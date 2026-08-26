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
 * Preferências configuráveis em Perfil > Preferências. Todas booleanas nos
 * dados atuais — `temaEscuro` é só a preferência salva (o app ainda não
 * aplica o tema visualmente; ver módulo 10 do CLAUDE.md, "Modo escuro
 * (visual)").
 */
export interface PatientPreferences {
  biometria: boolean;
  lembretes24h: boolean;
  lembretes2h: boolean;
  novidadesBiblioteca: boolean;
  temaEscuro: boolean;
}

/**
 * Chaves válidas de `PatientPreferences`, usadas por `atualizarPreferencia`.
 * Equivale à union literal documentada no JSDoc de mockApi.js —
 * 'biometria'|'lembretes24h'|'lembretes2h'|'novidadesBiblioteca'|'temaEscuro'
 * — sem duplicar a lista à mão.
 */
export type PatientPreferenceKey = keyof PatientPreferences;

/**
 * Paciente autenticado. Fonte: `src/mocks/patient.js` (registro único — não
 * há array para comparar formas, então todo campo é tratado como
 * obrigatório: nenhuma amostra mostra uma chave ausente).
 */
export interface Patient {
  id: string;
  nome: string;
  /** Formato 'XXX.XXX.XXX-XX'. */
  cpf: string;
  /** ISO 8601, 'YYYY-MM-DD'. */
  dataNascimento: string;
  /** Formato '(XX) XXXXX-XXXX'. */
  celular: string;
  email: string;
  /**
   * Senha em texto puro — só é aceitável porque isto é mock. Quando o
   * Supabase Auth entrar, este campo some (autenticação deixa de passar
   * pelo objeto de paciente mockado).
   */
  senha: string;
  diagnostico: Diagnosis;
  /** Nome do protocolo de tratamento, ex.: 'FOLFOX'. Texto livre. */
  protocolo: string;
  /** Estadiamento oncológico, ex.: 'IIIa'. Texto livre. */
  estadiamento: string;
  alergias: string[];
  reacoesPrevias: string[];
  preferencias: PatientPreferences;
}

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
 * `confirmarCodigoSms`, `concluirCadastro`, `solicitarRecuperacaoSenha`,
 * `redefinirSenha`, `solicitarExportacaoDados` e `solicitarExclusaoConta`
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

/** Entrada de `login`. */
export interface LoginCredentials {
  email: string;
  senha: string;
}

export interface LoginResult {
  success: true;
  nome: string;
}

/** Entrada de `concluirCadastro` — última etapa do fluxo de Cadastro. */
export interface CreatePasswordInput {
  senha: string;
}

/** Entrada de `solicitarRecuperacaoSenha` — `identificador` é e-mail OU celular. */
export interface PasswordRecoveryRequestInput {
  identificador: string;
}

/** Entrada de `redefinirSenha`. */
export interface ResetPasswordInput {
  senha: string;
}
