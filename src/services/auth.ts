// Autenticação e conta: entrar, criar conta, provedores (Google/Apple), senha,
// confirmação do celular por SMS e a ligação da conta à ficha pelo celular.
//
// Nenhuma página fala com o Supabase direto: toda leitura e escrita passa pelos
// serviços, sob a RLS da sessão, e devolve os formatos de `src/types/` — as telas
// não conhecem nome de coluna nem forma de embed.
import { Capacitor } from '@capacitor/core';
import type { AuthError } from '@supabase/supabase-js';
import { appError } from '../lib/appError';
import { requireSupabase } from './supabaseClient';
import { signInWithNativeProvider } from './socialAuth';
import { looksLikeEmail } from '../schemas/auth';
import { MIN_PATIENT_AGE } from '../schemas/signup';
import type {
  ApiSuccessResult,
  SessionIdentity,
  SignInCredentials,
  SignUpInput,
  SignUpResult,
  PatientLinkInput,
  OAuthProvider,
  PasswordResetRequestInput,
  ResetPasswordInput,
} from '../types';
import { describeIdentityError, getSessionIdentity } from './session';

/**
 * Caminho para onde o link de redefinição de senha devolve o usuário. Precisa
 * bater com uma rota real do app e estar na lista de "Redirect URLs" do
 * projeto Supabase.
 *
 * O que acontece quando NÃO bate é pior do que um erro visível: o GoTrue não
 * recusa nem avisa — ele devolve o `Site URL` do projeto e manda a pessoa para
 * lá, calado. Como o Site URL daqui é o painel clínico, o sintoma é o paciente
 * terminar numa tela que não é a dele, sem nenhuma mensagem explicando.
 */
const PASSWORD_RESET_REDIRECT_PATH = '/recuperar-senha/nova';

/**
 * Traduz o erro do GoTrue para uma frase que o paciente entenda.
 *
 * Nenhuma mensagem distingue "e-mail não existe" de "senha errada": revelar
 * isso transformaria a tela de login em um verificador de cadastro — que num
 * app de oncologia significa confirmar que alguém é paciente do Centro.
 */
function describeAuthError(error: AuthError): string {
  switch (error.code) {
    case 'invalid_credentials':
      return 'E-mail ou senha incorretos.';
    case 'email_not_confirmed':
      return 'Confirme seu e-mail antes de entrar. Verifique sua caixa de entrada.';
    case 'user_banned':
      return 'Seu acesso está bloqueado. Fale com a recepção do Centro.';
    case 'over_request_rate_limit':
    case 'over_email_send_rate_limit':
      return 'Muitas tentativas seguidas. Aguarde alguns minutos e tente novamente.';
    case 'weak_password':
      return 'Essa senha é fácil de adivinhar. Escolha uma combinação mais forte.';
    case 'user_already_exists':
    case 'email_exists':
      // Só chega aqui com a confirmação de e-mail DESLIGADA no projeto: com
      // ela ligada o GoTrue devolve sucesso falso para não virar oráculo de
      // cadastros. A mensagem aponta a saída, que é entrar em vez de criar.
      return 'Já existe uma conta com este e-mail. Entre com ela em vez de criar outra.';
    case 'same_password':
      return 'A nova senha precisa ser diferente da anterior.';
    case 'session_expired':
    case 'refresh_token_not_found':
      return 'Sua sessão expirou. Entre novamente.';
    case 'provider_disabled':
    case 'validation_failed':
      // O caso real por trás disto é o provedor federado (Google/Apple) ainda
      // não habilitado em Authentication → Providers. Cair no genérico
      // "tente em instantes" mandaria procurar no lugar errado — é
      // configuração do projeto, e tentar de novo nunca resolve.
      return 'Este login ainda não está habilitado. Use seu e-mail e senha, ou fale com a recepção do Centro.';
    default:
      // `status: 0` é a assinatura de falha de rede no auth-js — o navegador
      // nem chegou a receber resposta. Vale separar porque a ação do usuário
      // é outra: conferir a conexão, não conferir a senha.
      if (error.status === 0) {
        return 'Sem conexão com o servidor. Verifique sua internet e tente novamente.';
      }
      return 'Não foi possível concluir. Tente novamente em instantes.';
  }
}

