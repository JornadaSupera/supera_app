// Sessão: quem está logado, sair e a sessão guardada no aparelho. Fica separado
// do resto da autenticação porque roda na abertura do app (store da sessão e
// portão da biometria) — e assim a abertura não carrega o login social junto.
//
// Nenhuma página fala com o Supabase direto: toda leitura e escrita passa pelos
// serviços, sob a RLS da sessão, e devolve os formatos de `src/types/` — as telas
// não conhecem nome de coluna nem forma de embed.
import { isAuthSessionMissingError } from '@supabase/supabase-js';
import { appError } from '../lib/appError';
import { requireSupabase, supabase } from './supabaseClient';
import type { SessionIdentity } from '../types';

/**
 * Traduz a falha de uma leitura de identidade, preservando o código do
 * PostgREST na mensagem.
 *
 * O código fica visível de propósito: sem ele, "não foi possível carregar"
 * cobre igualmente banco sem schema, sessão recusada e permissão faltando —
 * três causas com três correções diferentes, indistinguíveis para quem
 * precisa consertar.
 */
export function describeIdentityError(error: { code?: string; message?: string }, target: string): string {
  switch (error.code) {
    case 'PGRST205':
    case '42P01':
      return `O banco de dados ainda não tem as tabelas do aplicativo (${error.code}). As migrations precisam ser aplicadas ao projeto.`;
    case '42501':
      // "recusou ler" e não "recusou a leitura d<alvo>": a segunda forma exige
      // contrair a preposição com o artigo do alvo, e como o alvo é texto livre
      // saíam "a leitura dsua conta" e "dseu cadastro". Este verbo aceita o
      // mesmo alvo do ramo `default` abaixo, sem colar preposição em nada.
      return `O banco recusou ler ${target} por falta de permissão (42501). O papel "authenticated" precisa de SELECT nessa tabela.`;
    case 'PGRST301':
    case 'PGRST302':
      return `Sua sessão não foi aceita pelo servidor (${error.code}). Entre novamente.`;
    default:
      return error.code
        ? `Não foi possível carregar ${target} (${error.code}). Tente novamente.`
        : `Não foi possível carregar ${target}. Verifique sua conexão e tente novamente.`;
  }
}

/**
 * Monta a identidade da sessão a partir das duas linhas que a definem:
 * `accounts` (quem autenticou) e `patients` (se essa conta é um paciente).
 *
 * Devolve `null` quando não há sessão — é o estado "anônimo", não um erro.
 * Falha de leitura **lança**, e a distinção entre as duas coisas é o ponto:
 * `null` significa "não há ninguém", não "não consegui perguntar".
 *
 * `patientId` vem `null` quando o cadastro ainda não foi vinculado à conta:
 * `my_own_patient_id()` exige `account_id` preenchido e as duas linhas ativas,
 * então a RLS simplesmente não devolve linha nenhuma. É o estado de quem
 * criou a conta e ainda não foi ligado ao cadastro de paciente — quem conclui
 * isso é a clínica, pelo painel.
 */
