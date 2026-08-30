# Guia do Banco — Jornada Supera

Para quem desenvolve o **App do paciente** e os **Painéis clínico e
administrativo**. Cobre o que existe **nestas migrations**. Se algo não está
aqui, não existe no banco.

> [!IMPORTANT] **Nada neste esquema se altera por conta própria.** Precisa de
> coluna, tabela, RPC, política ou índice novo? **Fale com o responsável pelo
> banco.** Tabela sem RLS, escrita direta onde deveria ser RPC, ou leitura
> clínica fora das funções `read_*` quebra sigilo entre especialidades,
> isolamento do paciente e a trilha de auditoria — que são **itens de aceite
> contratual**, não detalhe técnico. Um `alter table` improvisado não é bug: é
> incidente.

---

## 1. O essencial em um minuto

1. **RLS está ligada em tudo.** Você nunca filtra por usuário na query — o banco
   já filtra.
2. **Consulta negada devolve `[]`, não erro.** Lista vazia inesperada quase
   sempre é RLS, não bug de dados.
3. **Painel lê dado clínico por `.rpc('read_…')`, nunca por `.from()`.** Com
   `.from()` o painel recebe zero linhas, silenciosamente. O app do
   paciente/cuidador continua usando `.from()` normalmente.
4. **Quase toda escrita é RPC.** As exceções (diário, mensagem, conteúdo,
   bloqueio de agenda, preferências) estão listadas na seção 6.
5. **Dado clínico não se apaga nem se edita.** Registro salvo, mensagem e
   anotação são imutáveis. `DELETE` está revogado. Corrigir = criar registro
   novo.

---

## 2. Perfis e identidade

Uma conta autentica; um **perfil** diz o que ela é.

| Tabela          | O que é                                                                                                                                               |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `accounts`      | 1 linha por pessoa que autentica.**PK = `auth.users.id`** (o mesmo `auth.uid()`). Criada por trigger no signup, lendo `raw_user_meta_data.full_name`. |
| `patients`      | O paciente. Existe**antes** de ter conta (`account_id` fica `NULL` até ativar).                                                                       |
| `professionals` | O profissional. Vinculado a 1+ especialidades por`professional_specialties`.                                                                          |
| `admins`        | Administrador.                                                                                                                                        |
| `caregivers`    | Cuidador acompanhante. O perfil **nasce no aceite do convite**, não no cadastro.                                                                      |

**Regra dos dois `is_active`:** a conta precisa estar ativa **e** o perfil
precisa estar ativo. Desligar `accounts.is_active` revoga tudo na hora, em todos
os perfis.

### Como nasce cada perfil

**Signup cria conta, nunca perfil.** O trigger `trg_handle_new_auth_user` insere
**só** a linha em `accounts` (id, nome, e-mail, telefone) quando o usuário
aparece em `auth.users`. Perfil é concessão separada, e cada um tem seu caminho:

| Perfil          | Como nasce                                                                                    | Existe hoje?               |
| --------------- | --------------------------------------------------------------------------------------------- | -------------------------- |
| `caregivers`    | `accept_caregiver_invitation(p_token)` — o aceite do convite é o que torna a pessoa cuidadora | ✅                         |
| `admins`        | Bootstrap (só com a tabela vazia) ou`create_admin(p_account_id)`                              | ✅                         |
| `patients`      | —                                                                                             | ❌**sem caminho no banco** |
| `professionals` | —                                                                                             | ❌**sem caminho no banco** |

**Mande o nome no `options.data` do signup** — é de lá que o trigger lê:

```ts
const { data, error } = await supabase.auth.signUp({
  email: "maria@exemplo.com",
  password: senha,
  options: {
    data: { full_name: "Maria Silva" }, // ← vira raw_user_meta_data.full_name
    // phone só chega em accounts se for cadastrado no Auth (signUp com phone,
    // ou verificação de telefone). Mandá-lo aqui dentro NÃO preenche a coluna.
  },
});
```

O trigger lê **uma única chave** do metadata: `full_name`. `email` e `phone` ele
copia das colunas nativas de `auth.users`, não do `data`. Qualquer outra chave
que você mandar é ignorada por ele — fica em `raw_user_meta_data` e **não** vira
coluna de `accounts`.

- **Nome é opcional no signup.** `accounts.full_name` é `NULL`-ável de
  propósito: exigir o nome aqui faria o cadastro inteiro falhar quando ele não
  viesse. Nome em branco ou só espaços vira `NULL`, nunca string vazia —
  colete-o depois, no onboarding, com o `update` de `accounts` mostrado adiante.
- **O trigger é idempotente** (`ON CONFLICT (id) DO NOTHING`): conta já
  existente não é sobrescrita, e reenviar o signup não apaga o nome que o
  onboarding já corrigiu.
- **Corrigir o nome depois é pelo `accounts`, não pelo Auth.**
  `auth.updateUser({ data: {...} })` mexe só no metadata e **não** dispara este
  trigger (ele é `AFTER INSERT`, não `UPDATE`) — o nome em `accounts`
  continuaria o antigo. Use `.from('accounts').update({ full_name })`.