/**
 * Autentica por e-mail + senha e devolve a identidade resultante.
 * @throws {Error} Credenciais inválidas, conta desativada ou falha de rede.
 */
export async function signIn({ email, password }: SignInCredentials): Promise<SessionIdentity> {
  const client = requireSupabase();

  const { error } = await client.auth.signInWithPassword({
    email: email.trim().toLowerCase(),
    password,
  });

  if (error) throw appError(describeAuthError(error), error);

  const identity = await getSessionIdentity();

  if (!identity) {
    throw appError('Não foi possível carregar seus dados. Tente entrar novamente.');
  }

  // Conta desativada é a revogação de acesso do projeto (`set_account_active`):
  // a RLS passa a negar tudo. Manter a sessão só produziria telas vazias sem
  // explicação, então encerra aqui e diz o que aconteceu.
  if (!identity.isAccountActive) {
    await client.auth.signOut();
    throw appError('Seu acesso está desativado. Fale com a recepção do Centro para reativá-lo.');
  }

  return identity;
}

/**
 * Cria uma conta por e-mail + senha.
 *
 * A conta sozinha não dá acesso a nada: o paciente só enxerga a própria ficha
 * depois de a clínica ligá-la à conta — a linha em `patients` é cadastro da
 * clínica, e o que a pessoa faz aqui é abrir a conta, não se inscrever.
 *
 * O nome vai em `options.data.full_name` porque é dali que o trigger
 * `trg_handle_new_auth_user` o lê ao criar a linha em `accounts`. É a **única
 * chave** que ele aproveita do metadata: e-mail e telefone vêm das colunas
 * nativas de `auth.users`, e qualquer outra chave enviada aqui é ignorada.
 * Nada que decida acesso pode passar por aqui — `raw_user_meta_data` é
 * escrito pelo próprio usuário.
 *
 * `needsEmailConfirmation` distingue as duas configurações possíveis do
 * projeto: com confirmação ligada o `signUp` não devolve sessão, e quem
 * chamou precisa dizer à pessoa que ela tem de confirmar o e-mail antes de
 * seguir — em vez de mostrar uma tela que vai falhar por falta de `auth.uid()`.
 */
export async function signUp({
  fullName,
  email,
  password,
  phone,
}: SignUpInput): Promise<SignUpResult> {
  const client = requireSupabase();

  const { data, error } = await client.auth.signUp({
    email: email.trim().toLowerCase(),
    password,
    options: { data: { full_name: fullName.trim() } },
  });

  if (error) throw appError(describeAuthError(error), error);

  // O celular não segue no metadata (o trigger só lê `full_name`): entra em
  // `accounts` por UPDATE, que precisa da sessão. Sem sessão não há como
  // gravar — e falhar aqui não pode desfazer nem esconder a conta que acabou
  // de nascer, então só é dito ao chamador.
  if (!data.session) return { needsEmailConfirmation: true, phoneSaved: false };

  try {
    await updateAccountPhone(phone);
    return { needsEmailConfirmation: false, phoneSaved: true };
  } catch {
    return { needsEmailConfirmation: false, phoneSaved: false };
  }
}

/**
 * Traduz a falha de uma etapa da verificação do celular (envio do SMS ou
 * conferência do código). Só o que muda a ação da pessoa ganha frase própria;
 * o resto cai no texto do Auth.
 */