export async function getSessionIdentity(): Promise<SessionIdentity | null> {
  const client = requireSupabase();

  const {
    data: { user },
    error: userError,
  } = await client.auth.getUser();

  // `getUser` NÃO lança. Para qualquer falha — rede fora do ar, 5xx do
  // servidor de auth, 429 — ele devolve `{ user: null, error }`, exatamente a
  // mesma forma de "esta pessoa não está autenticada". Tratar os dois casos
  // igual derruba quem tem sessão válida no cofre por causa de uma oscilação:
  // `applyIdentity(null)` limpa o cache, desassocia o push e leva o status a
  // 'anonymous' — sem que nenhum `SIGNED_OUT` tenha acontecido.
  //
  // Logo depois da ativação isso é pior do que parece: a RPC já marcou o
  // convite como aceito e o convite é de uso único, então a pessoa cai na
  // tela de criar conta com o código já queimado, e só a clínica emite outro.
  //
  // Quem de fato diz "não há sessão" é `AuthSessionMissingError` — é o único
  // erro para o qual o próprio auth-js descarta a sessão local. Todo o resto
  // é falha de leitura, e falha se propaga: `refreshIdentity` já trata,
  // preservando o estado de quem estava dentro em vez de expulsá-lo.
  if (userError) {
    if (isAuthSessionMissingError(userError)) return null;
    throw appError(describeIdentityError(userError, 'sua conta'), userError);
  }

  if (!user) return null;

  // Marca de quem entrou com a senha provisória. `app_metadata` só o servidor
  // escreve.
  //
  // O VALOR É A STRING `'true'`, e não o booleano: é assim que
  // `create-caregiver` e `reset-caregiver-password` a gravam
  // (`app_metadata: { must_change_password: "true" }`), e é assim que
  // `complete-first-password` a lê antes de trocar a senha. O guia do banco §5.2
  // diz o mesmo ("leia `session.user.app_metadata.must_change_password`. Se for
  // `'true'`…"). Comparar com o booleano fazia a marca nunca valer: o
  // acompanhante não era mandado para a tela de troca e, como o banco não
  // entrega nada com o vínculo `pending`, ele caía em "sem vínculo" e ficava
  // preso. Os dois formatos são aceitos aqui, e nada mais — um texto qualquer
  // não trava a conta de ninguém.
  const passwordFlag = user.app_metadata?.must_change_password;
  const mustChangePassword = passwordFlag === true || passwordFlag === 'true';

  // Sequencial, não `Promise.all`: duas leituras concorrentes disparadas no
  // instante seguinte ao login (sessão recém-escrita) já se mostraram
  // suscetíveis a um PGRST303 ("JWT claims validation or parsing failed") em
  // uma das duas, com a outra passando normalmente no mesmo instante e com o
  // mesmo token — sintoma de corrida, não de token inválido. O custo de
  // serializar é mínimo (duas leituras de uma linha só) e remove a
  // concorrência como variável.
  //
  // O `.eq` abaixo não substitui a RLS (a política já limita à própria
  // linha) — serve para o `maybeSingle` continuar válido caso esta mesma
  // função algum dia rode sob um perfil que enxerga várias contas.
  const accountResult = await client
    .from('accounts')
    .select('id, full_name, email, phone, is_active')
    .eq('id', user.id)
    .maybeSingle();

  if (accountResult.error) {
    throw appError(describeIdentityError(accountResult.error, 'sua conta'), accountResult.error);
  }

  if (!accountResult.data) {
    // A conta nasce por trigger junto do usuário no Auth; não existir aqui
    // é inconsistência de dados, não falta de permissão (a política de
    // leitura da própria linha não olha `is_active`).
    throw appError('Sua conta não foi encontrada. Fale com a recepção do Centro.');
  }

  // Ficha PRÓPRIA, buscada pelo `account_id` e não por "a primeira que
  // aparecer". `patients_select_own` é `id = my_own_patient_id()`, e
  // `account_id` é UNIQUE: aqui vem no máximo uma linha.
  //
  // O `.eq` já não desempata com o tutelado — desde 25/09/2026 a política
  // `patients_select_caregiver` não existe mais, e o acompanhante lê o tutelado
  // por `get_my_ward()`. Ele continua aqui porque a consulta precisa dizer de
  // QUEM é a ficha, e porque um perfil que enxergue várias contas quebraria o
  // `maybeSingle` sem ele.
  const ownPatientResult = await client
    .from('patients')
    .select('id')
    .eq('account_id', user.id)
    .maybeSingle();

  if (ownPatientResult.error) {
    throw appError(describeIdentityError(ownPatientResult.error, 'seu cadastro'), ownPatientResult.error);
  }

  // Perfil de acompanhante. O `.eq` importa aqui: `caregivers_select_own`
  // limita à própria linha, mas as políticas de profissional e administrador
  // abrem a tabela inteira — sem o filtro, `maybeSingle` quebraria com
  // "múltiplas linhas" se esta função algum dia rodar sob esses perfis.
  //
  // Perfil ausente é o caso comum (o titular não é acompanhante de ninguém),
  // e por isso `maybeSingle` em vez de `single`.
  const caregiverResult = await client
    .from('caregivers')
    .select('id')
    .eq('account_id', user.id)
    .maybeSingle();

  if (caregiverResult.error) {
    throw appError(describeIdentityError(caregiverResult.error, 'seu perfil de acompanhante'), caregiverResult.error);
  }

  // A FICHA PRÓPRIA GANHA DO TUTELADO, e isso decide mais do que parece.
  //
  // `isCaregiver` não é "tem perfil de acompanhante": é "esta sessão está
  // agindo como acompanhante de `patientId`". Quem lê esse campo grava com ele
  // — `actingAs` no diário (`useDiary`) e o autor da mensagem (`useChat`). Numa
  // conta que é paciente e também acompanha alguém, devolver `true` junto da
  // ficha própria carimbaria como "acompanhante" um registro que o titular fez
  // sobre si mesmo: auditoria mentindo sobre quem escreveu.
  //
  // Por isso o titular vem primeiro e, quando vem, a sessão é de titular. O
  // acesso de acompanhante dessa conta fica inalcançável pelo app — é perda de
  // função, não de dado, e é o lado seguro de errar: nunca se abre a ficha de
  // outra pessoa sob uma identidade ambígua.
  //
  // Conta só de acompanhante não muda em nada: sem ficha própria, `patientId` é
  // o tutelado e `isCaregiver` é `true`, como sempre foi.
  if (ownPatientResult.data) {
    return {
      accountId: accountResult.data.id,
      patientId: ownPatientResult.data.id,
      fullName: accountResult.data.full_name,
      email: accountResult.data.email,
      phone: accountResult.data.phone,
      isAccountActive: accountResult.data.is_active,
      isCaregiver: false,
      mustChangePassword,
    };
  }

  // Sem ficha própria: o tutelado, se houver.
  //
  // `rpc('get_my_ward')`, e NÃO `.from('patients')`: em 25/09/2026 a política
  // `patients_select_caregiver` foi removida, e a leitura direta passou a
  // devolver `[]` para o acompanhante exatamente como para quem não tem vínculo
  // (`20260925165357_restrict_caregiver_patient_read.sql`). A RPC devolve o
  // tutelado com escopo em `private.my_ward_patient_ids()` — sem argumento, e
  // por isso sem como pedir o paciente de outra pessoa —, e vem VAZIA enquanto
  // o vínculo está `pending` e depois da revogação. `[]` é "sem tutelado", não
  // erro.
  const wardResult = await client.rpc('get_my_ward');

  if (wardResult.error) {
    throw appError(describeIdentityError(wardResult.error, 'o cadastro de quem você acompanha'), wardResult.error);
  }

  return {
    accountId: accountResult.data.id,
    patientId: wardResult.data?.[0]?.patient_id ?? null,
    fullName: accountResult.data.full_name,
    email: accountResult.data.email,
    phone: accountResult.data.phone,
    isAccountActive: accountResult.data.is_active,
    isCaregiver: caregiverResult.data !== null,
    mustChangePassword,
  };
}

/**
 * Encerra a sessão. Erro do servidor é ignorado de propósito: o `signOut` do
 * auth-js limpa a sessão local de qualquer forma, e falhar aqui deixaria o
 * usuário preso numa sessão que ele pediu para encerrar.
 */
export async function signOut(): Promise<void> {
  const client = requireSupabase();
  await client.auth.signOut();
}

/**
 * Diz se há uma sessão guardada no cofre, sem contatar o servidor.
 *
 * É o que torna a biometria honesta: confirmar a digital não cria sessão
 * nenhuma — ela apenas destrava o acesso a uma sessão que já existe. Sem
 * sessão guardada, não há o que destravar, e o atalho não deve ser oferecido.
 *
 * Devolve `false` (em vez de falhar) quando o cliente não está configurado:
 * para quem chama, "não dá para entrar por aqui" é a resposta correta nos
 * dois casos.
 */
export async function hasStoredSession(): Promise<boolean> {
  if (!supabase) return false;

  const { data } = await supabase.auth.getSession();
  return Boolean(data.session);
}