> [!note] ✏️ O que vai no `data` é escrito pelo próprio usuário
> `raw_user_meta_data` chega intacto do `/auth/v1/signup` — quem chama a API
> escolhe o conteúdo. Serve para nome e preferência de tela; **nunca** para
> papel, perfil ou qualquer coisa que decida acesso (ver o aviso sobre
> `app_metadata` adiante).

> [!warning] ⚠️ Paciente e profissional ainda não têm cadastro As quatro tabelas
> de perfil têm **apenas políticas de `SELECT`** e nenhum `GRANT` de escrita
> para `authenticated`. Não existe RPC de cadastro de paciente nem de
> profissional, e nenhuma política de INSERT: hoje essas linhas só entram por
> `service_role` (script/terminal) ou por migration. **A tela de cadastro do
> painel administrativo não tem como funcionar ainda** — não tente
> `.from('patients').insert(...)`, que devolve `permission denied`, e não
> contorne criando a conta e "pendurando" o perfil depois. Fale com o
> responsável pelo banco.

**Consequência para o app do paciente:** o fluxo é de **ativação**, não de
auto-cadastro. A linha em `patients` precisa existir antes (cadastro pela
clínica, no futuro espelhando o Gemed), com `account_id` em `NULL`; a pessoa
então cria a conta e alguém **liga as duas**. Esse último passo — o vínculo
`patients.account_id` ← `accounts.id` — **também ainda não tem RPC**.

Para descobrir quem é o usuário da sessão, o front consulta o próprio perfil:

```ts
const { data: { user } } = await supabase.auth.getUser();

// paciente
const { data: me } = await supabase.from("patients").select("id").single();
// profissional
const { data: prof } = await supabase.from("professionals")
  .select("id, professional_specialties(specialty_id)")
  .eq("account_id", user.id).single();
```

O único campo do próprio cadastro que o usuário edita é em `accounts`, e só duas
colunas:

```ts
await supabase.from("accounts").update({ full_name, phone }).eq("id", user.id);
```

`is_active`, e-mail e tudo em `patients` são **somente leitura** para o cliente.

### MFA — o que o cliente precisa tratar

O **TOTP (app autenticador) está habilitado** no projeto. SMS não. Estado atual
e o que ele exige de vocês:

- **O 2FA é obrigatório para o administrador** (contrato), **opcional** para
  paciente e profissional. Hoje o banco **ainda não exige**: nenhuma política
  olha o nível de garantia da sessão. Quando passar a exigir, o aviso vem com
  antecedência — não é mudança que se descobre em produção.
- **Sessão com fator cadastrado e não verificado é encerrada em 15 minutos.**
  Está ligado no projeto (_Limit duration of AAL1 sessions_). Vale para **todos
  os perfis**, inclusive o app do paciente: se a pessoa cadastrar um
  autenticador e não completar a verificação, a sessão cai sozinha. **Trate
  `TOKEN_REFRESHED`/`SIGNED_OUT` no `onAuthStateChange`** e leve para a tela de
  verificação — não para um erro genérico.
- Quem não tem fator cadastrado **não é afetado**: não há o que verificar.

O nível da sessão vem em `supabase.auth.mfa.getAuthenticatorAssuranceLevel()` —
`aal1` é só senha, `aal2` é segundo fator verificado.

### Como nasce um administrador

São **dois caminhos**, e o primeiro só existe uma vez.

**O primeiro admin (bootstrap).** `public.admins` não tem política de INSERT
para `authenticated`, então o acesso inicial vem de fora, pelo terminal — ver
`scripts/README.md`. O perfil é concedido por trigger
(`trg_handle_auth_user_confirmed`) quando o convidado **confirma o e-mail**, e
**só enquanto `public.admins` está vazia**. Depois disso o caminho fecha: a
mesma marca em `app_metadata` deixa de conceder qualquer coisa, inclusive para
`service_role`.

**Os demais.** `select public.create_admin('<account_id>')` — promove uma conta
**que já existe** a administrador. Exige admin ativo na sessão (`42501` caso
contrário) e é idempotente: promover duas vezes devolve o mesmo perfil. Criar o
usuário no Auth continua sendo do GoTrue, no servidor do painel; a RPC só
concede o perfil depois que a conta existe.

```
convite ──► confirma e-mail ──► (admins vazia?) ──► sim: bootstrap concede
                                                └─► não: nada. Use create_admin()
```

Duas consequências para o painel:

- **Entre o convite e o clique no link, existe conta sem perfil de admin.**
  `private.is_active_admin()` é `false` nesse intervalo. Um convidado pendente
  **não aparece** na lista de administradores — é esperado, não bug. A concessão
  pende da confirmação porque e-mail digitado errado não dá erro (o bounce é
  assíncrono): conceder no convite deixaria um administrador fantasma, perfil
  ativo que ninguém consegue usar, ocupando o endereço.
- **Perder todos os administradores não se resolve pelo produto.** A trava não
  olha `is_active` — admin desativado também mantém a porta fechada, senão quem
  desativa administradores reabriria o bootstrap. Recuperar exige migration
  nova, deliberada.

> [!warning] ⚠️ Marca de perfil vem de `app_metadata`, nunca de `user_metadata`
> `raw_user_meta_data` é escrito pelo próprio usuário — o `data` do
> `/auth/v1/signup` chega intacto na coluna. Nenhuma decisão de autorização pode
> sair dali. Vale para qualquer marca de perfil que venha a existir, não só a de
> admin.