function describePhoneVerificationError(error: AuthError): string {
  switch (error.code) {
    case 'otp_expired':
      // O GoTrue responde igual para código errado e código vencido.
      return 'Código incorreto ou vencido. Confira os números ou peça um novo.';
    case 'over_sms_send_rate_limit':
      return 'Você pediu códigos demais. Aguarde alguns minutos e tente de novo.';
    case 'sms_send_failed':
    case 'otp_disabled':
    case 'phone_provider_disabled':
      return 'Não foi possível enviar o SMS agora. Tente de novo em instantes.';
    case 'phone_exists':
      return 'Este celular já está em uso em outra conta.';
    default:
      return describeAuthError(error);
  }
}

/** O código confirmou o celular em outra conta, e a sessão saiu (ver `verifyPhoneCode`). */
export const PHONE_CONFIRMED_ELSEWHERE = 'phone_confirmed_elsewhere';

/**
 * Pede o envio do código por SMS para confirmar o celular da conta.
 *
 * É `updateUser({ phone })` que dispara o envio: o Auth só manda o código de
 * troca de telefone a quem já tem sessão, e por isso a conta vem antes. Quem
 * envia e confere o código é o provedor de telefone do Auth (Twilio Verify).
 *
 * Serve também para REENVIAR: o pedido de troca não confirmado some em 15
 * minutos (guia 5.12), e depois disso só `updateUser` o recria — o
 * `auth.resend` não acharia pedido nenhum. O intervalo entre envios quem
 * controla é o Auth.
 */
export async function requestPhoneVerification(phone: string): Promise<ApiSuccessResult> {
  const client = requireSupabase();

  const { error } = await client.auth.updateUser({ phone });

  if (error) throw appError(describePhoneVerificationError(error), error);

  return { success: true };
}

/**
 * Confere o código digitado. Uso único: um código aceito não vale de novo.
 *
 * O Auth não usa a sessão para achar a conta: procura o número entre as trocas
 * de telefone pendentes (`auth.users.phone_change`) e, se duas contas pediram o
 * mesmo número, confirma na primeira que achar — e devolve a sessão DELA
 * (comportamento documentado pelo Supabase). Por isso a conta de antes e a de
 * depois são comparadas: se mudou, o código confirmou o celular em outra
 * conta, e seguir ligaria essa outra conta à ficha desta pessoa. A sessão
 * estranha sai na hora, e nada mais acontece.
 */
export async function verifyPhoneCode(phone: string, code: string): Promise<ApiSuccessResult> {
  const client = requireSupabase();

  const { data: before } = await client.auth.getSession();
  const expectedUserId = before.session?.user.id ?? null;

  const { data, error } = await client.auth.verifyOtp({ phone, token: code, type: 'phone_change' });

  if (error) throw appError(describePhoneVerificationError(error), error);

  if (!expectedUserId || data.user?.id !== expectedUserId) {
    await client.auth.signOut({ scope: 'local' });
    throw appError(
      'Não foi possível confirmar seu celular nesta conta. Por segurança, você saiu do app. Fale com a recepção do Centro.',
      { code: PHONE_CONFIRMED_ELSEWHERE }
    );
  }

  return { success: true };
}

/**
 * Traduz a recusa do vínculo da conta à ficha.
 *
 * Dois casos dizem respeito só à própria conta e não vazam nada sobre a
 * ficha, então ganham frase própria. Todo o resto — CPF que não confere,
 * nascimento que não confere, celular diferente do da ficha — é a MESMA
 * recusa, de propósito: separar os casos deixaria descobrir o CPF de uma ficha
 * por tentativa e erro.
 */
function describePatientLinkError(error: { code?: string; message?: string }): string {
  const message = error.message ?? '';

  if (message.includes('account_has_other_profile')) {
    return 'Esta conta já é usada com outro perfil (por exemplo, como acompanhante) e não pode ser de paciente. Saia e crie uma conta nova, com outro e-mail.';
  }

  if (message.includes('account_already_linked')) {
    return 'Esta conta já está ligada a um cadastro de paciente. Saia e entre novamente com o mesmo e-mail.';
  }

  if (message.includes('too_many_attempts')) {
    return 'Muitas tentativas. Tente de novo em uma hora.';
  }

  // `PGRST202`: a função não existe no banco. Acontece se a verificação for
  // ligada antes de o banco entregá-la — e tentar de novo nunca resolve.
  if (error.code === 'PGRST202') {
    return 'A confirmação do cadastro ainda não está disponível. Fale com a recepção do Centro.';
  }

  // A recusa genérica: qualquer divergência entre celular, CPF, nascimento e
  // ficha responde igual. Sem o código do Centro (29/09), dado certo que não
  // liga é ficha desatualizada — só a recepção corrige.
  if (message.includes('invalid_invitation')) {
    return 'Não encontramos um cadastro com este celular, CPF e data de nascimento. Confira os dados; se estiverem certos, fale com a recepção do Centro para atualizar o seu cadastro.';
  }

  if (message.includes('phone_not_verified')) {
    return 'Seu celular precisa ser confirmado de novo. Toque em "Reenviar código" para receber um novo.';
  }

  // Neutra de propósito (guia 5.12): não dizer que outra conta pediu o número.
  // Sem o código do Centro, a saída é a recepção.
  if (message.includes('phone_contested')) {
    return 'Não foi possível confirmar este número. Fale com a recepção do Centro.';
  }

  // A ficha é de menor de idade ([BANCO 36]): a mesma regra e a mesma frase da
  // validação do cadastro. Vale sozinho quando o banco passar a devolver o código.
  if (message.includes('underage')) {
    return `Para usar o app é preciso ter ${MIN_PATIENT_AGE} anos ou mais. Se o paciente é menor de idade, fale com a recepção do Centro.`;
  }

  if (error.code === '42501') {
    return 'Entre com a sua conta para confirmar o cadastro.';
  }

  return 'Não foi possível confirmar seu cadastro. Tente novamente em instantes.';
}

/**
 * O celular já confirmado desta conta, em E.164 (`+55…`), ou `null`.
 *
 * Serve para não pedir SMS de novo a quem já confirmou o número e só precisa
 * corrigir CPF ou nascimento: para o mesmo número, `updateUser({ phone })`
 * não manda código nenhum (não há troca), e a pessoa ficaria esperando.
 */
export async function getConfirmedPhone(): Promise<string | null> {
  const client = requireSupabase();

  const { data, error } = await client.auth.getUser();
  if (error || !data.user?.phone || !data.user.phone_confirmed_at) return null;

  // O Auth guarda sem o `+`.
  const phone = data.user.phone;
  return phone.startsWith('+') ? phone : `+${phone}`;
}

/**
 * O que `link_patient_by_verified_phone` devolve (guia 5.12): a recusa vem no
 * `data` — `{ linked: false, error }` —, e não no `error`. É a exceção do guia:
 * se a recusa fosse exceção, o banco desfaria o registro da tentativa junto, e
 * o limite de tentativas nunca subiria.
 */
interface PatientLinkResult {
  linked: boolean;
  error: string | null;
}

function readPatientLinkResult(data: unknown): PatientLinkResult | null {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;

  const record = data as Record<string, unknown>;
  if (typeof record.linked !== 'boolean') return null;

  return { linked: record.linked, error: typeof record.error === 'string' ? record.error : null };
}

/**
 * Liga a conta da sessão à ficha da clínica pelo celular confirmado.
 *
 * É RPC, não escrita: `patients` não tem política de escrita para ninguém do
 * app. `link_patient_by_verified_phone` (guia 5.12, desde 29/09) exige sessão
 * e o celular confirmado por SMS; CPF e nascimento conferem contra a ficha.
 * Desde 29/09 é o ÚNICO jeito de o app ligar a conta à ficha: o código de
 * ativação do Centro saiu. Nada daqui fica guardado.
 */