Reativar conta ou perfil desligado é ato próprio — `set_account_active()` ou
painel. Nem o seed nem `create_admin()` religam alguém que um administrador
desligou.

### Quem pode PERDER o acesso de administrador

Duas regras, impostas por trigger no banco — valem para o painel, para SQL
direto e para `service_role`:

| Regra                      | Erro    | Quando                                                                              |
| -------------------------- | ------- | ----------------------------------------------------------------------------------- |
| **Ninguém se auto-remove** | `42501` | Um admin não desativa a própria conta nem o próprio perfil,**mesmo havendo outros** |
| **O último não cai**       | `23514` | Não se desativa nem se apaga o último administrador ativo, por caminho nenhum       |

A primeira não é sobre disponibilidade: mudança de acesso privilegiado é sempre
ato de outra pessoa, porque errar aqui **não tem desfazer** — perdido o próprio
acesso, ninguém se corrige a si mesmo. A segunda é sobre disponibilidade, e por
isso vale até para `service_role`: apagar o usuário no dashboard do Auth
cascateia até `admins` e **é barrado** ali.

O que o painel precisa tratar:

- **Desativar a si mesmo devolve `42501`.** A ação deveria nem ser oferecida ao
  usuário logado; se for, mostre a mensagem do `HINT` ("peça a outro
  administrador").
- **Desativar o último devolve `23514`.** Ofereça promover outro admin antes.
- **Não engessa o resto:** com dois ou mais ativos, um admin desativa outro
  normalmente, e mexer em admin **já inativo** sempre passa (é higiene, não
  remoção de acesso).

> [!warning] ⚠️ Perder todos os administradores exige migration As duas regras
> acima e a trava do bootstrap se apoiam: como o bootstrap não reabre com a
> tabela não-vazia, um sistema sem admin ativo não se recupera pelo produto. É
> por isso que a proteção vale inclusive para `service_role` — ela é a única
> coisa entre uma operação de rotina e um painel administrativo inacessível.

---

## 3. `.rpc()` em vez de `.from()` — o pedágio de auditoria

Toda leitura de dado clínico **pela equipe** (profissional e administrador) é
registrada em `audit_log`: quem leu, quando, de qual paciente, quantas linhas.
Isso é exigência de LGPD e item de aceite. Para que o log seja **inescapável**,
as políticas de leitura da equipe não valem para o role normal do PostgREST —
valem só dentro das funções `read_*`.

**Consequência prática:**

```ts
// PAINEL — errado: devolve [] sempre, sem erro nenhum
await supabase.from("diary_entries").select("*").eq("patient_id", id);

// PAINEL — certo
await supabase.rpc("read_diary_entries", { p_patient_id: id, p_limit: 50 });
```

```ts
// APP DO PACIENTE / CUIDADOR — certo, lê direto
await supabase.from("diary_entries").select("*").order("entry_date", {
  ascending: false,
});
```

O retorno de `read_*` é uma tabela, então dá para encadear `.select()` e filtros
do PostgREST por cima. A ordenação e o teto de linhas já vêm da função.

### As funções `read_*`

| Função                          | Parâmetros                                  | Serve a                                                             |
| ------------------------------- | ------------------------------------------- | ------------------------------------------------------------------- |
| `read_patients`                 | `p_limit=50, p_offset=0`                    | Lista de pacientes (teto 200)                                       |
| `read_patient`                  | `p_patient_id`                              | Ficha do paciente                                                   |
| `read_patient_diagnoses`        | `p_patient_id`                              | CIDs do paciente                                                    |
| `read_patient_clinical_history` | `p_patient_id`                              | Alergias e reações prévias                                          |
| `read_treatment_plans`          | `p_patient_id`                              | Protocolo e ciclo                                                   |
| `read_diary_entries`            | `p_patient_id, p_limit=50, p_before`        | Timeline do diário (só`saved`)                                      |
| `read_diary_symptom_reports`    | `p_diary_entry_id`                          | Sintomas de um registro                                             |
| `read_specialty_notes`          | `p_patient_id, p_limit=50, p_before`        | Anotações da equipe                                                 |
| `read_specialty_flags`          | `p_patient_id`                              | Sinalizações (sem conteúdo)                                         |
| `read_conversations`            | `p_patient_id=null, p_limit=50, p_offset=0` | Lista de conversas                                                  |
| `read_messages`                 | `p_conversation_id, p_limit=50, p_before`   | Mensagens                                                           |
| `read_conversation_assignments` | `p_conversation_id`                         | Histórico de quem atendeu                                           |
| `read_message_attachments`      | `p_conversation_id`                         | Anexos do chat (**única forma de a equipe obter o `storage_path`**) |
| `read_appointments`             | `p_patient_id, p_from, p_to, p_limit=100`   | Agenda de um paciente                                               |
| `read_my_agenda`                | `p_from, p_to`                              | Agenda do profissional logado, atravessando pacientes               |

`p_before` é paginação por chave (passe o `created_at`/`submitted_at` do último
item), não offset. Todas têm teto de 200 linhas no servidor.

### O que **não** paga pedágio (leitura direta com `.from()`, para todos)

Agenda do próprio paciente, orientações, perfil, notificações, identidade
(`accounts`, `professionals`, `patient_caregivers`), auditoria (só admin) e
**todos os catálogos**:

`specialties` · `professional_specialties` · `cid10` · `treatment_phases` ·
`symptoms` · `content_categories` · `content_cid10` · `conversation_subjects` ·
`appointment_types` · `appointment_statuses` · `appointment_status_reasons` ·
`notification_types` · `legal_document_versions` (só a vigente, para quem não é
admin)

---

## 4. Quem enxerga o quê

|                                                         | Paciente          | Cuidador                | Profissional                     | Admin             |
| ------------------------------------------------------- | ----------------- | ----------------------- | -------------------------------- | ----------------- |
| Próprios dados clínicos                                 | ✅ direto         | ✅ direto (do tutelado) | —                                | —                 |
| Ficha, diário, plano, agenda, chat de qualquer paciente | —                 | —                       | ✅ via`read_*`                   | ✅ via`read_*`    |
| Anotação de especialidade (`specialty_notes`)           | ❌                | ❌                      | `team` + a própria especialidade | só`team`          |
| Conteúdo de**Psicologia** (nota, conversa, compromisso) | —                 | —                       | só a Psicologia                  | ❌ nunca          |
| Sinalização de sofrimento (`specialty_flags`)           | ❌                | ❌                      | ✅ todos                         | ❌                |
| Bloqueio pessoal de agenda (`professional_blocks`)      | ❌                | ❌                      | só o dono                        | ❌                |
| Favoritos/lidos de orientação                           | só o titular      | ❌                      | ❌                               | ❌                |
| Notificações                                            | só o destinatário | só o destinatário       | só o destinatário                | só o destinatário |
| `audit_log`                                             | ❌                | ❌                      | ❌                               | ✅                |

**Sigilo da Psicologia é automático.** Nota, conversa ou compromisso roteado
para uma especialidade marcada como confidencial vira
`visibility = 'specialty_restricted'` por trigger — e some da lista das outras
áreas e da administração. Não é o conteúdo que se esconde: é a linha. O
front-end não precisa (e não deve) implementar nada disso.

---

## 5. Guia por módulo

### 5.1 Diário de sintomas — `diary_entries`, `diary_symptom_reports`, `symptoms`

Fluxo: cria **rascunho** → marca sintomas (0–5) → **finaliza**. Rascunho é
invisível para a equipe.

```ts
// 1. abre o rascunho
const { data: entry } = await supabase.from("diary_entries").insert({
  patient_id: myPatientId,
  authored_by: user.id,
  acting_as: "patient", // ou 'caregiver' quando o cuidador registra
  free_text: "Como me senti hoje…",
}).select().single();

// 2. marca sintomas (1 linha por sintoma; regravar o mesmo sintoma é UPDATE)
await supabase.from("diary_symptom_reports")
  .insert({ diary_entry_id: entry.id, symptom_id, grade: 3 });

// 3. finaliza — os DOIS campos juntos, sempre
await supabase.from("diary_entries")
  .update({ status: "saved", submitted_at: new Date().toISOString() })
  .eq("id", entry.id);
```

- `status: 'saved'` **sem** `submitted_at` → `check_violation`. Os dois andam
  juntos.
- Depois de `saved`, o registro e seus sintomas são **imutáveis**. Correção =
  registro novo.
- Desmarcar sintoma (`DELETE`) só funciona enquanto o pai é rascunho — é o único
  `DELETE` liberado no projeto inteiro.
- `entry_date` tem default no fuso de Chapecó; só mande explicitamente se
  estiver registrando um dia passado.
- `acting_as` aparece na tela do profissional. Não é log: é campo de tela.

### 5.2 Cuidador acompanhante

Ciclo inteiro por RPC. **Um cuidador ativo por paciente.**

| RPC                                            | Quem chama        | Retorno                    |
| ---------------------------------------------- | ----------------- | -------------------------- |
| `invite_caregiver(p_channel, p_destination)`   | titular           | `{ invitation_id, token }` |
| `cancel_caregiver_invitation(p_invitation_id)` | titular           | —                          |
| `accept_caregiver_invitation(p_token)`         | a conta convidada | `link_id`                  |
| `revoke_caregiver_link(p_link_id)`             | titular           | —                          |

`p_channel` é `'sms'` ou `'email'`.

> **O `token` volta em texto puro uma única vez e nunca mais.** O banco guarda
> só o hash. Entregue-o na hora (deep link / SMS / e-mail) — não há como
> reemitir. Nunca persista o token em log, storage local ou estado que sobreviva
> à sessão.

O convite **não expira**. A revogação pelo titular é o único freio, e é
instantânea: a próxima query do cuidador já nega.

Leitura: o titular vê seus convites e vínculos; o cuidador vê só os vínculos
dele (`.from('patient_caregivers')`); a equipe vê o vínculo para exibir o
contato na ficha.

### 5.3 Ficha clínica e tratamento

| RPC                                                                                                      | Quem               | O que faz                                                              |
| -------------------------------------------------------------------------------------------------------- | ------------------ | ---------------------------------------------------------------------- |
| `upsert_patient_diagnosis(p_patient_id, p_cid10_id, p_staging?, p_tnm?, p_diagnosed_on?, p_is_primary?)` | profissional/admin | Adiciona CID;`is_primary` desmarca o anterior                          |
| `add_patient_clinical_history(p_patient_id, p_kind, p_description)`                                      | profissional/admin | `p_kind`: `'allergy'` \| `'prior_reaction'`                            |
| `set_treatment_plan(p_patient_id, p_protocol_name, p_cycles_planned?, p_intent?, p_started_on?)`         | profissional/admin | Encerra o plano vigente e abre o novo, atomicamente                    |
| `set_treatment_phase(p_patient_id, p_phase_code)`                                                        | profissional/admin | `p_phase_code`: `ativo` \| `remissao` \| `seguimento` \| `finalizacao` |

Plano vigente = a linha com `ended_on IS NULL`. Ciclo é `current_cycle_number`
(ordinal), não tabela.

**LGPD, do lado do app:**

| RPC                                                            | Quem                                                                                |
| -------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `accept_legal_terms()`                                         | qualquer conta — aceita todas as versões vigentes, idempotente                      |
| `revoke_consent(p_consent_id)`                                 | **só o titular** (nunca o cuidador)                                                 |
| `request_data_subject_action(p_request_type)`                  | titular —`access`, `rectification`, `portability`, `consent_revocation`, `deletion` |
| `decide_data_subject_request(p_request_id, p_status, p_note?)` | admin — só`'granted'` ou `'refused'`                                                |

`legal_document_versions` com `is_current = true` é o texto a exibir antes do
aceite.

**Painel administrativo — contas e vínculo externo:**

| RPC                                             | O que faz                                                                                                                                                                               |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `set_account_active(p_account_id, p_is_active)` | Ativa/desativa a conta.**É a revogação de acesso**: vale para todos os perfis, na hora, e desativa os aparelhos de push junto. Ninguém edita o próprio `is_active`.                     |
| `confirm_external_link(p_ref_id, p_confirm)`    | Confirma ou rejeita o vínculo de um cadastro com a origem externa. Exige conferência humana antes (`external_refs` é invisível ao cliente). Só faz sentido quando a integração existir. |

### 5.4 Anotação clínica — `specialty_notes`, `specialty_flags`

Escrita **direta**, leitura por `read_*`. O profissional só escreve na própria
especialidade.

```ts
await supabase.from("specialty_notes").insert({
  patient_id,
  origin_specialty_id: minhaEspecialidadeId, // tem que ser uma das minhas
  author_professional_id: meuProfessionalId,
  authored_by: user.id,
  body: "Texto da anotação.",
  // supersedes_note_id: idDaNotaAnterior  ← para corrigir
});
```

- A nota é **imutável**. Corrigir = nota nova apontando para a anterior por
  `supersedes_note_id` (uma correção por nota).
- Nota da Psicologia nasce restrita automaticamente, mesmo que você mande
  `visibility: 'team'`.
- **Sinalizar sofrimento:** `rpc('raise_specialty_flag', { p_source_note_id })`.
  Só sobre nota do próprio autor. O sinal diz que existe, de qual especialidade,
  sobre qual paciente e quando — **nunca o conteúdo nem a nota de origem**. É o
  que a equipe inteira enxerga sem ver a sessão de psicologia.

### 5.5 Orientações (conteúdo educativo)

Duas camadas: `content_items` (identidade estável) e `content_versions` (título,
corpo, mídia e **estado**).

**Workflow:** `draft` → `in_review` → `published` \| `returned` \| `rejected`;
`published` → `archived`. Só existe **uma** versão publicada e **uma** em
revisão por orientação.

Autor (profissional), escrita direta:

```ts
// item — categoria precisa ser da minha especialidade (ou sem especialidade, ex. Medicação Oral)
const { data: item } = await supabase.from("content_items").insert({
  category_id,
  author_professional_id: meuProfessionalId,
  authored_by: user.id,
}).select().single();

// versão — version_no é atribuído pelo banco; nasce sempre em draft
await supabase.from("content_versions").insert({
  content_item_id: item.id,
  title,
  body,
  media_kind: "text", // 'text' | 'video' | 'pdf'
  created_by_professional_id: meuProfessionalId,
  created_by: user.id,
});

// submeter para revisão
await supabase.from("content_versions").update({ status: "in_review" }).eq(
  "id",
  versionId,
);
```

Revisor (admin):
`rpc('review_content_version', { p_content_version_id, p_action, p_comment })`.
`p_action`: `approve` \| `return` \| `reject` \| `unpublish`. **`return` e
`reject` exigem comentário.** Aprovar arquiva a versão anterior sozinho.

Marcação por CID (`content_cid10`) define quem vê. **Sem nenhuma linha de CID =
conteúdo universal**, visível a todos os pacientes. Com CID, só quem tem aquele
diagnóstico.

Paciente/cuidador leem `content_items` e `content_versions` com `.from()` e
recebem **apenas o publicado e elegível** — a regra roda no banco. Favorito e
lido:

```ts
await supabase.from("patient_content_states").upsert({
  patient_id: myPatientId,
  content_item_id,
  is_favorite: true,
  read_at: new Date().toISOString(),
});
```

Vídeo é **embed** (`video_url`), aceito só de YouTube/Vimeo em `https`. Nunca
upload.

### 5.6 Chat — `conversations`, `messages`, `message_attachments`

| RPC                                                              | Quem                 | O que faz                                |
| ---------------------------------------------------------------- | -------------------- | ---------------------------------------- |
| `start_conversation(p_subject_id, p_body)`                       | paciente/cuidador    | Abre a conversa**e** grava a 1ª mensagem |
| `claim_conversation(p_conversation_id)`                          | profissional         | Assume conversa não roteada (fila geral) |
| `transfer_conversation(p_conversation_id, p_to_professional_id)` | profissional da área | Encaminha e grava a mensagem automática  |
| `resolve_conversation(p_conversation_id)`                        | profissional da área | Marca como resolvida                     |
| `mark_conversation_read(p_conversation_id)`                      | todos                | Marca d'água de leitura                  |

Mensagem é **`.insert()` direto** (é caminho quente demais para RPC):

```ts
// paciente
await supabase.from("messages").insert({
  conversation_id,
  author_kind: "patient",
  author_account_id: user.id,
  body,
});
// profissional
await supabase.from("messages").insert({
  conversation_id,
  author_kind: "professional",
  author_account_id: user.id,
  author_professional_id: meuProfessionalId,
  body,
});
```

- Só se escreve em conversa **`open`**.
- O profissional só responde conversa **da especialidade dele**. Conversa não
  roteada precisa de `claim_conversation` antes.
- Mensagem é **imutável**: sem edição, sem exclusão.
- `author_kind: 'system'` é gerado pelo banco na transferência. Não insira.
- Hoje **toda conversa nasce não roteada** — o mapa assunto → especialidade está
  vazio de propósito. A fila geral é
  `origin_specialty_id IS NULL AND status = 'open'`.

`team_last_read_at` diz ao paciente **que** a equipe leu, nunca **quem**.

### 5.7 Agenda — `appointments`, `professional_blocks`

Compromisso: **leitura** por `.from()` (paciente/cuidador) ou
`read_appointments`/`read_my_agenda` (equipe); **escrita** só por RPC.

| RPC                                                                                                                                                                                                                  | Quem                                                                  |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `schedule_appointment(p_patient_id, p_appointment_type_id, p_title, p_starts_at, p_ends_at, p_location_label, p_professional_id?, p_origin_specialty_id?, p_patient_notes?, p_location_address?, p_location_phone?)` | profissional                                                          |
| `reschedule_appointment(p_appointment_id, p_starts_at, p_ends_at, p_reason_id?)`                                                                                                                                     | profissional — cria a linha nova e encerra a antiga como`rescheduled` |
| `set_appointment_status(p_appointment_id, p_status_code, p_reason_id?)`                                                                                                                                              | profissional —`completed`, `cancelled`, `no_show`                     |
| `confirm_appointment(p_appointment_id)`                                                                                                                                                                              | **titular ou cuidador**, só antes do início                           |
| `unconfirm_appointment(p_appointment_id)`                                                                                                                                                                            | titular ou cuidador                                                   |

- **Não existe UPDATE de horário.** Remarcar é `reschedule_appointment` — o
  relatório de adesão conta remarcações.
- Estado terminal (`completed`, `cancelled`, `no_show`, `rescheduled`) não
  transiciona mais.
- Sair de `scheduled` limpa a confirmação sozinho.
- `patient_notes` é texto **exibido ao paciente**. Conteúdo clínico vai em
  `specialty_notes`.
- **Bloqueio pessoal** (`professional_blocks`) é escrita e leitura diretas do
  próprio dono, fora do clínico. O painel monta o calendário unindo
  `read_my_agenda` + `.from('professional_blocks')`.

### 5.8 Notificações — `notifications`, `notification_preferences`, `device_tokens`

`notifications` é a caixa de entrada do destinatário. **A linha não tem texto**:
o título vem de `notification_types.label` e a prévia é montada no cliente a
partir do que ele já lê.

```ts
// caixa de entrada
await supabase.from("notifications")
  .select("*, notification_types(label, category, icon_name)")
  .is("archived_at", null).order("created_at", { ascending: false });

// marcar lida / arquivar — só estas duas colunas
await supabase.from("notifications").update({
  read_at: new Date().toISOString(),
}).eq("id", id);

// push
await supabase.rpc("register_device_token", {
  p_token: fcmToken,
  p_platform: "android",
});
await supabase.rpc("unregister_device_token", { p_token: fcmToken });
```

Preferências (`notification_preferences`) são escrita direta do dono: matriz
`type_id × channel`, mais janela de silêncio (`quiet_hours_start`/`end`,
interpretada no fuso de `accounts.time_zone`). **Sem linha = recebe por todos os
canais.** A janela **atrasa** o envio, nunca cancela.

> `critical_alert` é insilenciável **por chave estrangeira**. Tentar criar
> preferência para ele falha com violação de FK (`23503`) — não é bug, é o
> desenho. Esconda o toggle na UI.

---

## 6. Escrita direta vs. RPC — a lista fechada

**Só isto aceita `.insert()` / `.update()` / `.upsert()` direto:**

| Tabela                                 | Verbos                              | Por quem                                 |
| -------------------------------------- | ----------------------------------- | ---------------------------------------- |
| `accounts`                             | UPDATE (`full_name`, `phone`)       | o dono                                   |
| `diary_entries`                        | INSERT, UPDATE (rascunho)           | titular e cuidador                       |
| `diary_symptom_reports`                | INSERT, UPDATE, DELETE (rascunho)   | titular e cuidador                       |
| `messages`                             | INSERT                              | paciente, cuidador, profissional da área |
| `message_attachments`                  | INSERT                              | autor da mensagem                        |
| `specialty_notes`                      | INSERT                              | profissional, na própria especialidade   |
| `content_items`                        | INSERT, UPDATE (`category_id`)      | autor                                    |
| `content_versions`                     | INSERT, UPDATE (conteúdo +`status`) | autor, em`draft`/`returned`              |
| `content_cid10`, `content_attachments` | ALL                                 | autor                                    |
| `patient_content_states`               | ALL                                 | só o titular                             |
| `professional_blocks`                  | ALL                                 | só o dono                                |
| `notifications`                        | UPDATE (`read_at`, `archived_at`)   | destinatário                             |
| `notification_preferences`             | ALL                                 | dono                                     |

**Todo o resto é RPC.** Tentar `.insert()` fora desta lista devolve
`permission denied` ou `violates row-level security policy` — nunca funciona
"por acaso".

---

## 7. Storage — anexos

Dois buckets **privados**, ambos 20 MiB por arquivo:

| Bucket                | Tipos                                                      | Caminho obrigatório              |
| --------------------- | ---------------------------------------------------------- | -------------------------------- |
| `content-attachments` | `application/pdf`, `image/png`, `image/jpeg`, `image/webp` | `<content_version_id>/<arquivo>` |
| `chat-attachments`    | `image/png`, `image/jpeg`, `image/webp`, `application/pdf` | `<message_id>/<arquivo>`         |

**A ordem é obrigatória e não é convenção — é privilégio:**

```ts
// SUBIR: registra a linha PRIMEIRO, depois sobe o arquivo
const path = `${messageId}/${file.name}`;
await supabase.from("message_attachments")
  .insert({
    message_id: messageId,
    storage_path: path,
    mime_type: file.type,
    byte_size: file.size,
  });
await supabase.storage.from("chat-attachments").upload(path, file);

// REMOVER: apaga o arquivo PRIMEIRO, depois a linha
await supabase.storage.from("chat-attachments").remove([path]);
await supabase.from("message_attachments").delete().eq("storage_path", path);
```

Sem a linha registrada, o upload é **negado**. Sem remover o arquivo antes, o
`delete` da linha falha com `foreign_key_violation` — para nunca existir arquivo
órfão no bucket.

Quem lê o arquivo é exatamente quem lê a linha correspondente. O painel obtém o
`storage_path` do chat **só** por `read_message_attachments` — e essa chamada é
a trilha.

---

## 8. Realtime

Na publication: `messages`, `conversations`, `message_attachments`,
`notifications`.

| Quem                            | Recebe em tempo real                       |
| ------------------------------- | ------------------------------------------ |
| App do paciente / cuidador      | mensagens, conversas, anexos, notificações |
| Painel clínico / administrativo | **só `notifications`**                     |

O painel não recebe `messages` — isso é decisão de projeto, não limitação. A
lista de conversas se atualiza por `read_conversations` (barata, já ordenada por
`last_message_at`), e o sinal em tempo real chega pela notificação, que não
carrega conteúdo clínico.

`appointments` **não** está no Realtime.

```ts
supabase.channel("inbox").on("postgres_changes", {
  event: "INSERT",
  schema: "public",
  table: "notifications",
}, ({ new: n }) => refetch()).subscribe();
```

---

## 9. Erros comuns e o que significam

| Sintoma                                      | Causa provável                                                                                                 | O que fazer                                      |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| `[]` no painel, dados existem                | `.from()` em tabela clínica                                                                                    | Trocar por`.rpc('read_…')`                       |
| `new row violates row-level security policy` | `WITH CHECK` reprovou: `patient_id`/`authored_by`/`author_*` não batem com o usuário, ou a linha pai não é sua | Conferir os campos de autoria enviados           |
| `permission denied for table X`              | Verbo revogado nessa tabela                                                                                    | É RPC, não escrita direta (seção 6)              |
| `permission denied for function X`           | Chamando RPC sem`EXECUTE` para o seu perfil                                                                    | Perfil errado, ou a função não é do cliente      |
| `check_violation`                            | Trigger de imutabilidade ou máquina de estados                                                                 | Registro já finalizado / transição não permitida |
| `23505` (unique)                             | Já existe: cuidador ativo, plano vigente, versão publicada, sintoma já marcado                                 | Ler o estado antes                               |
| `23503` (FK)                                 | Ex.: preferência para`critical_alert`                                                                          | Insilenciável por desenho                        |
| `forbidden` (42501)                          | RPC chamada por perfil errado                                                                                  | Verificar perfil/especialidade                   |
| `PGRST202` (função não encontrada)           | Nome do parâmetro errado                                                                                       | Os nomes têm prefixo`p_` e batem exatamente      |

Enums vão como **string** no JSON: `{ p_channel: 'sms' }`,
`{ acting_as: 'patient' }`.

---

## 10. Convenções que valem em todas as tabelas

- **PK** `uuid` v7 (ordenado no tempo) — gerado pelo banco, nunca pelo cliente.
- **Datas** sempre `timestamptz`. Mande ISO com offset; leia convertendo para o
  fuso local.
- **`created_at` / `updated_at`** existem quando fazem sentido. `updated_at` é
  do banco — não mande.
- **Estados** são enums ou tabelas de domínio com `code`/`label`. Renderize o
  `label`, filtre pelo `code`, guarde o `id`.
- **Vocabulário se aposenta com `is_active = false`, nunca se apaga.** Filtre
  por `is_active` nos seletores; não filtre em histórico.
- **Sempre filtre por `patient_id`** nas listas clínicas — os índices são por
  paciente + tempo. Exceção única: `read_my_agenda`.
- **Paginação** por chave (`p_before`), não por offset, onde a função oferece.

---

## 11. O que ainda não existe

Não é esquecimento — depende de definição pendente da clínica ou de fornecedor
externo. **Não improvise no front-end** e não crie tabela paralela para
contornar: fale com o responsável pelo banco.

| Não dá para fazer hoje                     | Situação                                                                                                                                       |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| **Alerta de sintoma crítico**              | Não há tabela de alerta, regra de criticidade nem fila. O tipo de notificação`critical_alert` existe, mas nada o produz.                       |
| **Notificação automática**                 | A caixa, as preferências, o registro de aparelho e a fila de envio existem — mas**nenhum evento gera notificação ainda**. A caixa nasce vazia. |
| **Integração Gemed**                       | Nada sincroniza. Diagnóstico e plano entram por RPC manual; as colunas de origem/sync existem e ficam em`local`.                               |
| **NPS**                                    | Não existe.                                                                                                                                    |
| **Relatórios e estatísticas**              | Não há view nem RPC de agregação.                                                                                                              |
| **Roteamento automático de conversa**      | O mapa assunto → especialidade está vazio; tudo cai na fila geral.                                                                             |
| **Motivos de falta/cancelamento**          | `appointment_status_reasons` está vazia; `p_reason_id` fica `NULL`.                                                                            |
| **Cor e ícone de tipo de compromisso**     | Nascem`NULL`; a clínica ainda não definiu.                                                                                                     |
| **Paciente ler anotações da equipe**       | Sem política — decisão pendente.                                                                                                               |
| **Cadastro de paciente e de profissional** | As tabelas de perfil só têm política de`SELECT`. Não há RPC nem INSERT para `authenticated`: entram por `service_role` ou migration.           |
| **Vincular conta a paciente**              | Sem RPC para preencher`patients.account_id`. A ativação do app depende dela.                                                                   |
| **Permissões granulares por profissional** | Catálogo`permissions` vazio: hoje todo profissional ativo tem o mesmo alcance.                                                                 |
| **URL assinada de anexo**                  | Download é pela Storage API sob RLS. Não há emissor de link.                                                                                   |

---

## 12. Mapa das migrations

| Arquivo                                 | O que estabelece                                                            |
| --------------------------------------- | --------------------------------------------------------------------------- |
| `add_extensions`                        | `citext`, `pgcrypto`                                                        |
| `add_shared_functions`                  | UUIDv7,`set_updated_at`, `get_my_uid`                                       |
| `create_identity_core`                  | Contas, perfis, especialidades, permissões e**toda a base de RLS**          |
| `fix_has_permission_account_level`      | Correção: revogação vale nos dois níveis de`is_active`                      |
| `create_caregiver_links`                | Convite, vínculo e revogação do cuidador                                    |
| `create_patient_clinical`               | Ficha, CID-10, alergias, consentimento e direitos LGPD                      |
| `create_treatment_plans` + `validate_…` | Protocolo, ciclo e fase do tratamento                                       |
| `create_diary_entries`                  | Diário de sintomas e os 12 sintomas                                         |
| `create_clinical_read_audit`            | **`audit_log` e as funções `read_*`** — origem da regra da seção 3          |
| `create_specialty_notes`                | Anotação da equipe e sinalização sem conteúdo                               |
| `create_content_library`                | Orientações, versionamento e workflow de publicação                         |
| `create_content_storage` + `validate_…` | Bucket`content-attachments`                                                 |
| `create_conversations`                  | Chat, atribuições e Realtime                                                |
| `create_chat_attachments`               | Bucket`chat-attachments`                                                    |
| `create_appointments`                   | Agenda, tipos, estados e bloqueio pessoal                                   |
| `create_notifications`                  | Caixa de entrada, preferências, aparelhos e fila de envio                   |
| `revoke_anon_access`                    | Fecha a superfície de`anon`: nenhuma função nem tabela alcançável sem login |
| `bootstrap_first_admin`                 | Bootstrap do primeiro admin (só com`admins` vazia) e `create_admin()`       |
| `protect_last_admin`                    | Impede auto-remoção de admin e a remoção do último ativo                    |

Cada arquivo abre com o racional da decisão em comentário. **Quando algo parecer
estranho, o motivo está escrito lá em cima** — e quase sempre é uma regra de
sigilo ou de auditoria que o front-end não deve contornar.

---

> **Mudança de esquema é sempre pelo responsável pelo banco.** Coluna nova,
> tabela nova, RPC nova, política nova, índice novo, ou "só um `select` direto
> para destravar" — abra o pedido. Toda regra deste guia existe para proteger
> isolamento do paciente, sigilo entre especialidades e trilha de auditoria, que
> são obrigação contratual e legal. Contornar no cliente não resolve: transfere
> o risco para onde ele não pode ser verificado.