export async function linkPatientByVerifiedPhone({
  cpf,
  birthDate,
}: PatientLinkInput): Promise<ApiSuccessResult> {
  // Com a data nula o banco deixa de conferir o nascimento e ligaria só pelo
  // CPF. O schema já barra data vazia; esta checagem garante que nenhum outro
  // chamador consiga mandá-la.
  if (!birthDate) {
    throw appError('Informe sua data de nascimento.');
  }

  const client = requireSupabase();

  const { data, error } = await client.rpc('link_patient_by_verified_phone', {
    p_cpf: cpf,
    p_birth_date: birthDate,
  });

  // Pelo `error` só chegam sessão ausente, rede e `PGRST202` (onde a migration
  // ainda não entrou). Recusa de dado vem no `data`.
  if (error) {
    throw appError(describePatientLinkError(error), error);
  }

  const result = readPatientLinkResult(data);
  if (!result) {
    throw appError('Não foi possível confirmar seu cadastro. Tente novamente em instantes.');
  }

  // "A conta já tem ficha" não é recusa: o guia manda seguir para a Home.
  if (result.linked || result.error === 'account_already_linked') {
    return { success: true };
  }

  // O código da recusa vira o `code` do erro: a tela decide o caminho por ele
  // (`phone_contested` leva ao convite; `phone_not_verified`, a um código novo).
  const code = result.error ?? 'link_refused';
  throw appError(describePatientLinkError({ message: code }), { code });
}

/**
 * Login federado (Google, Apple).
 *
 * NO APARELHO devolve `{ fullName }` com a sessão já pronta no cofre — o SDK
 * nativo abre o diálogo dentro do app e troca o token na hora, sem redirect
 * nenhum (ver `socialAuth.ts`). É a tela que decide o que fazer com o nome e
 * quando navegar, porque diferente do fluxo web não há reload que traga o
 * guard de rota de volta sozinho.
 *
 * NA WEB devolve `{}`: a função só entrega a pessoa ao provedor, e quem
 * termina o login é o retorno — o código volta na URL, `detectSessionInUrl`
 * do cliente o troca por sessão, e o `onAuthStateChange` da store aplica a
 * identidade. A tela não navega depois de chamar isto ali: ela some, e quem
 * decide o destino é o guard de rota quando o app recarrega.
 *
 * O fluxo web é PKCE (ver `supabaseClient`), então o token nunca trafega na
 * URL — só um código de uso único, trocado contra o verifier guardado no
 * cofre deste aparelho. Consequência aceita: o retorno precisa cair no MESMO
 * aparelho que iniciou.
 *
 * A conta nasce igual à do cadastro por e-mail: o trigger `trg_handle_new_auth_user`
 * cria a linha em `accounts` a partir do metadata do provedor. Conta nova não
 * vê ficha nenhuma até a clínica concluir o cadastro — o guard manda para
 * "sem vínculo", que é o mesmo caminho de quem se cadastra por e-mail.
 */
export async function signInWithProvider(provider: OAuthProvider): Promise<{ fullName?: string }> {
  // No aparelho o caminho é SEMPRE o nativo — nunca o redirect abaixo. Ele não
  // tem destino válido numa WebView Capacitor (ver `socialAuth.ts`): o GoTrue
  // devolveria o Site URL do projeto, que aqui é o painel clínico. Se o
  // provedor não estiver configurado para esta plataforma, o botão nem
  // aparece (ver `Login.tsx`) e `signInWithNativeProvider` ainda assim recusa
  // como rede de segurança — nunca cai no ramo abaixo por engano.
  if (Capacitor.isNativePlatform()) {
    return signInWithNativeProvider(provider);
  }

  const client = requireSupabase();

  const { error } = await client.auth.signInWithOAuth({
    provider,
    options: {
      // Volta para a raiz do app: o guard de rota decide o destino a partir da
      // identidade, então não há caminho melhor para fixar aqui. Precisa estar
      // na lista de "Redirect URLs" do projeto Supabase, senão o GoTrue recusa
      // e a pessoa cai numa página de erro fora do app.
      redirectTo: window.location.origin,
    },
  });

  if (error) throw appError(describeAuthError(error), error);
  return {};
}

/**
 * Grava o nome exibível da própria conta.
 *
 * Escrita DIRETA, e é o guia do banco que manda: `accounts` tem a política
 * `accounts_update_own` e um `GRANT UPDATE (full_name, phone)` — a concessão é
 * por coluna justamente para o titular não alcançar `is_active` nem `email`.
 * O guia prevê este caminho com todas as letras ("nome é opcional no signup —
 * colete-o depois, no onboarding, com o update de `accounts`").
 *
 * Não passa pelo Auth de propósito: `auth.updateUser({ data })` mexe só no
 * metadata e não dispara o trigger, que é `AFTER INSERT`. Quem manda em
 * `accounts.full_name` depois do cadastro é o próprio `accounts`.
 */
export async function updateAccountName(fullName: string): Promise<ApiSuccessResult> {
  const client = requireSupabase();

  const {
    data: { user },
  } = await client.auth.getUser();

  if (!user) throw appError('Sua sessão expirou. Entre novamente.');

  // O `.eq` não substitui a RLS (a política já limita à própria linha) — deixa
  // explícito de quem é a linha e impede um update sem cláusula.
  const { error } = await client
    .from('accounts')
    .update({ full_name: fullName.trim() })
    .eq('id', user.id);

  if (error) throw appError(describeIdentityError(error, 'seu nome'), error);

  return { success: true };
}

/**
 * Grava o celular da própria conta.
 *
 * Escrita DIRETA, como o nome (`updateAccountName`): `accounts` libera
 * `UPDATE (full_name, phone)` ao dono. O valor é o que a pessoa informou e
 * ainda não foi verificado por SMS — quem o confirma é o passo de verificação,
 * quando ele existir.
 */
export async function updateAccountPhone(phone: string): Promise<ApiSuccessResult> {
  const client = requireSupabase();

  const {
    data: { user },
  } = await client.auth.getUser();

  if (!user) throw appError('Sua sessão expirou. Entre novamente.');

  const { error } = await client.from('accounts').update({ phone }).eq('id', user.id);

  if (error) throw appError('Não foi possível salvar seu celular.', error);

  return { success: true };
}

/**
 * Envia o link de redefinição de senha.
 *
 * Nunca revela se o cadastro existe — o GoTrue responde sucesso mesmo para
 * endereço desconhecido, e nada aqui contradiz isso.
 *
 * @throws {Error} Se o identificador não for um e-mail, ou em falha de envio.
 */
export async function requestPasswordReset({
  identifier,
}: PasswordResetRequestInput): Promise<ApiSuccessResult> {
  const client = requireSupabase();
  const trimmed = identifier.trim();

  // A tela só aceita e-mail; esta checagem é a guarda para qualquer outro
  // chamador, porque recuperação por SMS não existe neste projeto — só TOTP
  // está habilitado. Avisar depende apenas do formato digitado, então não vaza
  // existência de cadastro; o contrário seria prometer um SMS que nunca chega.
  if (!looksLikeEmail(trimmed)) {
    throw appError(
      'Hoje o link de redefinição é enviado apenas por e-mail. Informe o e-mail do seu cadastro.'
    );
  }

  const { error } = await client.auth.resetPasswordForEmail(trimmed.toLowerCase(), {
    redirectTo: `${window.location.origin}${PASSWORD_RESET_REDIRECT_PATH}`,
  });

  if (error) throw appError(describeAuthError(error), error);

  return { success: true };
}

/**
 * Grava a nova senha. Exige a sessão de recuperação que o link do e-mail
 * estabelece (evento `PASSWORD_RECOVERY`) — ou uma sessão normal, no caso de
 * quem troca a senha já logado.
 */
export async function resetPassword({ password }: ResetPasswordInput): Promise<ApiSuccessResult> {
  const client = requireSupabase();

  const { error } = await client.auth.updateUser({ password });

  if (error) throw appError(describeAuthError(error), error);

  return { success: true };
}
