# Guia do Banco — Jornada Supera

Para quem desenvolve o **App do paciente** e os **Painéis clínico e administrativo**.
Cobre o que existe **nestas migrations**. Se algo não está aqui, não existe no banco.

> [!IMPORTANT]
> **Nada neste esquema se altera por conta própria.** Precisa de coluna, tabela, RPC, política
> ou índice novo? **Fale com o responsável pelo banco.** Tabela sem RLS, escrita direta onde
> deveria ser RPC, ou leitura clínica fora das funções `read_*` quebra sigilo entre
> especialidades, isolamento do paciente e a trilha de auditoria — que são **itens de aceite
> contratual**, não detalhe técnico. Um `alter table` improvisado não é bug: é incidente.

---

## O que mudou em 25/09/2026, e o que cada front-end precisa fazer

Em 25/09/2026 o banco ganhou **34 migrations** e **cinco Edge Functions**. Todas já estão em
homologação. Esta seção lista o que muda para cada front-end. O detalhe está na seção indicada; aqui fica só o que
**quebra**, o que **passa a existir** e o que **foi decidido**.

### Homologação aceita escrita, só com dado sintético

O projeto de homologação `feirxltaqjemfdjajmsw` ("Jornada Supera - Oncologia", `sa-east-1`) está
**liberado para gravar**, com três condições:

- **Só dado sintético.** Nenhum paciente, profissional ou documento real: homologação e produção
  ainda não estão separadas, e o contrato exige homologar com dado sintético ou anonimizado.
- **Pelo caminho de produção.** Usuário autenticado, sob RLS, pelas RPCs e pela lista fechada da
  seção 6. **A chave `service_role` não vai para o front-end.**
- **O esquema muda só por migration do banco.** Nada de DDL pelo dashboard nem pelo SQL editor.

A liberação vale só para homologação. Gravar em produção, quando ela existir, é decisão nova.

### ⚠️ O que quebra: mude antes de testar

| Quem | O que era | O que é agora | Seção |
|---|---|---|---|
| **Painel** | `rpc('read_patients')` | **Removida.** Responde `PGRST202`. Use `read_patient_list`, que traz `created_at` e o total | 5.14 |
| **Painel** | `read_patient` devolvia CPF, telefone e e-mail completos | Vêm **mascarados**, e `documents` vem `null`. O valor completo sai de `reveal_patient_identifiers`, que deixa linha na trilha. `update_patient` recusa valor com `*` | 5.12 |
| **App do acompanhante** | `.from('patients')` trazia o tutelado | **Devolve `[]`**. Use `rpc('get_my_ward')`, que traz id, nome, fase e situação, **sem CPF nem contato** | 5.2 |
| **App do acompanhante** | O cuidador via conversas e compromissos da Psicologia | **Não vê**, não escreve e não marca como lido. O titular continua vendo tudo | 4 |
| **App do paciente** | `invite_caregiver` / `accept_caregiver_invitation` / `cancel_caregiver_invitation` | **Removidas.** O paciente cria a conta do acompanhante pela Edge Function `create-caregiver`, com senha provisória | 5.2 |
| **App do paciente** | `accept_patient_invitation` aceitava data de nascimento nula | Nulo **recusa** com `invalid_invitation`. Mande sempre CPF **e** nascimento | 5.12 |
| **Todos** | Anexo do chat podia ser trocado ou apagado | **Imutável**: o bucket só aceita envio, e a linha não aceita `delete` | 7 |

### O que passa a existir

**Painel (clínico e administrativo):**

- **Convite do paciente por SMS**: Edge Function `send-patient-invite`. O Twilio ainda não está
  configurado e a função responde `sms_failed`; enquanto isso, use o "mostrar uma vez" de
  `invite_patient` (5.12).
- **Resumos novos** (seção 3):
  - `summarize_treatment_protocols`, que alimenta o filtro por protocolo;
  - `summarize_content_reads`, só a contagem de leituras;
  - no resumo de sintomas, o denominador (`protocol_patient_count`), `patients_at_or_above` e os
    parâmetros `p_cid10_code` e `p_active_only`.
- **Lista de pacientes** com três ordenações novas: `primary_cid10_code`, `treatment_phase` e
  `is_active` (5.14).
- **Pedido do titular com ciclo completo**: análise, deferimento, recusa com motivo e execução.
  O painel também declara o que exportou com `log_data_export` (5.19).
- **Configuração da clínica**: identidade visual, mensagens, horário de atendimento e parâmetros
  dos gráficos (5.20).
- **Vocabulários editáveis**: sintomas, categorias, assuntos, tipos de compromisso e de
  notificação. Eles se aposentam e nunca se apagam (5.21).
- **Relatório agendado**: `report_schedules` e `report_runs`. O aviso chega com uma referência,
  nunca com o arquivo (5.22).

**App do paciente e do acompanhante:**

- **Acompanhante criado pelo paciente**: `create-caregiver`, `reset-caregiver-password`,
  `get_my_caregiver`, `update_my_caregiver` e `revoke_caregiver_link`. No primeiro login, o
  acompanhante troca a senha com `complete-first-password` (5.2).
- **Notificações com produtor**: agenda, lembretes de 24 h e 2 h, resposta da equipe no chat e
  orientação publicada. Cada tipo traz `audience` (`patient`/`team`): filtre `patient` na tela de
  preferências. Os rótulos já vêm acentuados do banco (5.8).
- **Push pelo OneSignal**: mande o subscription ID em `register_device_token` e chame
  `unregister_device_token` no logout (5.8).
- **NPS do primeiro acesso** abre sozinha quando o paciente ativa o app (5.10).
- **Carrossel antes do login**: `get_clinic_presentation` é a única chamada que funciona sem
  sessão (5.20).
- **Mensagem automática fora do horário**: chega pelo Realtime como mensagem `system`. Por enquanto
  está desligada, porque falta o texto da clínica (5.20).
- **Foto de perfil**: bucket `avatars` e `accounts.avatar_path`. Só o dono vê a foto (7).
- **Direitos do titular**: o titular lê os próprios pedidos direto, e o acesso e a portabilidade
  saem por `export_my_data` (5.19).
- **Termos**: o titular pode aceitar de novo depois de revogar, e lê a versão que aceitou (5.3).

### O que foi decidido e muda a tela

- **Justificativa ao desativar ficha não é gravada.** Texto livre numa trilha imutável seria dado
  pessoal sem correção possível. Se a tela pede motivo, trate-o como confirmação (5.19).
- **Pedido de exclusão encerra o acesso, não apaga.** A conta é desativada e os consentimentos e o
  acompanhante são revogados. O prontuário fica, por decisão da clínica (5.19).
- **Não há filtro por especialidade de origem no resumo de sintomas.** O diário não tem
  especialidade de origem (seção 3, item 8).
- **"Só pacientes ativos"** no resumo de sintomas é `p_active_only`, desligado por padrão, e usa
  a situação da ficha **hoje** (seção 3).
- **Um acompanhante por paciente e um tutelado por acompanhante.** Quem cuida de duas pessoas
  precisa de duas contas (5.2).
- **SMS e e-mail ainda não saem.** O Twilio está sem credencial e o e-mail transacional não foi
  contratado. O push está configurado (11).

---

## 1. O essencial em um minuto

1. **RLS está ligada em tudo.** Você nunca filtra por usuário na query — o banco já filtra.
2. **Consulta negada devolve `[]`, não erro.** Lista vazia inesperada quase sempre é RLS, não bug de dados.
3. **Painel lê dado clínico por `.rpc('read_…')` ou `.rpc('summarize_…')`, nunca por `.from()`.** Com `.from()` o painel recebe zero linhas, silenciosamente — as políticas da equipe pertencem ao role `clinical_reader`, não a `authenticated` (seção 3). O app do paciente/cuidador continua usando `.from()` normalmente, com **uma exceção**: o acompanhante lê a ficha do tutelado por `.rpc('get_my_ward')` (5.2).
   **`read_*` devolve linha sobre paciente identificado; `summarize_*` devolve só números** — nenhum nome, CPF ou `patient_id` sai de um resumo.
4. **Quase toda escrita é RPC.** As exceções (diário, mensagem, conteúdo, bloqueio de agenda, preferências) estão listadas na seção 6.
5. **Dado clínico não se apaga nem se edita.** Registro salvo, mensagem e anotação são imutáveis. `DELETE` está revogado. Corrigir = criar registro novo.
6. **Algumas ações dependem de PERMISSÃO concedida pelo painel**, não só de ser profissional: marcar compromisso (`schedule.manage`) e operar a fila de alertas (`alerts.triage`). Profissional recém-cadastrado **não** as tem. Seção 5.11.

---

## 2. Perfis e identidade

Uma conta autentica; um **perfil** diz o que ela é.

| Tabela | O que é |
|---|---|
| `accounts` | 1 linha por pessoa que autentica. **PK = `auth.users.id`** (o mesmo `auth.uid()`). Criada por trigger no signup, lendo `raw_user_meta_data.full_name`. |
| `patients` | O paciente. Existe **antes** de ter conta (`account_id` fica `NULL` até ativar). |
| `professionals` | O profissional. Vinculado a 1+ especialidades por `professional_specialties`. |
| `admins` | Administrador. |
| `caregivers` | Cuidador acompanhante. O perfil **nasce quando o paciente cria a conta** (`create-caregiver`, desde 25/09/2026). |

**Regra dos dois `is_active`:** a conta precisa estar ativa **e** o perfil precisa estar ativo.
Desligar `accounts.is_active` revoga tudo na hora, em todos os perfis.

### Como nasce cada perfil

**Signup cria conta, nunca perfil.** O trigger `trg_handle_new_auth_user` insere **só** a linha
em `accounts` (id, nome, e-mail, telefone) quando o usuário aparece em `auth.users`. Perfil é
concessão separada, e cada um tem seu caminho:

| Perfil | Como nasce | Existe hoje? |
|---|---|---|
| `caregivers` | Edge Function `create-caregiver`, chamada pelo **titular** — ver 5.2. O convite saiu em 25/09/2026 | ✅ |
| `admins` | Bootstrap (só com a tabela vazia) ou `create_admin(p_account_id)` | ✅ |
| `patients` | A ficha por `create_patient(...)`; o **vínculo com a conta** por `accept_patient_invitation(...)` — ver 5.12 | ✅ **desde 11/09/2026** |
| `professionals` | `create_professional(...)`, pelo administrador — ver 5.13 | ✅ **desde 11/09/2026** |

**Mande o nome no `options.data` do signup** — é de lá que o trigger lê:

```ts
const { data, error } = await supabase.auth.signUp({
  email:    'maria@exemplo.com',
  password: senha,
  options: {
    data: { full_name: 'Maria Silva' },   // ← vira raw_user_meta_data.full_name
    // phone só chega em accounts se for cadastrado no Auth (signUp com phone,
    // ou verificação de telefone). Mandá-lo aqui dentro NÃO preenche a coluna.
  },
})
```

O trigger lê **uma única chave** do metadata: `full_name`. `email` e `phone` ele copia das
colunas nativas de `auth.users`, não do `data`. Qualquer outra chave que você mandar é ignorada
por ele — fica em `raw_user_meta_data` e **não** vira coluna de `accounts`.

- **Nome é opcional no signup.** `accounts.full_name` aceita `NULL` de propósito: exigir o nome
  aqui faria o cadastro inteiro falhar quando ele não viesse. Nome em branco ou só espaços vira
  `NULL`, nunca string vazia — colete-o depois, no onboarding, com o `update` de `accounts`
  mostrado adiante.
- **O trigger é idempotente** (`ON CONFLICT (id) DO NOTHING`): conta já existente não é
  sobrescrita, e reenviar o signup não apaga o nome que o onboarding já corrigiu.
- **Corrigir o nome depois é pelo `accounts`, não pelo Auth.** `auth.updateUser({ data: {...} })`
  mexe só no metadata e **não** dispara este trigger (ele é `AFTER INSERT`, não `UPDATE`) — o
  nome em `accounts` continuaria o antigo. Use `.from('accounts').update({ full_name })`.

> [!note] O que vai no `data` é escrito pelo próprio usuário
> `raw_user_meta_data` chega intacto do `/auth/v1/signup` — quem chama a API escolhe o conteúdo.
> Serve para nome e preferência de tela; **nunca** para papel, perfil ou qualquer coisa que
> decida acesso (ver o aviso sobre `app_metadata` adiante).

> [!warning] As tabelas de perfil continuam sem escrita direta — o caminho é RPC
> As quatro têm **apenas políticas de `SELECT`** e nenhum `GRANT` de escrita para
> `authenticated`. `.from('patients').insert(...)` devolve `permission denied` e vai continuar
> devolvendo: o que mudou em 11/09/2026 é que **existem RPCs** para o que a tela precisa fazer
> (seções 5.12 e 5.13). Não contorne criando a conta e "pendurando" o perfil depois.

**Consequência para o app do paciente:** o fluxo é de **ativação**, não de auto-cadastro. A linha
em `patients` existe antes, com `account_id` em `NULL`; a pessoa cria a conta no app e então
**liga ficha e conta** com `accept_patient_invitation`, que exige o token do convite **mais** CPF e data
de nascimento. Enquanto `account_id` for `NULL`, `private.my_own_patient_id()` não devolve a
ficha — o titular não vê nada, o que é o comportamento correto e não um bug.

Para descobrir quem é o usuário da sessão, o front consulta o próprio perfil:

```ts
const { data: { user } } = await supabase.auth.getUser()

// paciente
const { data: me } = await supabase.from('patients').select('id').single()
// acompanhante: o tutelado vem da RPC, nunca de .from('patients') — ver 5.2
const { data: ward } = await supabase.rpc('get_my_ward')
// profissional
const { data: prof } = await supabase.from('professionals')
  .select('id, professional_specialties(specialty_id)')
  .eq('account_id', user.id).single()
```

O único campo do próprio cadastro que o usuário edita é em `accounts`, e só duas colunas:

```ts
await supabase.from('accounts').update({ full_name, phone }).eq('id', user.id)
```

`is_active`, e-mail e tudo em `patients` são **somente leitura** para o cliente.

### MFA — o que o cliente precisa tratar

O **TOTP (app autenticador) está habilitado** no projeto. SMS não. Estado atual e o que ele exige de vocês:

- **O 2FA é obrigatório para o administrador** (contrato), **opcional** para paciente e profissional. Hoje o banco **ainda não exige**: nenhuma política olha o nível de garantia da sessão. Quando passar a exigir, o aviso vem com antecedência — não é mudança que se descobre em produção.
- **Sessão com fator cadastrado e não verificado é encerrada em 15 minutos.** Está ligado no projeto (*Limit duration of AAL1 sessions*). Vale para **todos os perfis**, inclusive o app do paciente: se a pessoa cadastrar um autenticador e não completar a verificação, a sessão cai sozinha. **Trate `TOKEN_REFRESHED`/`SIGNED_OUT` no `onAuthStateChange`** e leve para a tela de verificação — não para um erro genérico.
- Quem não tem fator cadastrado **não é afetado**: não há o que verificar.

O nível da sessão vem em `supabase.auth.mfa.getAuthenticatorAssuranceLevel()` — `aal1` é só senha, `aal2` é segundo fator verificado.

### Como nasce um administrador

São **dois caminhos**, e o primeiro só existe uma vez.

**O primeiro admin (bootstrap).** `public.admins` não tem política de INSERT para
`authenticated`, então o acesso inicial vem de fora, pelo terminal — ver `scripts/README.md`.
O perfil é concedido por trigger (`trg_handle_auth_user_confirmed`) quando o convidado
**confirma o e-mail**, e **só enquanto `public.admins` está vazia**. Depois disso o caminho
fecha: a mesma marca em `app_metadata` deixa de conceder qualquer coisa, inclusive para
`service_role`.

**Os demais.** `select public.create_admin('<account_id>')` — promove uma conta **que já
existe** a administrador. Exige admin ativo na sessão (`42501` caso contrário) e é idempotente:
promover duas vezes devolve o mesmo perfil. Criar o usuário no Auth continua sendo do GoTrue,
no servidor do painel; a RPC só concede o perfil depois que a conta existe.

```
convite ──► confirma e-mail ──► (admins vazia?) ──► sim: bootstrap concede
                                                └─► não: nada. Use create_admin()
```

Duas consequências para o painel:

- **Entre o convite e o clique no link, existe conta sem perfil de admin.**
  `private.is_active_admin()` é `false` nesse intervalo. Um convidado pendente **não aparece**
  na lista de administradores — é esperado, não bug. A concessão depende da confirmação porque
  e-mail digitado errado não dá erro (o bounce é assíncrono): conceder no convite deixaria um
  administrador fantasma, perfil ativo que ninguém consegue usar, ocupando o endereço.
- **Perder todos os administradores não se resolve pelo produto.** A trava não olha
  `is_active` — admin desativado também mantém a porta fechada, senão quem desativa
  administradores reabriria o bootstrap. Recuperar exige migration nova, deliberada.

> [!warning] Marca de perfil vem de `app_metadata`, nunca de `user_metadata`
> `raw_user_meta_data` é escrito pelo próprio usuário — o `data` do `/auth/v1/signup` chega
> intacto na coluna. Nenhuma decisão de autorização pode sair dali. Vale para qualquer marca de
> perfil que venha a existir, não só a de admin.

Reativar conta ou perfil desligado é ato próprio — `set_account_active()` ou painel. Nem o seed
nem `create_admin()` religam alguém que um administrador desligou.

### Quem pode PERDER o acesso de administrador

Duas regras, impostas por trigger no banco — valem para o painel, para SQL direto e para
`service_role`:

| Regra | Erro | Quando |
|---|---|---|
| **Ninguém se auto-remove** | `42501` | Um admin não desativa a própria conta nem o próprio perfil, **mesmo havendo outros** |
| **O último não cai** | `23514` | Não se desativa nem se apaga o último administrador ativo, por caminho nenhum |

A primeira não é sobre disponibilidade: mudança de acesso privilegiado é sempre ato de outra
pessoa, porque errar aqui **não tem desfazer** — perdido o próprio acesso, ninguém se corrige a
si mesmo. A segunda é sobre disponibilidade, e por isso vale até para `service_role`: apagar o
usuário no dashboard do Auth cascateia até `admins` e **é barrado** ali.

O que o painel precisa tratar:

- **Desativar a si mesmo devolve `42501`.** A ação deveria nem ser oferecida ao usuário logado;
  se for, mostre a mensagem do `HINT` ("peça a outro administrador").
- **Desativar o último devolve `23514`.** Ofereça promover outro admin antes.
- **Não engessa o resto:** com dois ou mais ativos, um admin desativa outro normalmente, e
  mexer em admin **já inativo** sempre passa (é higiene, não remoção de acesso).

> [!warning] Perder todos os administradores exige migration
> As duas regras acima e a trava do bootstrap se apoiam: como o bootstrap não reabre com a
> tabela não-vazia, um sistema sem admin ativo não se recupera pelo produto. É por isso que a
> proteção vale inclusive para `service_role` — ela é a única coisa entre uma operação de rotina
> e um painel administrativo inacessível.

---

## 3. `.rpc()` em vez de `.from()` — o pedágio de auditoria

Toda leitura de dado clínico **pela equipe** (profissional e administrador) é registrada em
`audit_log`: quem leu, quando, de qual paciente, quantas linhas. Isso é exigência de LGPD e item
de aceite. Para que o log seja **inescapável**, as políticas de leitura da equipe não valem para
o role normal do PostgREST — valem só dentro das funções `read_*`.

### Como isso funciona por dentro (e por que `.from()` devolve `[]`)

Vale saber o mecanismo, porque ele explica um comportamento que de fora parece bug.

As políticas de SELECT da equipe (`patients_select_admin`, `treatment_plans_select_professional`,
`diary_entries_select_*` e as demais) estão declaradas **`TO clinical_reader`** — um role que
existe só para ser **dono das funções `read_*`**. **`authenticated` não é membro dele**, e isso é
deliberado.

Logo:

- Dentro de `read_*` (que são `SECURITY DEFINER` com owner `clinical_reader`), a política vale, a
  linha aparece, e a função registra a leitura em `audit_log` antes de devolver.
- Fora delas, num `.from()` do PostgREST, **nenhuma política da equipe se aplica** — e o Postgres
  responde **zero linhas, sem erro**. Não é "acesso negado": é lista vazia.

O role é `NOBYPASSRLS` e **não** é dono das tabelas, então a RLS continua valendo dentro da
função — ele não é uma chave-mestra. E `auth.uid()` sobrevive, porque é variável de sessão e não
de role: a função sabe quem está chamando.

> [!WARNING]
> **É por isso que não existe "só um `select` direto para destravar".** Conceder
> `clinical_reader` a `authenticated`, ou recriar as políticas `TO authenticated`, desliga a
> trilha inteira de acesso a prontuário — que é item de aceite contratual e exigência de LGPD.
> Se uma tela precisa de dado que nenhuma `read_*` entrega, **o pedido é por função nova**, nunca
> por leitura direta.

**Consequência prática:**

```ts
// PAINEL — errado: devolve [] sempre, sem erro nenhum
await supabase.from('diary_entries').select('*').eq('patient_id', id)

// PAINEL — certo
await supabase.rpc('read_diary_entries', { p_patient_id: id, p_limit: 50 })
```

```ts
// APP DO PACIENTE / CUIDADOR — certo, lê direto
await supabase.from('diary_entries').select('*').order('entry_date', { ascending: false })
```

O retorno de `read_*` é uma tabela, então dá para encadear `.select()` e filtros do PostgREST
por cima. A ordenação e o teto de linhas já vêm da função.

### As funções `read_*`

| Função | Parâmetros | Serve a |
|---|---|---|
| `read_patient_list` | `p_search, p_protocol, p_cid10_code, p_treatment_phase_id, p_is_active=true, p_order_by='full_name', p_order_desc=false, p_limit=50, p_offset=0` | **A lista de pacientes** — busca, filtros, ordenação, **total** e data de cadastro. Retorno estreito, CPF mascarado (5.14) |
| `read_patient` | `p_patient_id` | Ficha do paciente — **CPF, telefone e e-mail mascarados** desde 25/09/2026 (5.12) |
| `reveal_patient_identifiers` | `p_patient_id` | **O valor completo** de CPF, telefone, e-mail e documentos. Um paciente por vez, com **linha própria** na trilha (5.12) |
| `read_patient_diagnoses` | `p_patient_id` | CIDs do paciente |
| `read_patient_clinical_history` | `p_patient_id` | Alergias e reações prévias |
| `read_treatment_plans` | `p_patient_id` | Protocolo e ciclo |
| `read_diary_entries` | `p_patient_id, p_limit=50, p_before` | Timeline do diário (só `saved`) |
| `read_diary_symptom_reports` | `p_diary_entry_id` | Sintomas de um registro |
| `read_specialty_notes` | `p_patient_id, p_limit=50, p_before` | Anotações da equipe |
| `read_specialty_flags` | `p_patient_id` | Sinalizações (sem conteúdo) |
| `read_conversations` | `p_patient_id=null, p_limit=50, p_offset=0` | Lista de conversas |
| `read_messages` | `p_conversation_id, p_limit=50, p_before` | Mensagens |
| `read_conversation_assignments` | `p_conversation_id` | Histórico de quem atendeu |
| `read_message_attachments` | `p_conversation_id` | Anexos do chat (**única forma de a equipe obter o `storage_path`**) |
| `read_appointments` | `p_patient_id, p_from, p_to, p_limit=100` | Agenda de um paciente |
| `read_my_agenda` | `p_from, p_to` | Agenda do profissional logado, atravessando pacientes |
| `read_clinic_agenda` | `p_from, p_to, p_specialty_id, p_appointment_type_id, p_status_code, p_limit=100, p_offset=0` | **Agenda da clínica inteira**, atravessando pacientes e profissionais. Janela obrigatória (5.15) |
| `read_alerts` | `p_status=null, p_limit=50, p_before` | **A fila de alertas**, atravessando pacientes |
| `read_patient_alerts` | `p_patient_id, p_limit=50, p_before` | Histórico de alertas de um paciente |
| `read_alert_gemed_status` | `p_alert_ids uuid[]` | Estado do envio ao Gemed, **em lote** — não chame por alerta |
| `read_external_refs` | `p_link_status='proposed', p_limit=50, p_offset=0` | **Fila de conferência do vínculo com o Gemed.** Só administrador |

`p_before` é paginação por chave (passe o `created_at`/`submitted_at` do último item), não offset.
Todas têm teto de 200 linhas no servidor.

**As três de agenda** (`read_appointments`, `read_my_agenda`, `read_clinic_agenda`) devolvem a
linha inteira de `appointments` — mesmas colunas, mesmo formato, mudando só o recorte. Trocar uma
pela outra não muda a tela.

### As funções `summarize_*` — **desde 11/09/2026**

Segunda família, com contrato diferente, e o prefixo é a documentação:

| Prefixo | O que devolve | Identifica alguém? |
|---|---|---|
| `read_*` | **linhas** sobre paciente identificado, paginadas, com teto | sim — a trilha registra o titular |
| `summarize_*` | **só números** e rótulos de catálogo | **não** |

**Nenhum `summarize_*` devolve nome, CPF, `patient_id` ou id de registro clínico.** Se a tela
precisar descer ao indivíduo, o caminho é uma `read_*` por paciente, com o acesso registrado
naquele titular. Isso não é restrição burocrática: hoje, para somar, o painel teria de puxar
registro de sintoma para o navegador — prontuário viajando para virar estatística. O resumo
**melhora** a privacidade em vez de afrouxá-la, e paga **uma** leitura auditada onde a soma no
cliente pagaria uma por paciente.

| Função | Parâmetros | Serve a |
|---|---|---|
| `summarize_symptoms_by_protocol` | `p_from date, p_to date, p_protocol, p_symptom_id, p_cid10_code, p_active_only=false` | **Cruzamento protocolo × sintoma × grau × quantidade**, com o **denominador** do protocolo. Estatísticas Clínicas e "efeitos por protocolo" |
| `summarize_treatment_protocols` | — | **Nomes de protocolo distintos**, com quantos planos e quantos pacientes vigentes. Opções do filtro por protocolo da lista (desde 25/09/2026) |
| `summarize_content_reads` | `p_from date, p_to date` (opcionais) | **Quantos pacientes leram cada orientação** — só o número, nunca quem (desde 25/09/2026) |
| `summarize_appointments` | `p_from, p_to, p_granularity='month', p_specialty_id, p_appointment_type_id` | Sessões realizadas, faltas, cancelamentos, adesão e **volume por especialidade** |
| `summarize_chat_response_times` | `p_from, p_to, p_granularity='month', p_specialty_id` | **Tempo até a primeira resposta da equipe**, por período e especialidade |

`p_granularity` aceita `day`, `week` ou `month` — qualquer outro valor é recusado. **A janela é
obrigatória** em `summarize_symptoms_by_protocol`, `summarize_appointments` e
`summarize_chat_response_times`: varredura sem período não é relatório, é dump. Em
`summarize_content_reads` ela é opcional e vale sobre a data da leitura, **no fuso da clínica**.

**Colunas de retorno**, para dimensionar a tela antes de chamar:

- `summarize_symptoms_by_protocol` → `protocol_name, symptom_id, symptom_label, grade, report_count, patient_count, protocol_patient_count, patients_at_or_above`
- `summarize_treatment_protocols` → `protocol_name, plan_count, current_patient_count`
- `summarize_content_reads` → `content_item_id, read_count` (orientação sem leitura **não tem linha**: mostre zero)
- `summarize_appointments` → `bucket_start, appointment_type_id, appointment_type_label, specialty_id, specialty_label, status_code, status_label, status_reason_id, status_reason_label, appointment_count, patient_count, confirmed_count`
- `summarize_chat_response_times` → `bucket_start, specialty_id, specialty_label, conversation_count, answered_count, unanswered_count, first_response_avg_seconds, first_response_median_seconds, first_response_p90_seconds`

#### Oito coisas que mudam o que a tela deve mostrar

1. **A linha de `protocol_name` NULO é resultado, não resíduo.** Ela conta os eventos de paciente
   **sem plano terapêutico registrado** — e quantas pessoas são. Enquanto o Gemed estiver
   desligado, essa linha é a **maioria**: o plano só entra por RPC manual. Isso é o estado
   correto, não defeito, e é exatamente a informação que permite **omitir** o indicador em vez de
   exibir zero.
2. **Especialidade NULA também é balde legítimo** — compromisso de laboratório parceiro não tem
   profissional nem especialidade. Não descarte a linha; rotule-a.
3. **O evento é atribuído ao protocolo da DATA DO EVENTO**, não ao protocolo atual do paciente.
   Plano sem data de início não atribui e cai no balde nulo.
4. **Sigilo entre especialidades vale dentro do agregado.** O administrador não vê psicologia no
   recorte por especialidade **nem no total** — os números dele são menores que os da clínica
   inteira, por desenho. A psicóloga, chamando a mesma função, vê a própria área.
5. **O tempo de resposta tem viés de janela.** A janela é sobre a **abertura** da conversa, então
   a aberta no fim do período e respondida depois conta como não respondida. Por isso
   `unanswered_count` vem separado, e as estatísticas de tempo se calculam só sobre as
   respondidas. A janela mais recente sempre parece pior do que foi.
6. **A prevalência é `patient_count / protocol_patient_count`** (desde 25/09/2026).
   `protocol_patient_count` conta os pacientes com plano **daquele protocolo vigente em algum
   ponto da janela**, sob os mesmos filtros de CID e de ficha ativa. No balde de protocolo NULO
   ele é **NULO**: "sem plano" não é um conjunto que a janela delimite, e dividir ali produziria
   uma prevalência inventada. **Não some `patient_count` entre graus** para responder "quantos
   tiveram grau 3 ou mais": quem oscilou entre 3 e 4 contaria duas vezes. Use
   `patients_at_or_above`, que conta cada pessoa pelo **pior** grau na janela.
7. **`p_cid10_code` e `p_active_only` recortam os pacientes ANTES de agregar**, numerador e
   denominador juntos. "Ativo" é a **ficha ativa hoje** (`patients.is_active`), a mesma situação
   do filtro da lista; um paciente desativado ontem sai do histórico inteiro com o filtro ligado.
   O padrão continua sendo todos.
8. **Não há filtro por especialidade de origem no resumo de sintomas, e não haverá.** O diário é
   escrito pelo paciente e não tem especialidade de origem (é a exceção declarada ao contrato de
   sigilo). Deduzir uma seria inventar o dado.

> [!NOTE]
> **"Engajamento no app" NÃO tem função**, e não é esquecimento: a definição não existe em fonte
> nenhuma (sessões? dias com diário? orientações lidas? mensagens?). É a questão **#44**, aberta
> em 11/09/2026 para decidir com a clínica. Número calculado sobre definição inventada é pior que
> indicador ausente.

### O que as `read_*` e as `summarize_*` **não** fazem

- **Resumo por profissional individual não existe.** "Comparativos entre profissionais
  respeitando privacidade" é requisito, e o N mínimo é a mesma decisão pendente do comparativo de
  NPS. O recorte disponível é **por especialidade**.
- **`read_patients`, a antiga, SAIU em 25/09/2026.** Chamá-la devolve `PGRST202` (função não
  encontrada). Use `read_patient_list`, que desde a mesma data traz `created_at` no fim.
- **Exportação (PDF/Excel) e mapa de calor** são do front-end. O banco entrega o número. O
  **agendamento de envio** existe desde 25/09/2026, e está na 5.22.

> [!IMPORTANT]
> **Somar no cliente continua não sendo alternativa.** Se um recorte não existe nas funções
> acima, **peça a função**, não puxe as linhas para contar. E enquanto um indicador não tiver
> fonte, a tela **não deve exibir zero como se fosse medição**: número calculado sobre zero
> linhas afirma um fato falso com cara de verdadeiro. Omitir o indicador é o comportamento certo.

### O que **não** paga pedágio (leitura direta com `.from()`, para todos)

Agenda do próprio paciente, orientações, perfil, notificações, **NPS**, identidade (`accounts`,
`professionals`, `patient_caregivers`), auditoria (só admin) e **todos os catálogos**:

`specialties` · `professional_specialties` · `cid10` · `treatment_phases` · `symptoms` ·
`content_categories` · `content_cid10` · `conversation_subjects` · `appointment_types` ·
`appointment_statuses` · `appointment_status_reasons` · `notification_types` ·
`legal_document_versions` (só a vigente, para quem não é admin)

### A trilha de **escrita** — automática, e o front-end não faz nada

Leitura paga pedágio na função; **escrita é auditada por gatilho, no banco**. Toda linha criada,
alterada ou removida nestas **25 tabelas** gera registro em `audit_log` sozinha, venha de RPC, de
`.insert()` direto ou de `service_role`:

`patients` · `patient_diagnoses` · `patient_clinical_history` · `patient_invitations` ·
`treatment_plans` · `diary_entries` · `specialty_notes` · `private.specialty_flags` ·
`conversations` · `messages` · `appointments` · `alerts` · `alert_rules` · `content_items` ·
`content_versions` · `content_version_reviews` · `professionals` · `professional_specialties` ·
`professional_permissions` · `admins` · `caregivers` · `patient_caregivers` ·
`legal_document_versions` · `security_settings` · `data_subject_requests`

`patient_caregivers` entrou em 25/09/2026: conceder e revogar acompanhante aparece na trilha **da
ficha do titular**. Em `data_subject_requests` entram a criação e **cada transição de estado** —
não a anotação de erro da rotina, que se repete a cada tentativa.

Mais **um caso parcial**, de propósito: em `accounts` o gatilho dispara **só na transição de
`is_active`** — a concessão e a revogação de acesso. Correção de nome e de telefone **não** entra,
e não é esquecimento: `accounts` recebe UPDATE a cada ajuste de perfil, e auditar tudo afogaria a
revogação no meio de milhares de linhas de "trocou o sobrenome".

**O que isso significa na prática:**

- **Não implemente log no cliente.** Chamar uma RPC de escrita já deixa rastro; registrar de novo
  no front-end duplica a trilha e diverge dela.
- **O gatilho guarda só identificadores** — quem, quando, qual tabela, qual linha, qual paciente.
  **Nunca o conteúdo**: o texto do diário, da anotação e da mensagem não chega a `audit_log`, por
  desenho. Trilha que copia conteúdo vira um segundo prontuário.
- **`row_count` só existe em leitura.** Em escrita ele é `NULL`, e é isso que distingue "abriu a
  ficha" de "varreu a base" no módulo de auditoria.

> [!NOTE]
> **`messages` deixou de ser exceção.** Toda mensagem passa a deixar **uma** linha na trilha, com
> autor, instante, conversa e paciente. O **corpo não entra**, e não há coluna onde caberia.
> Concessão e revogação de acesso (`set_account_active`, `create_admin`, perfis de cuidador)
> também passaram a ser auditadas, por gatilho.

### O que a trilha guarda desde a leva de governança

Três colunas novas em `audit_log`, e o que **não** entrou importa tanto quanto o que entrou:

| Coluna | O que diz | O que NÃO diz |
|---|---|---|
| `origin` | primeiro elemento de `x-forwarded-for` | nada fora de requisição HTTP: fica `NULL` |
| `actor_capacity` | em que **qualidade** a pessoa agiu neste ato (`patient`, `caregiver`, `professional`, `admin`, `system`) | que perfis ela tem; isso continua se resolvendo por join |
| `is_restricted_material` | que houve acesso a material de especialidade confidencial | **de qual paciente e de qual sessão** |

- **`origin` é indício, não prova.** O início da cadeia `x-forwarded-for` é falsificável por quem
  controla o cliente. Serve para "de quantos lugares esta conta acessou prontuário esta semana",
  e não como evidência contra a pessoa que agiu. **Você não precisa mandar nada**: o valor sai do
  cabeçalho, e nenhuma assinatura de `read_*` mudou.
- **A marca de material restrito sai em linha SEPARADA**, com `patient_id` e `resource_id` nulos.
  Um booleano ao lado da leitura comum diria de qual paciente era o material, e uma constraint
  recusa a linha que tente carregar o titular.

---

## 4. Quem enxerga o quê

| | Paciente | Cuidador | Profissional | Admin |
|---|---|---|---|---|
| Próprios dados clínicos | ✅ direto | ✅ direto (do tutelado) | — | — |
| Ficha cadastral: CPF, telefone, e-mail, endereço | ✅ a própria, direto e completa | ❌ só id, nome, fase e situação, por `get_my_ward` | mascarada; completa por `reveal_patient_identifiers`, auditada | idem ao profissional |
| Ficha, diário, plano, agenda, chat de qualquer paciente | — | — | ✅ via `read_*` | ✅ via `read_*` |
| Anotação de especialidade (`specialty_notes`) | ❌ | ❌ | `team` + a própria especialidade | só `team` |
| Conteúdo de **Psicologia** (nota, conversa, compromisso) | ✅ o próprio | ❌ nunca | só a Psicologia | ❌ nunca |
| Sinalização de sofrimento (`specialty_flags`) | ❌ | ❌ | ✅ todos | ❌ |
| Bloqueio pessoal de agenda (`professional_blocks`) | ❌ | ❌ | só o dono | ❌ |
| Favoritos/lidos de orientação | só o titular | ❌ | ❌ | ❌ |
| Notificações | só o destinatário | só o destinatário | só o destinatário | só o destinatário |
| `audit_log` | ❌ | ❌ | ❌ | ✅ |

**Sigilo da Psicologia é automático.** Nota, conversa ou compromisso roteado para uma
especialidade marcada como confidencial vira `visibility = 'specialty_restricted'` por trigger —
e some da lista das outras áreas, da administração **e do cuidador**. Não é o conteúdo que se
esconde: é a linha. O front-end não precisa (e não deve) implementar nada disso.

> ⚠️ **MUDOU EM 25/09/2026: o cuidador não vê conversa nem compromisso restrito.** Até então ele
> via tudo o que o titular via. O requisito sempre disse o contrário ("o cuidador não vê conteúdo
> sigiloso"). Efeito visível no app: **a conversa que o cuidador abriu some da lista dele quando a
> Psicologia a assume** — a existência dela é o dado sigiloso. O titular continua vendo tudo o que
> é dele, restrito ou não.

---

## 5. Guia por módulo

### 5.1 Diário de sintomas — `diary_entries`, `diary_symptom_reports`, `symptoms`

Fluxo: cria **rascunho** → marca sintomas (0–5) → **finaliza**. Rascunho é invisível para a equipe.

```ts
// 1. abre o rascunho
const { data: entry } = await supabase.from('diary_entries').insert({
  patient_id:  myPatientId,
  authored_by: user.id,
  acting_as:   'patient',        // ou 'caregiver' quando o cuidador registra
  free_text:   'Como me senti hoje…',
}).select().single()

// 2. marca sintomas (1 linha por sintoma; regravar o mesmo sintoma é UPDATE)
await supabase.from('diary_symptom_reports')
  .insert({ diary_entry_id: entry.id, symptom_id, grade: 3 })

// 3. finaliza — os DOIS campos juntos, sempre
await supabase.from('diary_entries')
  .update({ status: 'saved', submitted_at: new Date().toISOString() })
  .eq('id', entry.id)
```

- `status: 'saved'` **sem** `submitted_at` → `check_violation`. Os dois andam juntos.
- Depois de `saved`, o registro e seus sintomas são **imutáveis**. Correção = registro novo.
- Desmarcar sintoma (`DELETE`) só funciona enquanto o pai é rascunho — é o único `DELETE` liberado no projeto inteiro.
- `entry_date` tem default no fuso de Chapecó; só mande explicitamente se estiver registrando um dia passado.
- `acting_as` aparece na tela do profissional. Não é log: é campo de tela.

### 5.2 Cuidador acompanhante

**Desde 25/09/2026 o paciente cria a conta do acompanhante** (ADR-026). O convite saiu:
`invite_caregiver`, `accept_caregiver_invitation` e `cancel_caregiver_invitation` não existem
mais, e `caregiver_invitations` ficou só como histórico. **Um acompanhante por paciente, e um
tutelado por acompanhante**: quem cuida do pai e da mãe precisa de duas contas, com dois e-mails.

O vínculo tem três estados, e **só `active` dá acesso**:

```
          create-caregiver          complete-first-password
(nada) ─────────────────► pending ─────────────────────────► active
                             ▲                                  │
                             └──────── reset-caregiver-password ┘
          pending | active ──► revoked   (revoke_caregiver_link)
```

Enquanto o vínculo está `pending`, o acompanhante **entra no app mas não lê nada** do tutelado: o
banco devolve zero linhas, por qualquer caminho. Não é a tela que bloqueia.

#### O que o app do **paciente** chama

| Chamada | Corpo / argumentos | Resposta |
|---|---|---|
| Edge Function `create-caregiver` | `{ full_name, email, phone, delivery: 'whatsapp' \| 'sms' }` | `201` — ver abaixo |
| Edge Function `reset-caregiver-password` | `{ delivery: 'whatsapp' \| 'sms' }` | `200` — mesma forma |
| `rpc('get_my_caregiver')` | — | `{ link_id, caregiver_account_id, full_name, email, phone, status, granted_at, activated_at, temporary_password_expires_at }` ou vazio |
| `rpc('update_my_caregiver', { p_full_name?, p_phone? })` | nulo = não muda | — |
| `rpc('revoke_caregiver_link', { p_link_id })` | — | — (vale para `pending` e `active`) |

```ts
const { data, error } = await supabase.functions.invoke('create-caregiver', {
  body: { full_name: 'Ana Souza', email: 'ana@exemplo.com', phone: '(49) 99999-1234', delivery: 'whatsapp' },
})
// whatsapp → { link_id, login, temporary_password, expires_at, delivery }
// sms      → { link_id, expires_at, delivery, phone_masked }   (a senha NUNCA volta)
```

- **Por WhatsApp, a senha volta uma única vez.** Abra o compartilhamento do WhatsApp com login e
  senha e **descarte o valor**: não guarde em estado persistente, log ou armazenamento local.
- **A senha provisória vale 72 h** (`expires_at`). Vencida, o caminho é `reset-caregiver-password`.
- **Telefone:** só celular brasileiro. Qualquer pontuação serve; o banco grava `+55DDNNNNNNNNN`.
  Fixo é recusado (`invalid_phone`), porque SMS e WhatsApp não chegam nele.
- **Cota:** cinco senhas por paciente em 24 h, somando criação e reset (`rate_limited`).
- **O e-mail não é verificado.** Peça confirmação na tela antes de enviar.
- **`sms_failed` com `link_id`** quer dizer que a conta e o vínculo pendente existem e só a
  mensagem não saiu: ofereça `reset-caregiver-password` com `delivery: 'whatsapp'`. **Sem
  `link_id`**, nada foi criado (o provedor de SMS não está configurado).
- Revogar desliga a conta do acompanhante que fica sem vínculo. Se o **mesmo paciente** o
  cadastrar de novo com o mesmo e-mail, a conta volta com senha nova; para outro paciente, o
  e-mail dá `email_in_use`.

#### O que o app do **acompanhante** chama

No login, leia `session.user.app_metadata.must_change_password`. Se for `'true'`, mande para a
tela de senha nova:

```ts
const { data, error } = await supabase.functions.invoke('complete-first-password', {
  body: { new_password },
})
// 200 → { link_id, refresh_session: true }
await supabase.auth.refreshSession()   // OBRIGATÓRIO: o JWT antigo ainda diz 'true'
```

Depois da troca, peça o aceite dos termos (5.17), como para qualquer conta nova. A troca é o ato
que ativa o vínculo, e fica na trilha em nome do acompanhante.

**Quem é o tutelado: `get_my_ward`** (desde 25/09/2026). O acompanhante **não lê `patients`
direto**: `.from('patients')` devolve `[]`, como para quem não tem vínculo. A ficha dele vem desta
RPC, sem argumento:

```ts
const { data: ward } = await supabase.rpc('get_my_ward')
// [{ patient_id, full_name, treatment_phase_id, is_active }]  ou  []
const patientId = ward[0]?.patient_id   // é o que vai em diary_entries.patient_id etc.
```

- **Vem vazia** enquanto o vínculo está `pending` (falta trocar a senha), depois da revogação e
  para quem não é acompanhante. Trate `[]` como "sem tutelado", não como erro.
- **CPF, telefone, e-mail, endereço, nascimento, convênio e documentos não saem**, e isso é
  deliberado. Até 25/09/2026 o acompanhante lia a linha inteira, com mais do que a própria equipe,
  que recebe esses campos mascarados. Se a tela precisar de algum campo, **peça ao banco**: cada
  coluna entra por migration, uma de cada vez.
- A fase é um id: o rótulo vem de `.from('treatment_phases')`, que qualquer conta lê.
- O resto do acompanhamento **não muda**: diário, plano, diagnóstico, histórico, orientações,
  conversas e compromissos continuam em `.from()`, filtrados por `patient_id`.

#### Erros

| Erro | Onde | O que fazer |
|---|---|---|
| `not_patient_owner` | criação, reset, edição | só o titular gerencia o acompanhante |
| `caregiver_already_active` | criação | já existe acompanhante (pendente ou ativo): revogar antes |
| `email_in_use` | criação | o e-mail tem outra conta |
| `invalid_phone` · `invalid_name` · `invalid_email` · `invalid_delivery` | criação, edição | validação de formulário |
| `rate_limited` | criação, reset | cinco senhas em 24 h: tentar amanhã |
| `caregiver_not_found` | reset, edição | não há acompanhante |
| `caregiver_disabled` | criação | a administração desativou este acompanhante |
| `sms_failed` | criação, reset | ver acima |
| `reset_failed` | reset | falha no Auth: tentar de novo (o acesso fica suspenso até lá) |
| `weak_password` | troca | mínimo de 10 caracteres, com letras e dígitos |
| `password_unchanged` | troca | a senha nova é igual à provisória |
| `not_first_login` | troca | não há vínculo pendente: nada a trocar |
| `temporary_password_expired` | troca | passaram 72 h: o titular reseta |

Leitura: o titular vê o próprio vínculo e as emissões de senha (`caregiver_credential_issuances`);
o acompanhante vê o próprio vínculo, inclusive pendente (é assim que sabe que falta a troca); a
equipe vê o vínculo para exibir o contato na ficha.

**O que o cuidador alcança do tutelado** (só com vínculo `active`): diário, plano, diagnóstico,
histórico, orientações e as conversas e compromissos com `visibility = 'team'`. Conversa e
compromisso **restritos** (Psicologia) não aparecem, não aceitam mensagem dele, não se marcam como
lidos (`mark_conversation_read` devolve o mesmo erro de conversa inexistente) e não se confirmam.
Ver seção 4.

### 5.3 Ficha clínica e tratamento

| RPC | Quem | O que faz |
|---|---|---|
| `upsert_patient_diagnosis(p_patient_id, p_cid10_id, p_staging?, p_tnm?, p_diagnosed_on?, p_is_primary?)` | profissional/admin | Adiciona CID; `is_primary` desmarca o anterior |
| `add_patient_clinical_history(p_patient_id, p_kind, p_description)` | profissional/admin | `p_kind`: `'allergy'` \| `'prior_reaction'` |
| `set_treatment_plan(p_patient_id, p_protocol_name, p_cycles_planned?, p_intent?, p_started_on?)` | profissional/admin | Encerra o plano vigente e abre o novo, atomicamente |
| `set_treatment_phase(p_patient_id, p_phase_code)` | profissional/admin | `p_phase_code`: `ativo` \| `seguimento`. **Só estes dois** — ver aviso abaixo |

Plano vigente = a linha com `ended_on IS NULL`. Ciclo é `current_cycle_number` (ordinal), não tabela.

> [!WARNING]
> **A lista clínica de fases encolheu para duas: `ativo` e `seguimento`.** `remissao` e
> `finalizacao` continuam na tabela, **desativadas** — vocabulário se aposenta, nunca se apaga,
> senão o histórico de quem já esteve nelas ficaria ilegível. Consequências para a tela:
> `set_treatment_phase` com um dos dois códigos aposentados levanta `unknown_treatment_phase`
> (`22023`); o **seletor** de fase deve filtrar `is_active = true`, e o **histórico**, não.
> O motivo veio da clínica: só paciente em tratamento ativo usa o app.

**LGPD, do lado do app:**

| RPC | Quem |
|---|---|
| `accept_legal_terms()` | qualquer conta — aceita todas as versões vigentes, idempotente |
| `revoke_consent(p_consent_id)` | **só o titular** (nunca o cuidador) |
| `request_data_subject_action(p_request_type)` | titular — `access`, `rectification`, `portability`, `consent_revocation`, `deletion` |
| `decide_data_subject_request(p_request_id, p_status, p_note?)` | admin — `'under_review'`, `'granted'` ou `'refused'` (recusa **exige** `p_note`) |
| `complete_data_subject_request(p_request_id, p_note?)` | admin — só retificação deferida |
| `export_my_data(p_request_id)` | titular — o pacote de acesso/portabilidade, em JSON |

O ciclo completo do pedido, o que a exclusão faz e como o app baixa o pacote estão na **5.19**.

`legal_document_versions` com `is_current = true` é o texto a exibir antes do aceite — e a
tabela está **vazia hoje**: a RPC de publicação existe (5.17), mas ninguém a usou ainda. Desde
25/09/2026 o titular também lê **as versões que aceitou**, mesmo depois de publicada a seguinte,
e **pode aceitar de novo depois de revogar**: `accept_legal_terms()` devolve o número de aceites
novos, e o reaceite é linha nova (o aceite revogado fica no histórico).

**Painel administrativo — contas e vínculo externo:**

| RPC | O que faz |
|---|---|
| `set_account_active(p_account_id, p_is_active)` | Ativa/desativa a conta. **É a revogação de acesso**: vale para todos os perfis, na hora, e desativa os aparelhos de push junto. Ninguém edita o próprio `is_active`. |
| `confirm_external_link(p_ref_id, p_confirm)` | Confirma ou rejeita o vínculo de um cadastro com a origem externa. Exige conferência humana antes (`external_refs` é invisível ao cliente). Só faz sentido quando a integração existir. |

### 5.4 Anotação clínica — `specialty_notes`, `specialty_flags`

Escrita **direta**, leitura por `read_*`. O profissional só escreve na própria especialidade.

```ts
await supabase.from('specialty_notes').insert({
  patient_id,
  origin_specialty_id:    minhaEspecialidadeId,  // tem que ser uma das minhas
  author_professional_id: meuProfessionalId,
  authored_by:            user.id,
  body:                   'Texto da anotação.',
  // supersedes_note_id: idDaNotaAnterior  ← para corrigir
})
```

- A nota é **imutável**. Corrigir = nota nova apontando para a anterior por `supersedes_note_id` (uma correção por nota).
- Nota da Psicologia nasce restrita automaticamente, mesmo que você mande `visibility: 'team'`.
- **Sinalizar sofrimento:** `rpc('raise_specialty_flag', { p_source_note_id })`. Só sobre nota do próprio autor. O sinal diz que existe, de qual especialidade, sobre qual paciente e quando — **nunca o conteúdo nem a nota de origem**. É o que a equipe inteira enxerga sem ver a sessão de psicologia.

### 5.5 Orientações (conteúdo educativo)

Duas camadas: `content_items` (identidade estável) e `content_versions` (título, corpo, mídia e **estado**).

**Workflow — quatro estados:** `draft` → `in_review` → `published` \| `draft` (devolvida) \| `archived` (rejeitada); `published` → `archived`.
Só existe **uma** versão publicada e **uma** em revisão por orientação.

> **`returned` e `rejected` não existem mais.** Devolver leva de volta a `draft`, rejeitar leva a
> `archived`. As ações do revisor continuam as mesmas quatro; o que encolheu foi o vocabulário de
> estado, e a tela deve renderizar `label` de quatro valores, não de seis. O motivo da devolução
> vive em `content_version_reviews`, não no estado.

Autor (profissional), escrita direta:

```ts
// item — a categoria precisa ser de uma das MINHAS especialidades. Toda categoria tem uma.
const { data: item } = await supabase.from('content_items').insert({
  category_id, author_professional_id: meuProfessionalId, authored_by: user.id
}).select().single()

// versão — version_no é atribuído pelo banco; nasce sempre em draft
await supabase.from('content_versions').insert({
  content_item_id: item.id, title, body,
  media_kind: 'text',                       // 'text' | 'video' | 'pdf'
  created_by_professional_id: meuProfessionalId, created_by: user.id
})

// submeter para revisão
await supabase.from('content_versions').update({ status: 'in_review' }).eq('id', versionId)
```

Revisor (admin): `rpc('review_content_version', { p_content_version_id, p_action, p_comment })`.
`p_action`: `approve` \| `return` \| `reject` \| `unpublish`. **`return` e `reject` exigem comentário.**
Aprovar arquiva a versão anterior sozinho.

Marcação por CID (`content_cid10`) define quem vê. **Sem nenhuma linha de CID = conteúdo universal**,
visível a todos os pacientes. Com CID, só quem tem aquele diagnóstico.

Paciente/cuidador leem `content_items` e `content_versions` com `.from()` e recebem **apenas o
publicado e elegível** — a regra roda no banco. Favorito e lido:

```ts
await supabase.from('patient_content_states').upsert({
  patient_id: myPatientId, content_item_id, is_favorite: true, read_at: new Date().toISOString()
})
```

Vídeo é **embed** (`video_url`), aceito só de YouTube/Vimeo em `https`. Nunca upload.

### 5.6 Chat — `conversations`, `messages`, `message_attachments`

| RPC | Quem | O que faz |
|---|---|---|
| `start_conversation(p_subject_id, p_body)` | paciente/cuidador | Abre a conversa **e** grava a 1ª mensagem |
| `claim_conversation(p_conversation_id)` | profissional | Assume conversa não roteada (fila geral) |
| `transfer_conversation(p_conversation_id, p_to_professional_id)` | profissional da área | Encaminha e grava a mensagem automática |
| `resolve_conversation(p_conversation_id)` | profissional da área | Marca como resolvida |
| `mark_conversation_read(p_conversation_id)` | todos | Avança o carimbo de até onde se leu |

Mensagem é **`.insert()` direto** (é caminho quente demais para RPC):

```ts
// paciente
await supabase.from('messages').insert({
  conversation_id, author_kind: 'patient', author_account_id: user.id, body
})
// profissional
await supabase.from('messages').insert({
  conversation_id, author_kind: 'professional',
  author_account_id: user.id, author_professional_id: meuProfessionalId, body
})
```

- Só se escreve em conversa **`open`**.
- ⚠️ **MUDOU EM 11/09/2026: qualquer profissional ativo responde.** O recorte por especialidade
  caiu, e com ele a exigência de `claim_conversation` antes de responder na fila geral.
  **O que NÃO mudou:** conversa **restrita à psicologia** continua fechada a quem não é da área —
  quem não vê a conversa não escreve nela. `claim_conversation` continua existindo e continua
  sendo o que registra quem atende; só deixou de ser portão.
- Mensagem é **imutável**: sem edição, sem exclusão.
- `author_kind: 'system'` é gerado pelo banco na transferência. Não insira.
- Desde 25/09/2026, **cada mensagem de profissional notifica o paciente** (e o acompanhante,
  se a conversa não for restrita). O painel não faz nada para isso — ver 5.8.
- Hoje **toda conversa nasce não roteada** — o mapa assunto → especialidade está vazio de propósito. A fila geral é `origin_specialty_id IS NULL AND status = 'open'`.

`team_last_read_at` diz ao paciente **que** a equipe leu, nunca **quem**.

### 5.7 Agenda — `appointments`, `professional_blocks`

Compromisso: **leitura** por `.from()` (paciente/cuidador) ou `read_appointments`/`read_my_agenda`
(equipe); **escrita** só por RPC.

| RPC | Quem |
|---|---|
| `schedule_appointment(p_patient_id, p_appointment_type_id, p_title, p_starts_at, p_ends_at, p_location_label, p_professional_id?, p_origin_specialty_id?, p_patient_notes?, p_location_address?, p_location_phone?)` | profissional |
| `reschedule_appointment(p_appointment_id, p_starts_at, p_ends_at, p_reason_id?)` | profissional — cria a linha nova e encerra a antiga como `rescheduled` |
| `set_appointment_status(p_appointment_id, p_status_code, p_reason_id?)` | profissional — `completed`, `cancelled`, `no_show` |
| `confirm_appointment(p_appointment_id)` | **titular ou cuidador**, só antes do início. Cuidador, só compromisso **não restrito** |
| `unconfirm_appointment(p_appointment_id)` | titular ou cuidador (mesma regra) |

> ⚠️ **MUDOU EM 11/09/2026: marcar exige a permissão `schedule.manage`.**
> Não basta ser profissional ativo. A clínica definiu que quem opera a agenda é a **enfermagem
> navegadora**, e isso virou uma permissão concedida pelo painel administrativo.
> **Profissional cadastrado a partir de 11/09/2026 nasce SEM ela** e recebe
> `apenas profissional ativo marca compromisso` em todas as cinco RPCs acima até alguém conceder.
> Não é bug: é a tela de cadastro que precisa oferecer a concessão. Ver seção 5.10.

- **Não existe UPDATE de horário.** Remarcar é `reschedule_appointment` — o relatório de adesão conta remarcações.
- Desde 25/09/2026, marcar, remarcar e cancelar compromisso **futuro** notificam o paciente, e
  os lembretes de 24 h e 2 h saem sozinhos (5.8).
- Estado terminal (`completed`, `cancelled`, `no_show`, `rescheduled`) não transiciona mais.
- Sair de `scheduled` limpa a confirmação sozinho.
- `patient_notes` é texto **exibido ao paciente**. Conteúdo clínico vai em `specialty_notes`.
- **Bloqueio pessoal** (`professional_blocks`) é escrita e leitura diretas do próprio dono, fora do clínico. O painel monta o calendário unindo `read_my_agenda` + `.from('professional_blocks')`.

### 5.8 Notificações — `notifications`, `notification_preferences`, `device_tokens`

`notifications` é a caixa de entrada do destinatário. **A linha não tem texto**: o título vem de
`notification_types.label`, e o cliente monta a prévia com os dados que já carregou.

```ts
// caixa de entrada
await supabase.from('notifications')
  .select('*, notification_types(label, category, icon_name, audience)')
  .is('archived_at', null).order('created_at', { ascending: false })

// marcar lida / arquivar — só estas duas colunas
await supabase.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', id)

// push — o token é o player ID do OneSignal
await supabase.rpc('register_device_token', { p_token: playerId, p_platform: 'android' })
await supabase.rpc('unregister_device_token', { p_token: playerId })
```

**O provedor de push é o OneSignal**, e o banco não sabe disso: `device_tokens.token`
é texto livre e `platform` é `ios`, `android` ou `web`. Mande o **player ID** do
OneSignal em `p_token`. Trocar de provedor um dia não exige migration — e é por isso
que a coluna não se chama `fcm_token`.

O dono escreve as preferências (`notification_preferences`) direto: matriz `type_id × channel`,
mais janela de silêncio (`quiet_hours_start`/`end`, interpretada no fuso de `accounts.time_zone`).
**Sem linha = recebe por todos os canais.** A janela **atrasa** o envio, nunca cancela.

**Desde 25/09/2026, cada tipo diz a quem se destina** (`notification_types.audience`): `patient`
(aparece no app, titular e acompanhante) ou `team` (só no painel). **O app filtra
`audience = 'patient'`** na tela de preferências e pode apagar a lista própria que mantinha; os
rótulos vêm acentuados do banco. A categoria ganhou `report` (relatório agendado, só da
administração, 5.22). E o **rótulo de um tipo aposentado continua legível para quem recebeu
notificação dele**: a caixa não perde o título quando a administração desliga um tipo. Quem
nunca recebeu não o vê, e o seletor de preferências continua só com os ativos.

> `critical_alert` é insilenciável **por chave estrangeira**. Tentar criar preferência para ele
> falha com violação de FK (`23503`) — não é bug, é o desenho. Esconda o toggle na UI.

#### Quem produz cada notificação — **desde 25/09/2026**

O front-end **não cria notificação**: elas nascem no banco, e a caixa recebe por Realtime.

| Tipo (`code`) | Quando nasce | Quem recebe | `target_table` |
|---|---|---|---|
| `appointment_scheduled` | compromisso **futuro** marcado | titular + acompanhante¹ | `appointments` |
| `appointment_changed` | remarcado (alvo é a linha **nova**) ou cancelado | titular + acompanhante¹ | `appointments` |
| `appointment_reminder_24h` | rotina a cada 5 min, na janela de 24 h | titular + acompanhante¹ | `appointments` |
| `appointment_reminder_2h` | a mesma rotina, na janela de 2 h | titular + acompanhante¹ | `appointments` |
| `chat_message` | cada mensagem de **profissional** | titular + acompanhante¹ | `conversations` |
| `content_published` | **primeira** aprovação de uma orientação | quem pode lê-la (CID) + acompanhante | `content_items` |
| `critical_alert` / `alert_assigned` | alerta disparado / designado | equipe com `alerts.triage` / o designado | `alerts` |
| `report_ready` | relatório agendado venceu (5.22) | o administrador destinatário | `report_runs` |

¹ **Exceto** quando o alvo é restrito (sessão ou conversa de psicologia): aí só o titular.

- Mensagem do paciente, do acompanhante e do sistema (transferência) **não** notificam.
  Realizado e falta também não — só o cancelamento muda o que o paciente tem de fazer.
- Compromisso marcado com **menos de 24 h** de antecedência não recebe o lembrete de 24 h (o
  "novo compromisso" acabou de sair); o mesmo vale para o de 2 h. O lembrete **expira no
  início do compromisso**: atrasado pela janela de silêncio, ele não sai depois da consulta.
- Corrigir uma orientação já publicada **não** avisa de novo.
- `chat_assigned` continua **sem produtor**.
- Para navegar, use `target_table` + `target_id`. Numa conversa, o alvo é a **conversa**, não a mensagem.

#### O push — Edge Function `send-push`

A cada minuto, a rotina `push-dispatch` (pg_cron) chama a Edge Function `send-push`, que
consome a fila com `service_role` e envia pelo **OneSignal**. O que isso muda para o app:

- **O `p_token` de `register_device_token` é o subscription ID do OneSignal**
  (`OneSignal.User.pushSubscription.id` no SDK v5). O envio mira **os aparelhos ativos em
  `device_tokens`**, não o `external_id` — é assim que `unregister_device_token` e a
  desativação da conta valem no aparelho. Chame `unregister_device_token` no logout.
- O push traz **só** `headings` = `notification_types.label`, um texto fixo ("Abra o app para
  ver os detalhes.") e `data: { notification_id, type, target_table, target_id }`. **Nenhum
  dado de saúde**: abra o alvo e leia pelo banco. Respostas numa mesma conversa se agrupam no
  aparelho (`collapse_id`).
- Aparelho que o OneSignal recusa como inválido é desativado sozinho.
- **SMS e e-mail** fecham como `skipped` ("canal sem provedor contratado").

**Ligar o push é configuração, não código** (conta da CONTRATANTE):

1. Secrets da função: `PUSH_DISPATCH_SECRET`, `ONESIGNAL_APP_ID`, `ONESIGNAL_REST_API_KEY`. O modelo de todas as variáveis das Edge Functions (push e SMS) está em `supabase/functions/.env.example`.
2. Deploy: `supabase functions deploy send-push` (sai com `verify_jwt = false`, de propósito).
3. Dois segredos no Vault do banco: `push_dispatch_url` (URL completa da função) e
   `push_dispatch_secret` (o **mesmo** valor de `PUSH_DISPATCH_SECRET`).

Sem os dois segredos do Vault, a rotina não chama nada, e a caixa de entrada continua
funcionando normalmente. Sem as credenciais do OneSignal, a função responde `503` **sem
reivindicar a fila**: as entregas esperam `pending` até a credencial chegar.

**`notification_deliveries` não é para o front-end.** A tabela tem RLS ligada e **nenhuma
política**, e isso é intencional: é a fila de envio por canal, e só `service_role` a consome,
pelas RPCs `claim_notification_deliveries` e `mark_delivery_result` (a Edge Function
`send-push`). `anon` e `authenticated` não têm sequer `SELECT` — `.from('notification_deliveries')`
devolve `permission denied`, não `[]`. O advisor lista a tabela como *RLS enabled, no policy*
(nível INFO); é o desenho, não esquecimento. O estado de leitura que interessa ao usuário
está em `notifications`.

---

### 5.9 Alerta de sintoma crítico — `alerts`, `alert_rules`, `gemed_outbox`

O caminho quente: `diário → regra → alerta → notificação → fila do Gemed`. **Nenhuma escrita direta.**

| RPC | Quem |
|---|---|
| `claim_alert(p_alert_id)` → `alert_status` | profissional com `alerts.triage` — assume |
| `assign_alert(p_alert_id, p_professional_id)` | profissional com `alerts.triage` — designa e notifica o designado |
| `resolve_alert(p_alert_id, p_conduct_kind, p_conduct_notes?)` | quem tem `alerts.triage` **ou** o profissional designado |
| `set_alert_rule(p_symptom_id, p_min_grade)` / `disable_alert_rule(p_symptom_id)` | **administrador** |

Leitura: `read_alerts` (a fila), `read_patient_alerts` (o histórico do paciente) e
`read_alert_gemed_status` (o indicador *"já foi registrado no Gemed"*, **em lote**).

- **`p_conduct_kind`** é `'guidance' | 'scheduling' | 'referral'`, e é **obrigatório** ao resolver.
  Alarme falso também se resolve: registre a conduta que diz isso, porque não há estado de
  descarte.
- **Estados:** `open → in_progress → resolved`. Sem volta, garantido por trigger.
- **Assumir de novo devolve erro** (`alerta inexistente ou ja assumido`): a exclusividade é
  `UPDATE` condicional no servidor. Trate como "outra pessoa pegou" e recarregue a fila.
- **A fila ordena por tempo de espera**, `created_at` crescente. **Não existe gravidade**,
  prioridade nem marca de IA — e não vai existir: é nível COMPLETO por contrato.
- **`alerts` NÃO entra no Realtime.** O tempo real do alerta chega por `notifications`
  (tipo `critical_alert`), que carrega referência e nunca conteúdo.
- **O paciente e o cuidador não leem `alerts`.** `.from('alerts')` devolve `[]` para eles.

> ⚠️ **O módulo nasce inerte, e são DOIS atos do administrador que o ligam.**
> 1. Cadastrar ao menos um gatilho (`set_alert_rule`) — sem regra, nenhum alerta dispara.
> 2. Conceder `alerts.triage` a quem for navegadora — sem isso, o alerta que disparar
>    **não notifica ninguém**, porque quem é notificado é exatamente quem pode assumir.
>
> Com as duas pendentes, a fila fica vazia e silenciosa **com tudo correto no banco**. Se você
> está caçando "por que o alerta não funciona", comece por aqui.

### 5.10 NPS — `nps_surveys`, `nps_responses`

- A pesquisa é **aberta pelo banco**, nunca pelo app: `.rpc('open_nps_survey')` devolve
  `permission denied` para qualquer usuário. **Desde 25/09/2026 a do primeiro acesso abre
  sozinha**, no instante em que o paciente ativa o app (`accept_patient_invitation`). O app
  descobre a pesquisa pendente lendo `nps_surveys` depois do login — não há push de NPS.
  Os marcos de meio e fim do tratamento continuam **inertes**: dependem do ciclo, que só o
  Gemed preenche.
- O titular lê a própria pesquisa por `.from('nps_surveys')` e responde com
  `.insert()` em `nps_responses` (`score` 0–10, `comment` opcional).
- **Uma resposta por pesquisa, e ela é final.** `UPDATE` e `DELETE` são recusados.
- **O cuidador não responde** pelo tutelado, e **o profissional não lê** resposta nenhuma.
  A administração lê tudo, inclusive o comentário.
- Não há comparativo por especialidade, e não há notificação de NPS.

### 5.11 Permissões do profissional — `permissions`, `professional_permissions`

O catálogo deixou de ser inerte. **Dois códigos** existem hoje:

| Código | O que libera |
|---|---|
| `alerts.triage` | assumir, designar e resolver alerta |
| `schedule.manage` | marcar, remarcar e alterar compromisso |

| RPC | Quem |
|---|---|
| `grant_professional_permission(p_professional_id, p_code)` | administrador |
| `revoke_professional_permission(p_professional_id, p_code)` | administrador |

- **Revogar não apaga a linha** — ela fica com `revoked_at` preenchido. A tela de histórico
  deve filtrar `revoked_at is null` para listar o que está vigente.
- **Código inexistente levanta erro**, não é ignorado.
- A semântica do catálogo é **invertida**, e conhecê-la evita surpresa: código **fora** do
  catálogo libera para todos; código **dentro** libera só para quem tem concessão vigente.

### 5.12 Cadastro do paciente e ativação do app — `patients`, `patient_invitations`

**Novo em 11/09/2026.** Antes disso não havia caminho nenhum: `patients` era somente leitura e
`account_id` não tinha como ser preenchida.

| RPC | Quem | O que faz |
|---|---|---|
| `create_patient(nome, cpf, nascimento, telefone?, email?, endereco?, convenio?)` | administrador | cria a ficha, sem conta. Devolve o `id` |
| `update_patient(id, …)` | administrador | corrige. **Argumento nulo = coluna inalterada** |
| `set_patient_active(id, boolean)` | administrador | desativa e reativa |
| `invite_patient(id, destino?, validade?)` | administrador | emite o convite. Devolve `(invitation_id, token)` |
| `cancel_patient_invitation(id)` | administrador | cancela o pendente |
| `accept_patient_invitation(token, cpf, nascimento)` | **a conta do paciente** | liga ficha e conta. Devolve o `patient_id` |
| Edge Function `send-patient-invite` `{ patient_id }` | administrador | **envia o convite por SMS** ao celular da ficha. Devolve `{ invitation_id, phone_masked, expires_at }`, **nunca** o token. Desde 25/09/2026 |
| `unlink_patient_account(id)` | administrador | desfaz o vínculo |

> [!note] Convite por SMS (`send-patient-invite`)
> O destino é **sempre o celular da ficha**; para outro número, corrija a ficha com `update_patient`
> antes. Erros: `forbidden`, `patient_not_found`, `patient_already_linked`, `patient_inactive`,
> `invalid_phone` (fixo ou incompleto) e `sms_failed`. Em `sms_failed` o convite emitido é
> **cancelado**: caia para o "mostrar uma vez" com `invite_patient`. Sem conta do Twilio configurada,
> a função responde `sms_failed` sem emitir nada.

**O CPF pode ir mascarado.** `529.982.247-25` e `52998224725` são a mesma coisa: a RPC normaliza.

**O aceite tem dois fatores, e isso é da tela:** além do token que chegou por SMS, o app precisa
mandar **CPF e data de nascimento** — que o onboarding já coleta. Sem os dois, recusa.
(⚠️ **Corrigido em 25/09/2026:** até então, `p_birth_date` **nulo** passava — token + CPF ativavam
a ficha. Hoje nulo recusa com `invalid_invitation`, como qualquer dado que não confere.)

```ts
// no painel: cadastrar e convidar
const { data: patientId } = await supabase.rpc('create_patient', {
  p_full_name: nome, p_cpf: cpf, p_birth_date: nascimento, p_phone: telefone,
})
const { data: convite } = await supabase.rpc('invite_patient', { p_patient_id: patientId })
// convite[0].token vem em texto puro UMA vez — é o que o SMS carrega. Não há como reemitir.

// no app, depois do signup:
const { data: myPatientId, error } = await supabase.rpc('accept_patient_invitation', {
  p_token: tokenDoLink, p_cpf: cpf, p_birth_date: nascimento,
})
```

> [!IMPORTANT]
> **Todas as recusas do aceite dão a mesma mensagem — `invalid_invitation` — e isso é deliberado.**
> Token inexistente, token já usado, token vencido, CPF que não confere e nascimento que não
> confere são **indistinguíveis** de propósito: mensagens diferentes permitiriam descobrir o CPF
> de uma ficha por tentativa e erro. **Não tente explicar ao usuário qual dos cinco foi** — a tela
> honesta diz "não conseguimos confirmar seus dados" e oferece falar com a clínica.
>
> Duas recusas escapam da regra, porque não vazam nada: `account_has_other_profile`
> (a conta já é admin, profissional ou cuidador — essa conta não ativa o app) e
> `account_already_linked` (a conta já é de outro paciente).

**Erros que a tela deve tratar por nome:**

| Erro | O que significa | O que a tela faz |
|---|---|---|
| `patient_cpf_already_registered` | CPF já cadastrado e **ativo**. O `patient_id` vem no `DETAIL` | oferecer "abrir a ficha existente" |
| `patient_cpf_registered_inactive` | existe e está **desativada** | oferecer reativar, não cadastrar de novo |
| `invalid_cpf` | não tem 11 dígitos | validação de formulário |
| `patient_already_activated` | já tem conta ligada | desvincular antes de convidar de novo |
| `cpf_frozen_after_activation` | CPF não muda depois da ativação | desvincular, corrigir, convidar de novo |
| `missing_destination` | sem telefone na ficha e sem destino no argumento | pedir o telefone |
| `masked_value_rejected` | `update_patient` recebeu CPF, telefone ou e-mail **mascarado** (com `*`) | mandar `null` para manter, ou o valor completo para trocar |

#### Identificadores mascarados na ficha — **desde 25/09/2026**

`read_patient` e `read_patients` devolvem a mesma linha de sempre, com quatro campos trocados:

| Campo | Sai como |
|---|---|
| `cpf` | `529.***.***-25` |
| `phone` | `(**) *****-1234` |
| `email` | `m***@exemplo.com.br` |
| `documents` | `null` |

A máscara serve para **conferir** um valor que o operador já tem em mãos. Quando a tela precisar
do valor completo (ligar para o paciente, conferir documento), o botão "revelar" chama:

```ts
const { data } = await supabase.rpc('reveal_patient_identifiers', { p_patient_id: id })
// data[0] = { patient_id, cpf, phone, email, documents } — completos
```

- **Cada chamada deixa linha própria na trilha** (`resource_table = 'patient_identifiers'`),
  separada da abertura da ficha — inclusive quando volta vazia. Não chame por antecipação: revele
  quando o usuário pedir.
- Revela quem pode abrir a ficha, nem mais nem menos. O **titular** lê os próprios dados direto,
  sem máscara, e não precisa desta função.
- **Formulário de edição:** não devolva o que veio mascarado. Campo não tocado vai `null`
  (= inalterado); o banco recusa valor com `*` (`masked_value_rejected`) para a máscara nunca ser
  gravada por cima do dado.

- **Reenviar cancela o convite anterior.** Só existe **um** convite pendente por paciente, e isso
  é garantido por índice — quem reenvia costuma estar corrigindo o telefone, e o token antigo
  precisa morrer junto.
- **O convite expira** (default 7 dias). O de cuidador não expira; este sim.
- **A fila do que há para reenviar** é `.from('patient_invitations')`, só para administrador.

### 5.13 Cadastro do profissional — `professionals`, `professional_specialties`

**Novo em 11/09/2026.**

| RPC | Quem | O que faz |
|---|---|---|
| `create_professional(account_id, conselho, specialty_ids[], primaria?)` | administrador | cria o perfil sobre conta **existente** |
| `update_professional(id, conselho)` | administrador | corrige o registro de conselho |
| `set_professional_active(id, boolean)` | administrador | **a revogação oficial de acesso** |
| `set_professional_specialties(id, specialty_ids[], primaria?)` | administrador | redefine as áreas vigentes |

- **A pessoa precisa ter criado a conta antes** — a RPC recebe `account_id`, não cria usuário.
  Erro `account_not_found`.
- **Registro de conselho é obrigatório** (`council_registration_required`), e o formato **não** é
  validado: CRM, COREN e CREFITO têm formatos diferentes e uma regex rejeitaria cadastro legítimo.
- **Ao menos uma especialidade** (`specialty_required`). Sem área o perfil nasce inerte: a pessoa
  entra e não consegue registrar nada.
- **Ninguém cria nem edita o próprio perfil profissional** (`cannot_manage_own_professional_profile`).
  Um administrador que se concedesse `psychology` leria o que nem a administração pode ver. A
  clínica **pode** ter quem acumule os dois papéis: outro administrador faz a concessão.
- **Tirar uma especialidade encerra a vigência, não apaga a linha.** O histórico de quem podia ler
  o quê, e em que data, é o que uma auditoria pergunta.

### 5.14 Lista de pacientes — `read_patient_list`

Substitui `read_patients` na tela de pacientes. **A antiga saiu em 25/09/2026** (Fase 6): chamá-la
devolve `PGRST202`. O que faltava para migrar era a data de cadastro, e ela agora vem no fim da
linha (`created_at`).

```ts
const { data, error } = await supabase.rpc('read_patient_list', {
  p_search: termo || null,          // nome (sem acento/caixa), CPF por prefixo, chave do Gemed
  p_protocol: protocolo || null,    // protocolo VIGENTE do paciente
  p_cid10_code: cid || null,
  p_treatment_phase_id: faseId || null,
  p_is_active: true,                // null traz ativos e arquivados
  p_order_by: 'full_name',          // full_name | birth_date | created_at |
                                    // primary_cid10_code | treatment_phase | is_active
  p_order_desc: false,
  p_limit: 20,
  p_offset: (pagina - 1) * 20,
})
// data[0].total_count === 340  →  "1–20 de 340"
```

- **O total vem em cada linha** (`total_count`), e é o do conjunto **filtrado**, não o da página.
  É o fim do defeito que escondia gente a partir do paciente 201. Ressalva: **página vazia não
  carrega total** — se o offset passar do fim, refaça a consulta do começo.
- **A busca por nome ignora acento e caixa.** "jose goncalves" acha "José Gonçalves". Não é
  conforto: se não achasse, a recepção cadastraria a pessoa de novo.
- **O CPF sai mascarado** (`cpf_masked`, `000.***.***-91`). A máscara basta para confirmar um
  número que o operador já tem em mãos, e não serve para coletar. O CPF completo está em
  `reveal_patient_identifiers`, um paciente por vez, com o acesso registrado naquele titular
  (5.12). `read_patient` também mascara desde 25/09/2026.
- **Não sai `account_id`** — sai `has_account` (booleano), que é o que a lista precisa saber.
- **Vem junto o que a lista mostra**, sem uma segunda chamada por paciente: `treatment_phase_label`,
  `protocol_name`, `current_cycle_number`, `primary_cid10_code`, `primary_cid10_label`.
- **Filtro de risco não existe e não vai existir nesta fase.** "Risco" são as etiquetas da
  sistematização de enfermagem do Gemed, e elas **não estão no escopo de leitura contratado**.
- **Ordenações** (desde 25/09/2026, além de nome, nascimento e cadastro): `primary_cid10_code`
  (o CID que a coluna mostra), `treatment_phase` (pela **ordem da jornada** — ativo antes de
  seguimento —, não pelo rótulo) e `is_active`. **Nulo vai sempre para o fim**, nos dois
  sentidos. Empate dentro do mesmo CID, fase ou situação se resolve pelo nome.
- `p_order_by` fora da lista é **recusado** — não há SQL dinâmico aqui.
- **As opções do filtro por protocolo** vêm de `summarize_treatment_protocols()` (seção 3): nome
  e contagem, sem paciente. `p_protocol` casa por **igualdade** com o plano vigente, então
  "FOLFOX" e "Folfox" são duas opções, como são dois valores gravados.

### 5.15 Agenda da clínica — `read_clinic_agenda`

A leitura que faltava ao painel administrativo. `read_appointments` exige um paciente e
`read_my_agenda` resolve o **profissional logado** — e o administrador, que não tem perfil
profissional, recebia zero.

```ts
const { data } = await supabase.rpc('read_clinic_agenda', {
  p_from: inicioDaSemana.toISOString(),
  p_to:   fimDaSemana.toISOString(),
  p_specialty_id: null,
  p_appointment_type_id: null,
  p_status_code: null,              // scheduled | completed | cancelled | no_show | rescheduled
  p_limit: 100,
  p_offset: 0,
})
```

- **Janela obrigatória.** Sem `p_from`/`p_to` a chamada é recusada.
- Devolve a **linha** do compromisso (é `read_`, não `summarize_`): o total da janela vem de
  `summarize_appointments`.
- **O sigilo vale aqui.** A sessão de psicologia some da agenda do administrador — não é o
  conteúdo que se esconde, é a linha. A psicóloga vê a dela.
- Ordem **crescente** por horário, como `read_my_agenda`. Teto de 200 no servidor.

### 5.16 Motivos de falta e cancelamento — `appointment_status_reasons`

A tabela já tem como ser preenchida, o que antes não acontecia. Continua **vazia** porque a
lista é da clínica: motivo inventado por engenharia vira estatística clínica falsa.

| RPC | O que faz |
|---|---|
| `create_status_reason(status_code, code, label, sort_order?)` | cadastra o motivo para um estado |
| `update_status_reason(id, label?, sort_order?)` | corrige rótulo e ordem |
| `set_status_reason_active(id, boolean)` | aposenta e reativa |

- **Só estado terminal aceita motivo** (`completed`, `cancelled`, `no_show`,
  `rescheduled`). *Agendado* não se explica por um motivo.
- **O código não muda.** Ele é a chave que relatório, filtro e exportação usam;
  renomeá-lo quebraria a série histórica em silêncio. A RPC nem aceita o
  argumento. Errou o motivo? Aposente e crie outro.
- **`code` aceita só minúsculas, dígitos e underscore.** O rótulo é livre.
- Assim que houver linhas, `set_appointment_status(…, p_reason_id)` passa a
  aceitar o motivo, e o recorte por motivo aparece sozinho em
  `summarize_appointments`.

### 5.17 Termos de uso e política de privacidade — `publish_legal_document`

```ts
await supabase.rpc('publish_legal_document', {
  p_kind: 'terms_of_use',        // terms_of_use | privacy_policy
  p_body: textoCompleto,
})
```

- **Publicar cria versão nova e aposenta a anterior**, na mesma transação. **Não
  existe editar a vigente**, e a ausência é deliberada: o aceite aponta para a
  versão, e editar no lugar faria quem aceitou a v1 constar como tendo aceitado
  a v2.
- A numeração é **por espécie**: os termos e a política evoluem separados.
- Só administrador publica.
- `accept_legal_terms()` já existia e estava inerte por falta de versão vigente.
  Ele aceita **todas** as vigentes de uma vez e devolve quantas registrou.
- **A tabela continua vazia**: o texto vem da clínica.

### 5.18 Segundo fator do administrador — `security_settings`

O painel pedia o segundo fator e **nenhuma política olhava o nível da sessão**.
Agora olha, e a exigência nasce **desligada**.

```ts
const { data } = await supabase.from('security_settings').select('require_admin_mfa')
await supabase.rpc('set_require_admin_mfa', { p_required: true })
```

- **Desligada, nada muda.** Ligada, `private.is_active_admin()` passa a exigir
  `aal2` no JWT, e sessão sem segundo fator deixa de ler prontuário, deixa de
  ler a trilha e deixa de executar RPC de administrador.
- **A exigência é do perfil administrativo.** O profissional não é alcançado.
- **Ligar exige uma sessão que já cumpra a exigência.** Quem tentar ligar de uma
  sessão `aal1` recebe recusa, e essa é a guarda contra trancar a clínica do
  lado de fora: ligar só passa se ao menos um administrador provar, naquele
  instante, que consegue voltar a entrar. Desligar não impõe a mesma prova.
- **Trate o erro na tela antes de ligar.** O usuário precisa de "sua sessão
  precisa de segundo fator" e do caminho de cadastro, não de tela vazia.

### 5.19 Direitos do titular e exportação — `data_subject_requests`, `log_data_export`

**Desde 25/09/2026.** O pedido do titular vai do registro ao cumprimento, e toda exportação
passa a poder ficar na trilha.

**O ciclo do pedido.** O banco recusa qualquer transição fora desta (`42501`, `invalid_transition`),
também para `service_role`:

```
requested ──► under_review ──► granted ──► executed
    │              └──► refused
    ├──► granted
    └──► refused
```

| Tipo | Como se cumpre | Quem fecha |
|---|---|---|
| `access`, `portability` | O titular baixa o pacote com `export_my_data` | a primeira entrega |
| `deletion` | Rotina a cada 5 min: **encerra o acesso** (ver abaixo) | a rotina |
| `consent_revocation` | Rotina a cada 5 min: revoga os consentimentos vigentes | a rotina |
| `rectification` | O admin corrige a ficha pelas RPCs de sempre e declara | `complete_data_subject_request` |

```ts
// painel
await supabase.rpc('decide_data_subject_request', { p_request_id: id, p_status: 'under_review' })
await supabase.rpc('decide_data_subject_request', { p_request_id: id, p_status: 'refused',
  p_note: 'Motivo que o titular vai ler.' })
// app — o titular lê os próprios pedidos direto
const { data } = await supabase.from('data_subject_requests')
  .select('id, request_type, status, decision_note, created_at, decided_at, executed_at')
  .order('created_at', { ascending: false })
```

- **O titular lê os próprios pedidos** (`.from('data_subject_requests')`), inclusive o motivo da
  recusa, que vai em `decision_note`. O cuidador não lê os do tutelado. O titular com conta
  encerrada **continua lendo** o próprio pedido: é por ele que o app mostra "conta encerrada em …".
- **Prazo legal:** conte a partir de `created_at`. Não há coluna de prazo.
- **`execution_error`** (só o painel precisa): a rotina não conseguiu executar, e o pedido continua
  `granted`. O caso conhecido: o **último administrador** pedindo exclusão.

**O que a exclusão faz — e o que NÃO faz.** Por decisão da clínica (controladora), a exclusão
**encerra o acesso** e o prontuário fica guardado. A rotina revoga os consentimentos, revoga os
vínculos de acompanhante (dos dois lados), cancela convites pendentes e **desativa a conta**, o que
desliga também os aparelhos. **Nada é apagado nem anonimizado**: a ficha continua ativa e a equipe
continua lendo. O painel **não deve** dizer ao titular que "os dados foram apagados".

**O pacote de acesso/portabilidade** — no app:

```ts
const { data: pacote, error } = await supabase.rpc('export_my_data', { p_request_id: id })
// salve `pacote` como arquivo .json no aparelho (Filesystem/Share do Capacitor)
```

- JSON com `format: 'jornada-supera/data-subject-export'`, `format_version: 1`, `account`,
  `patient` (a ficha, o diário, a agenda, o chat, planos, diagnósticos… ou `null` se a conta não é
  titular) e as seções da conta (`consents`, `notifications`, `caregiver_links`…).
- **É o que o app já mostra ao titular, nem mais nem menos**: a função lê com a RLS dele. Anotação
  de especialidade e alerta não entram. Anexos vêm como **metadado**; o arquivo se baixa pelo
  Storage, como hoje.
- **Não há link.** O pacote é montado na hora e não fica guardado em lugar nenhum.
- **Janela de 15 dias** a partir do deferimento. Pode baixar de novo dentro dela, e cada download
  fica na trilha como exportação. Depois, `export_window_closed`: o titular faz outro pedido.
- **A conta precisa estar ativa.** Se o titular pediu acesso e exclusão, o painel deve deferir a
  exclusão **depois** de ele baixar o pacote.

| Erro | Quando |
|---|---|
| `request_not_available` (`42501`) | pedido inexistente, de outra conta, de outro tipo, ou ainda não deferido — **a mensagem é a mesma de propósito** |
| `export_window_closed` (`42501`) | passaram 15 dias do deferimento |
| `refusal_requires_reason` (`22023`) | recusa sem `p_note` |
| `request_not_open` (`42501`) | decidir pedido já decidido |
| `request_not_completable` (`42501`) | `complete_…` em pedido que não é retificação deferida |

**Declarar exportação no painel.** O CSV da trilha, o relatório, a lista de pacientes: o arquivo é
gerado no navegador, e o banco não tem como saber que ele saiu. **Chame a RPC ao gerar o arquivo:**

```ts
await supabase.rpc('log_data_export', { p_scope: 'patient_list', p_row_count: linhas.length })
await supabase.rpc('log_data_export', { p_scope: 'patient_record', p_row_count: 1, p_patient_id })
```

- `p_scope` é **identificador** `snake_case` (`^[a-z][a-z0-9_]{0,62}$`), nunca texto: `'lista da
  Maria'` é recusado com `invalid_export_scope`. Nome gravado na trilha não se elimina.
- Administrador e profissional ativo. A trilha registra quem, quando, que recorte, quantas linhas
  e de qual ficha — **nunca o conteúdo**. No módulo de auditoria, filtre `action = 'export'`.
- **Justificativa de desativação de ficha não é persistida.** Texto livre na trilha imutável seria
  dado pessoal sem correção possível. Se a tela pede motivo, trate como confirmação.

### 5.20 Configuração da clínica — `clinic_settings`, `clinic_business_hours`, `operational_parameters`

**Desde 25/09/2026.** As abas Identidade Visual, Mensagens e Atendimento do painel têm onde gravar.
Uma RPC por aba, e cada uma salva **a aba inteira**: `NULL` apaga, não significa "não mexe".

```ts
// Leitura: qualquer usuário logado (banner de horário, cor, logo)
const { data: cfg }   = await supabase.from('clinic_settings').select('*').single()
const { data: horas } = await supabase.from('clinic_business_hours').select('weekday, opens_at, closes_at')

// Identidade visual — o logo SOBE primeiro, depois registra (o inverso do anexo clínico)
await supabase.storage.from('clinic-branding').upload('logo.png', file, { contentType: 'image/png', upsert: true })
await supabase.rpc('set_clinic_branding', { p_primary_color: '#0a7b83', p_secondary_color: '#ffffff', p_logo_path: 'logo.png' })

// Mensagens — slides do carrossel e o texto fora do horário (texto vazio ou NULL = desligada)
await supabase.rpc('set_clinic_messages', {
  p_onboarding_slides: [{ title: 'Bem-vindo', body: 'Acompanhe seu tratamento.' }],
  p_off_hours_message: 'Estamos fora do horário. Em caso de urgência, procure o pronto atendimento.',
})

// Atendimento — fuso e a SEMANA INTEIRA (troca, não soma). weekday: 0 = domingo
await supabase.rpc('set_clinic_business_hours', {
  p_time_zone: 'America/Sao_Paulo',
  p_hours: [{ weekday: 1, opens_at: '08:00', closes_at: '12:00' }, { weekday: 1, opens_at: '13:00', closes_at: '18:00' }],
})

// Linhas de referência dos gráficos (só o admin lê e grava). O código é da tela
await supabase.rpc('set_operational_parameter', { p_code: 'monthly_appointments_target', p_label: 'Meta mensal', p_value: 400 })
```

- **Um horário para toda a equipe.** Não há horário por área nem por profissional (a clínica
  respondeu em 31/08/2026). Vários intervalos por dia são aceitos; sobreposição e intervalo que
  atravessa a meia-noite, não. **Sem feriados**: a grade é semanal.
- **Slides:** até 5, cada um exatamente `{ title, body }`, título até 80 e corpo até 400
  caracteres. Chave a mais é recusada, porque o slide é lido **sem login**.
- **Cores:** `#rrggbb`. O banco guarda em minúsculas.
- **Estado de fábrica:** sem slides (o app usa o texto embutido), sem cores, sem logo, sem
  horário e **sem mensagem fora do horário**. Os textos são da clínica.

**A única leitura sem login do projeto.** O carrossel aparece antes de haver conta:

```ts
const anon = createClient(URL, ANON_KEY)
const { data } = await anon.rpc('get_clinic_presentation')
// [{ onboarding_slides, primary_color, secondary_color, logo_path }]
const logoUrl = data[0].logo_path
  ? `${URL}/storage/v1/object/public/clinic-branding/${data[0].logo_path}` : null
```

Ela devolve só essas quatro colunas. `clinic_settings` continua fechada a quem não fez login.

**Mensagem fora do horário.** Com texto e horário configurados, quando o paciente ou o
acompanhante escreve com a clínica fechada, o banco grava **uma** mensagem `author_kind = 'system'`
na conversa com o texto. Uma por conversa **por período fechado**: três mensagens na mesma
madrugada recebem uma resposta; o fim de semana inteiro é um período só. O app a recebe pelo
Realtime como qualquer mensagem. **Não gera push**, e a equipe não precisa fazer nada. Mensagem
da equipe fora do horário não dispara nada.

### 5.21 Vocabulários editáveis — sintomas, categorias, assuntos, tipos

**Desde 25/09/2026.** A administração cria, corrige e aposenta os termos pelo painel.
**Nenhum termo se apaga** e **nenhum código se renomeia**: o banco recusa, para todo papel.

```ts
await supabase.rpc('create_symptom',              { p_code: 'tontura', p_label: 'Tontura', p_sort_order: 13 })
await supabase.rpc('create_content_category',     { p_code: 'exercicio', p_label: 'Exercício físico', p_specialty_id })
await supabase.rpc('create_conversation_subject', { p_code: 'documents', p_label: 'Documentos' })
await supabase.rpc('create_appointment_type',     { p_code: 'imaging', p_label: 'Exame de imagem', p_color: '#1e88e5', p_icon_name: 'scan' })
await supabase.rpc('set_appointment_type_style',  { p_id, p_color: '#1e88e5', p_icon_name: 'scan' })

// Rótulo e ordem, e aposentar/reativar: uma função para os cinco vocabulários
// p_vocabulary: 'symptoms' | 'content_categories' | 'conversation_subjects' | 'appointment_types' | 'notification_types'
await supabase.rpc('update_vocabulary_term',     { p_vocabulary: 'symptoms', p_id, p_label: 'Tontura ou vertigem' })
await supabase.rpc('set_vocabulary_term_active', { p_vocabulary: 'appointment_types', p_id, p_is_active: false })
```

- **Código:** minúsculas e `_`, começando por letra. Repetido devolve `23505` ("já existe").
- **Aposentados:** o administrador continua lendo os inativos de tipos de compromisso, assuntos,
  tipos de notificação e motivos de falta, para poder reativar. Os demais perfis veem só os ativos.
- **Tipo de notificação não se cria**, porque só o banco produz notificação. Rótulo e ordem se
  corrigem, e os silenciáveis se aposentam (**aposentar para de gerar aquele tipo para todos**).
  `critical_alert` e `alert_assigned` **não se desligam**: devolve `23001`.
- **Assunto novo nasce sem roteamento.** Categoria nova exige especialidade.
- **Trocar a especialidade de uma categoria** ou a marca psicológica de um sintoma não existe:
  aposente e crie outro.
- Motivos de falta seguem com as RPCs próprias (5.16).

### 5.22 Relatório agendado — `report_schedules`, `report_runs`

Desde 25/09/2026. A administração agenda "o relatório X, toda segunda às 8h, para fulano", e o
banco **avisa** na hora certa, com o período já fechado. **O aviso leva a referência, nunca o
arquivo**: relatório anexado a e-mail seria dado de saúde parado numa caixa de correio, fora do
controle da clínica e sem trilha. O painel abre o relatório com o login de quem recebeu, e a
leitura paga o pedágio de sempre (as `summarize_*`).

```ts
// agendar — só administrador; destinatário padrão é quem agenda
const { data: id } = await supabase.rpc('create_report_schedule', {
  p_report_code: 'efeitos_por_protocolo',  // o código é do PAINEL: minúsculas e _
  p_frequency: 'weekly',                   // daily | weekly | monthly
  p_send_at: '08:00',                      // hora LOCAL, no fuso da clínica
  p_weekday: 1,                            // ISO, 1 = segunda — só no semanal
  // p_month_day: 5,                       // 1 a 28 — só no mensal
  // p_recipient_account_id: outroAdminId, // precisa ser administrador ativo
})

// salvar o formulário inteiro (recalcula o próximo disparo a partir de agora)
await supabase.rpc('update_report_schedule', { p_schedule_id: id, p_report_code, p_frequency,
  p_send_at, p_weekday, p_month_day, p_recipient_account_id })

// desligar / religar — não há delete
await supabase.rpc('set_report_schedule_active', { p_schedule_id: id, p_is_active: false })

// a tela: todos os agendamentos, de todos os administradores
await supabase.from('report_schedules').select('*').order('next_run_at')
```

**O aviso** chega como notificação `report_ready` (categoria `report`, público `team`), com
`target_table = 'report_runs'`. Leia a linha do alvo para saber **qual** relatório e **qual**
período abrir:

```ts
const { data: run } = await supabase.from('report_runs')
  .select('report_code, period_start, period_end').eq('id', notification.target_id).single()
```

- **Os períodos são dias completos e já encerrados**, no fuso da clínica: diário = ontem;
  semanal = os sete dias que terminam ontem; mensal = o mês calendário anterior.
- **Atraso não vira rajada.** Se a rotina ficar parada três dias, sai **um** aviso, o do
  disparo previsto, e o próximo é calculado a partir de agora.
- **Destinatário que deixou de ser administrador ativo não recebe**, e o agendamento continua
  ativo e visível: desligá-lo é decisão da administração.
- `month_day` vai até 28 de propósito: "todo dia 31" pularia cinco meses sem avisar.
- Erros: `forbidden` (42501), `invalid_report_code`, `invalid_schedule`, `recipient_not_admin`
  (22023) e `report_schedule_not_found` (P0002).
- **O e-mail ainda não sai.** O aviso aparece na caixa do painel e no push; a entrega por
  e-mail fica `skipped` até existir um provedor de e-mail transacional (seção 11).

---

## 6. Escrita direta vs. RPC — a lista fechada

**Só isto aceita `.insert()` / `.update()` / `.upsert()` direto:**

| Tabela | Verbos | Por quem |
|---|---|---|
| `accounts` | UPDATE (`full_name`, `phone`, `avatar_path`) | o dono |
| `diary_entries` | INSERT, UPDATE (rascunho) | titular e cuidador |
| `diary_symptom_reports` | INSERT, UPDATE, DELETE (rascunho) | titular e cuidador |
| `messages` | INSERT | paciente, cuidador, profissional da área |
| `message_attachments` | INSERT (**nunca** UPDATE/DELETE — o anexo é imutável, §7) | autor da mensagem |
| `specialty_notes` | INSERT | profissional, na própria especialidade |
| `content_items` | INSERT, UPDATE (`category_id`) | autor |
| `content_versions` | INSERT, UPDATE (conteúdo + `status`) | autor, em **`draft`** (`returned` não existe mais) |
| `content_cid10`, `content_attachments` | ALL | autor |
| `patient_content_states` | ALL | só o titular |
| `professional_blocks` | ALL | só o dono |
| `notifications` | UPDATE (`read_at`, `archived_at`) | destinatário |
| `notification_preferences` | ALL | dono |
| `nps_responses` | INSERT | só o titular da pesquisa — e uma única vez |

**Todo o resto é RPC.** Tentar `.insert()` fora desta lista devolve `permission denied` ou
`violates row-level security policy` — nunca funciona "por acaso".

---

## 7. Storage — anexos, foto de perfil e logo

Dois buckets **privados** para anexo, ambos 20 MiB por arquivo (foto de perfil e logo no fim desta seção):

| Bucket | Tipos | Caminho obrigatório |
|---|---|---|
| `content-attachments` | `application/pdf`, `image/png`, `image/jpeg`, `image/webp` | `<content_version_id>/<arquivo>` |
| `chat-attachments` | `image/png`, `image/jpeg`, `image/webp`, `application/pdf` | `<message_id>/<arquivo>` |

**A ordem é obrigatória e não é convenção — é privilégio:**

```ts
// SUBIR: registra a linha PRIMEIRO, depois sobe o arquivo
const path = `${messageId}/${file.name}`
await supabase.from('message_attachments')
  .insert({ message_id: messageId, storage_path: path, mime_type: file.type, byte_size: file.size })
await supabase.storage.from('chat-attachments').upload(path, file)   // sem { upsert: true }
```

Sem a linha registrada, o upload é **negado**. Se o upload falhar depois do registro, **tente de
novo o mesmo caminho**: enquanto o arquivo não existir, o envio continua permitido.

> ⚠️ **MUDOU EM 25/09/2026: anexo do chat é imutável, como a mensagem.** Não existe mais
> "remover": o bucket `chat-attachments` só aceita envio (sem sobrescrever, sem apagar) e
> `message_attachments` não aceita `delete`. O fluxo "REMOVER" que este guia ensinava morria no
> segundo passo. Envio errado se corrige com mensagem nova. `upload(..., { upsert: true })` é
> negado — upsert exige permissão de sobrescrever.

No bucket editorial (`content-attachments`), o autor do rascunho continua podendo trocar e
remover arquivo — ali é material em edição, não mensagem enviada. A ordem é a mesma: apaga o
arquivo **primeiro**, depois a linha; ao contrário, o `delete` falha com `foreign_key_violation`
— para nunca existir arquivo órfão no bucket.

Quem lê o arquivo é exatamente quem lê a linha correspondente. O painel obtém o `storage_path`
do chat **só** por `read_message_attachments` — e é essa chamada que deixa o acesso na trilha.

**Desde 25/09/2026, mais dois buckets, sem linha a registrar:**

| Bucket | Público | Tipos | Caminho | Lê | Escreve |
|---|---|---|---|---|---|
| `avatars` | não | JPEG, PNG, WebP; 5 MiB | `<account_id>/<arquivo>` | **só o dono** | só o dono (troca e apaga) |
| `clinic-branding` | **sim** | PNG, JPEG, WebP; 2 MiB (**sem SVG**) | `<arquivo>` | qualquer um pela URL pública | administração |

```ts
// FOTO: sobe na própria pasta, DEPOIS grava o caminho no perfil
const path = `${session.user.id}/avatar.jpg`
await supabase.storage.from('avatars').upload(path, file, { contentType: 'image/jpeg', upsert: true })
await supabase.from('accounts').update({ avatar_path: path }).eq('id', session.user.id)
const { data } = await supabase.storage.from('avatars').createSignedUrl(path, 3600)  // só o dono consegue
```

- **A foto é só do dono.** Nem a equipe vê a do paciente, nem o paciente vê a do profissional; o
  painel recebe `avatar_path` na linha da conta e **não** consegue baixar o arquivo. Não mostre
  foto de terceiros: é decisão, não falta de tela.
- `avatar_path` fora da própria pasta é recusado (`23514`).
- O logo público se lê por `…/storage/v1/object/public/clinic-branding/<arquivo>`, sem token. A
  listagem do bucket continua fechada para quem não é administrador.

---

## 8. Realtime

Na publicação do Realtime: `messages`, `conversations`, `message_attachments`, `notifications`.

| Quem | Recebe em tempo real |
|---|---|
| App do paciente / cuidador | mensagens, conversas, anexos, notificações |
| Painel clínico / administrativo | **só `notifications`** |

O painel não recebe `messages` — isso é decisão de projeto, não limitação. A lista de conversas
se atualiza por `read_conversations` (barata, já ordenada por `last_message_at`), e o sinal em
tempo real chega pela notificação, que não carrega conteúdo clínico.

`appointments` **não** está no Realtime.

```ts
supabase.channel('inbox').on('postgres_changes',
  { event: 'INSERT', schema: 'public', table: 'notifications' },
  ({ new: n }) => refetch()
).subscribe()
```

---

## 9. Erros comuns e o que significam

| Sintoma | Causa provável | O que fazer |
|---|---|---|
| `[]` no painel, dados existem | `.from()` em tabela clínica | Trocar por `.rpc('read_…')` |
| `new row violates row-level security policy` | `WITH CHECK` reprovou: `patient_id`/`authored_by`/`author_*` não batem com o usuário, ou a linha pai não é sua | Conferir os campos de autoria enviados |
| `permission denied for table X` | Verbo revogado nessa tabela | É RPC, não escrita direta (seção 6) |
| `permission denied for function X` | RPC chamada sem `EXECUTE` para o seu perfil | Perfil errado, ou a função não é do cliente |
| `check_violation` | Trigger de imutabilidade ou máquina de estados | Registro já finalizado / transição não permitida |
| `23505` (unique) | Já existe: cuidador ativo ou pendente, plano vigente, versão publicada, sintoma já marcado | Ler o estado antes |
| `23503` (FK) | Ex.: preferência para `critical_alert` | Insilenciável por desenho |
| `23503` `patient_not_found` | Escrita de ficha (cadastro **ou**, desde 25/09/2026, diagnóstico, histórico, plano e fase) com `p_patient_id` que não existe | Recarregar a lista; a ficha não existe |
| `forbidden` (42501) | RPC chamada por perfil errado | Verificar perfil/especialidade |
| `PGRST202` (função não encontrada) | Nome do parâmetro errado — **ou `read_patients`, que saiu em 25/09/2026** | Os nomes têm prefixo `p_` e batem exatamente; a lista é `read_patient_list` |
| `compromisso ja comecou` | `unconfirm_appointment` depois do início (desde 25/09/2026 avisa, em vez de não fazer nada) | Esconder o botão depois do início |

Enums vão como **string** no JSON: `{ p_channel: 'sms' }`, `{ acting_as: 'patient' }`.

---

## 10. Convenções que valem em todas as tabelas

- **PK** `uuid` v7 (ordenado no tempo) — gerado pelo banco, nunca pelo cliente.
- **Datas** sempre `timestamptz`. Mande ISO com offset; leia convertendo para o fuso local.
- **`created_at` / `updated_at`** existem quando fazem sentido. `updated_at` é do banco — não mande.
- **Estados** são enums ou tabelas de domínio com `code`/`label`. Renderize o `label`, filtre pelo `code`, guarde o `id`.
- **Vocabulário se aposenta com `is_active = false`, nunca se apaga.** Filtre por `is_active` nos seletores; não filtre em histórico.
- **Sempre filtre por `patient_id`** nas listas clínicas — os índices são por paciente + tempo. Exceção única: `read_my_agenda`.
- **Paginação** por chave (`p_before`), não por offset, onde a função oferece.

---

## 11. O que ainda não existe

Não é esquecimento — depende de definição pendente da clínica ou de fornecedor externo.
**Não improvise no front-end** e não crie tabela paralela para contornar: fale com o
responsável pelo banco.

| Não dá para fazer hoje | Situação |
|---|---|
| **Envio efetivo de push** | **Configurado em homologação desde 25/09/2026**: `send-push` publicada, credencial do OneSignal e os dois segredos do Vault gravados, e a rotina roda a cada minuto (5.8). Nenhum envio real ainda: falta um aparelho registrado pelo app (`register_device_token`) e uma notificação para aquela conta. Se o OneSignal recusar a chave, a entrega fecha `failed` com o erro gravado. |
| **Envio efetivo de SMS** | Desde 25/09/2026 as Edge Functions `send-patient-invite` (5.12), `create-caregiver` e `reset-caregiver-password` (5.2) estão publicadas e enviam pelo **Twilio**. **Os secrets do Twilio estão gravados vazios** (secrets `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` e `TWILIO_FROM` ou `TWILIO_MESSAGING_SERVICE_SID`): até lá respondem `sms_failed` sem criar nada. O convite do paciente continua testável pelo "mostrar uma vez" (`invite_patient`), e o acompanhante, pelo WhatsApp. |
| **Sincronização com o Gemed** | `gemed_outbox` enfileira o alerta crítico, e **ninguém consome a fila**. As linhas ficam `pending`. |
| **Integração Gemed** | Nada sincroniza. Diagnóstico e plano entram por RPC manual; as colunas de origem/sync existem e ficam em `local`. A **fila de conferência** do vínculo já existe (`read_external_refs`), e está vazia porque nada propõe vínculo ainda. |
| **NPS de meio e fim do tratamento** | A do **primeiro acesso** abre sozinha desde 25/09/2026. As outras duas dependem do ciclo do plano terapêutico, que só o Gemed preenche. Abrir manualmente pelo painel depende de decisão da clínica. |
| **Definição de "engajamento no app"** | As outras duas frentes de relatório existem desde 11/09/2026 (seção 3). Esta **não**, e não é esquecimento: nenhuma fonte diz o que conta como engajamento. Questão **#44**, a decidir com a clínica. |
| **Comparativo entre profissionais individuais** | O recorte das `summarize_*` é **por especialidade**. Por profissional esbarra no mesmo N mínimo do comparativo de NPS: com poucos casos, a média re-identifica. |
| **SMS e e-mail de notificação** | Os canais existem na fila de notificações e fecham como `skipped`. O Twilio acima serve às credenciais e convites, não à fila. Vale também para o aviso de **relatório agendado** (5.22): chega na caixa e no push, e o e-mail espera um provedor de e-mail transacional, que ainda não foi contratado. |
| **Exportação e mapa de calor** | O banco entrega o número; PDF, Excel e visualização são do front-end. O arquivo gerado deve ser **declarado** com `log_data_export` (5.19). O **agendamento** existe desde 25/09/2026 (5.22). |
| **Filtro por especialidade no resumo de sintomas** | Não existe e não vai existir: o diário não tem especialidade de origem (seção 3, item 8). |
| **Anonimização e eliminação do dado clínico** | A exclusão pedida pelo titular **encerra o acesso** (5.19). Eliminar o prontuário depende da janela de retenção, que é decisão legal da clínica. |
| **Roteamento automático de conversa** | O mapa assunto → especialidade está vazio; tudo cai na fila geral. |
| **A lista de motivos de falta** | As RPCs existem (5.16); a **lista** é da clínica. Enquanto a tabela estiver vazia, `p_reason_id` fica `NULL`. |
| **Cor e ícone de tipo de compromisso** | Nascem `NULL`. Desde 25/09/2026 a administração os define por `set_appointment_type_style` (5.21); falta a clínica escolher. |
| **Texto da mensagem fora do horário e dos slides** | O mecanismo existe (5.20) e nasce **desligado**: o texto é da clínica. |
| **Feriados no horário de atendimento** | A grade é semanal. Num feriado em dia útil, a mensagem automática não dispara. |
| **Gatilhos de criticidade** | `alert_rules` nasce **vazia**, de propósito: o limiar clínico é decisão da clínica, não de engenharia. Sem regra, nenhum alerta dispara. |
| **Relatório de falso positivo do alerta** | Não há estado de descarte. Alarme falso se resolve, e a conduta registrada é que diz isso. |
| **Comparativo de NPS por especialidade** | Não existe view, e não vai existir sem decisão sobre N mínimo: com poucos respondentes, a média de uma especialidade re-identifica quem respondeu. |
| **Paciente ler anotações da equipe** | Sem política — decisão pendente. |
| **Tela de concessão de permissão** | As RPCs existem (seção 5.11) e o catálogo tem dois códigos. Falta a **tela** do painel administrativo — e sem ela ninguém concede `alerts.triage`, o que mantém a fila de alertas silenciosa. |
| **O texto dos termos de uso** | A RPC de publicação existe (5.17) e a tabela continua **vazia**: o texto vem da clínica. Nenhum paciente real deve entrar antes de haver versão vigente. |
| **Exigência de segundo fator em vigor** | O mecanismo existe e nasce **desligado** (5.18). Ligá-lo é decisão de data, e depende de a tela tratar o erro e de haver administrador com autenticador cadastrado. |
| **URL assinada de anexo** | Download é pela Storage API sob RLS. Não há emissor de link. |

### As tabelas que estão **vazias** — e o que cada vazio significa

Estas existem, são legíveis e **não têm nenhuma linha**. Uma tabela vazia devolve `[]` igual a
uma consulta negada por RLS, então vale saber quais são antes de investigar lista vazia como bug.
Medido em homologação em **11/09/2026**:

| Tabela | Linhas | O que o vazio significa | Quem preenche |
|---|:--:|---|---|
| `legal_document_versions` | **0** | **Não há termo de uso nem política de privacidade para exibir antes do aceite.** É lacuna de conformidade, não de tela | Pendente — ver aviso abaixo |
| `alert_rules` | **0** | **Deliberado e fail-closed.** Sem regra, nenhum alerta dispara. O limiar clínico é decisão da clínica, não de engenharia | Administrador, pela tela de configurações |
| `appointment_status_reasons` | **0** | O relatório de faltas conta quantas houve e **não diz por quê**. `p_reason_id` fica `NULL` | Clínica — falta definir a lista |
| `patient_invitations` | **0** | Nenhum paciente foi convidado ainda. Nasceu em 11/09/2026 | Administrador, por `invite_patient` |
| `external_refs` | **0** | Nada propõe vínculo porque a sincronização não existe. A fila de conferência já está pronta para quando ela ligar | A integração, quando entrar |
| `clinic_business_hours` | **0** | Horário não configurado: a clínica **nunca** está "fora do horário", e a mensagem automática não dispara. Nasceu em 25/09/2026 | Administrador, aba Atendimento |
| `operational_parameters` | **0** | Os gráficos não têm linha de referência | Administrador |
| `report_schedules`, `report_runs` | **0** | Nenhum relatório agendado. Nasceram em 25/09/2026 | Administrador, por `create_report_schedule`; os períodos, a rotina |

Povoados e confiáveis: `specialties` (7) · `symptoms` (12) · `appointment_types` (7) ·
`notification_types` (10) · `conversation_subjects` (4) · `permissions` (2) ·
`content_categories` (7, uma por especialidade) · `appointment_statuses` (5) · `treatment_phases` (2 ativas de 4).

> [!IMPORTANT]
> **`permissions` NÃO está mais vazia** — desde 11/09/2026 tem `alerts.triage` e
> `schedule.manage`. E o catálogo tem **semântica invertida**: código **ausente** dele **concede a
> todos**; código **presente** concede só a quem tem linha vigente em `professional_permissions`.
> Ou seja, **inserir um código é ato restritivo**, e remover a linha reabre para todos, em
> silêncio. `alerts.triage` nasceu **sem nenhuma concessão** (fila fechada até o admin conceder);
> `schedule.manage` foi concedida aos profissionais que existiam naquele instante — **quem for
> cadastrado depois não marca compromisso até alguém conceder**.

> [!WARNING]
> **Nenhum paciente real deve entrar antes de `legal_document_versions` ter uma versão vigente.**
> A seção 5.3 diz que a versão com `is_current = true` é o texto a exibir antes do aceite — e hoje
> não existe versão nenhuma. O caminho de escrita já existe (`publish_legal_document`, 5.17); o
> que falta é o texto da clínica e a definição de quem publica a primeira versão.

> [!NOTE]
> **Vocabulário se aposenta, nunca se apaga** (`is_active = false`), e desde 25/09/2026 o banco recusa o `delete` para todo papel (5.21). Apagar um sintoma ou uma
> categoria quebraria o histórico de quem já tinha usado aquele termo e falsificaria relatório
> antigo. Filtre por `is_active` nos seletores; **não** filtre em histórico.

---

## 12. Mapa das migrations

| Arquivo | O que estabelece |
|---|---|
| `add_extensions` | `citext`, `pgcrypto` |
| `add_shared_functions` | UUIDv7, `set_updated_at`, `get_my_uid` |
| `create_identity_core` | Contas, perfis, especialidades, permissões e **toda a base de RLS** |
| `fix_has_permission_account_level` | Correção: revogação vale nos dois níveis de `is_active` |
| `create_caregiver_links` | Convite, vínculo e revogação do cuidador (o convite saiu em `create_caregiver_accounts`) |
| `create_patient_clinical` | Ficha, CID-10, alergias, consentimento e direitos LGPD |
| `create_treatment_plans` + `validate_…` | Protocolo, ciclo e fase do tratamento |
| `create_diary_entries` | Diário de sintomas e os 12 sintomas |
| `create_clinical_read_audit` | **`audit_log` e as funções `read_*`** — origem da regra da seção 3 |
| `create_specialty_notes` | Anotação da equipe e sinalização sem conteúdo |
| `create_content_library` | Orientações, versionamento e workflow de publicação |
| `create_content_storage` + `validate_…` | Bucket `content-attachments` |
| `create_conversations` | Chat, atribuições e Realtime |
| `create_chat_attachments` | Bucket `chat-attachments` |
| `create_appointments` | Agenda, tipos, estados e bloqueio pessoal |
| `create_notifications` | Caixa de entrada, preferências, aparelhos e fila de envio |
| `revoke_anon_access` | Tira `anon` da superfície da API: privilégio, não só RLS |
| `bootstrap_first_admin` + `protect_last_admin` | Primeiro administrador, e a trava do último |
| `create_permission_grants` | **As RPCs de concessão**, e a vigência que a revogação usa |
| `seed_navigator_permissions` | `alerts.triage` e `schedule.manage`; agenda estreita, chat alarga |
| `create_alerts` | **Alerta, regra de criticidade e fila do Gemed** |
| `require_council_registration` | Registro de conselho passa a ser obrigatório |
| `align_content_categories` | As categorias de conteúdo viram as sete especialidades |
| `shrink_content_status` | Workflow de conteúdo encolhe para quatro estados |
| `create_nps` | Pesquisa de satisfação por marco do tratamento |
| `validate_deferred_constraints` | `VALIDATE` das constraints que nasceram `NOT VALID` |
| `deactivate_unused_treatment_phases` | A lista clínica de fases encolhe para duas |
| `create_patient_registry` | **Cadastro do paciente e ativação do app** — o vínculo `patients.account_id` |
| `create_professional_registry` | **Cadastro do profissional** e as especialidades vigentes |
| `audit_access_grants` | Conceder e revogar acesso passam a deixar linha na trilha |
| `create_external_refs_policies` | A fila de conferência do vínculo com o Gemed ganha leitura |
| `fix_reader_catalog_policies` | Correção: o `GRANT` de 28/08 nos catálogos estava **inerte** — RLS ligada sem política que nomeasse `clinical_reader` |
| `create_clinical_summaries` | **As três funções `summarize_*`** — a origem que Relatórios e Estatísticas nunca tiveram |
| `create_clinic_agenda_read` | `read_clinic_agenda` — a agenda da clínica inteira, paginada e auditada |
| `create_patient_list_search` | `read_patient_list` — busca sem acento, filtros, ordenação e **total**; `pg_trgm` + `unaccent` |
| `create_legal_document_publishing` | `publish_legal_document` — publicar **cria versão**, nunca edita a vigente |
| `create_status_reason_admin` | As três RPCs do motivo de falta. A lista continua sendo da clínica |
| `enrich_audit_trail` | A trilha ganha **origem**, **qualidade do ator** e a marca **anônima** de material restrito |
| `audit_message_events` | A mensagem de chat passa a deixar rastro. O corpo continua fora |
| `require_admin_mfa` | `security_settings` e a exigência de `aal2` para o administrador, **desligada** de fábrica |
| `validate_audit_restricted_constraint` | `VALIDATE` da constraint que nasceu `NOT VALID` |
| `fix_patient_invitation_birth_date` | O aceite do convite recusa data de nascimento **nula** (antes passava) |
| `restrict_caregiver_confidential` | O cuidador deixa de ver e escrever em conversa e compromisso **restritos** |
| `mask_patient_identifiers` | Ficha com CPF, telefone e e-mail **mascarados**; `reveal_patient_identifiers` com rastro próprio |
| `freeze_chat_attachments` | Anexo do chat **imutável**: bucket só aceita envio, linha sem `delete` |
| `revoke_unused_write_privileges` | Menor privilégio: escrita sem política, `TRUNCATE` em todas as tabelas, e a trilha protegida contra `TRUNCATE` |
| `grant_delivery_helper_to_service_role` | Correção: a fila de envio **nunca rodou como `service_role`** — faltava `EXECUTE` no helper de elegibilidade |
| `enable_scheduled_jobs` | `pg_cron` e `pg_net`, e a limpeza diária do histórico do cron |
| `create_patient_notification_producers` | **As notificações do paciente ganham produtor**: agenda, lembretes 24 h/2 h, chat e orientação. O envio reavalia o alvo, e a fila se recupera sozinha |
| `create_push_dispatch` | A rotina de cada minuto que chama a Edge Function `send-push` — inerte até haver segredos no Vault |
| `open_first_access_nps` | A pesquisa do primeiro acesso abre quando o paciente ativa o app |
| `add_audit_export_action` | A trilha ganha o verbo `export` |
| `record_data_exports` + `validate_…` | `log_data_export` — o painel declara o que exportou |
| `close_data_subject_request_cycle` | **O pedido do titular fecha o ciclo**: máquina de estados, rotina de exclusão, `export_my_data` |
| `allow_consent_reacceptance` | Reaceite dos termos depois de revogar; o titular lê a versão que aceitou |
| `audit_caregiver_links` | Conceder e revogar acompanhante passam a deixar linha na trilha |
| `add_phone_normalization` | `normalize_br_phone`: celular em E.164, ou nada |
| `add_caregiver_link_pending_status` | O vínculo de acompanhante ganha o estado `pending` |
| `create_caregiver_accounts` + `validate_…` | **O paciente cria o acompanhante**: o convite sai, o vínculo nasce `pending`, senha provisória com validade e cota |
| `create_patient_sms_invite` | `issue_patient_sms_invite` — o convite do paciente que a Edge Function `send-patient-invite` envia por SMS |
| `create_clinic_settings` | **Configuração da clínica**: linha única, horário da equipe, parâmetros dos gráficos, e `get_clinic_presentation`, a única leitura sem login |
| `create_chat_off_hours_reply` | A mensagem automática fora do horário: uma por conversa e por período fechado |
| `create_branding_and_avatar_storage` + `validate_…` | Buckets `avatars` (só o dono) e `clinic-branding` (público); `accounts.avatar_path` |
| `create_vocabulary_admin` | **Vocabulários editáveis**: criar, corrigir, aposentar; nunca apagar nem renomear código |
| `rework_patient_list` | A lista ganha `created_at` e três ordenações; **`read_patients` sai** |
| `create_panel_summaries` | `summarize_treatment_protocols`, `summarize_content_reads` e o resumo de sintomas com denominador, CID e ficha ativa |
| `guard_clinical_writes` | Ficha inexistente vira `patient_not_found` nas escritas da ficha; `unconfirm_appointment` confere o que fez |
| `refine_notification_types` + `validate_…` | Rótulos acentuados, **público-alvo** (`patient`/`team`), categoria `report`, e o rótulo do tipo aposentado legível para quem o recebeu |
| `create_report_schedules` | **Relatório agendado**: o banco fecha o período e avisa; e-mail ainda sem provedor |
| `index_foreign_keys` | Toda chave estrangeira com índice que a cubra |
| `restrict_caregiver_patient_read` | O acompanhante deixa de ler a linha inteira de `patients`; o tutelado vem de `get_my_ward`, sem CPF nem contato |

Cada arquivo abre com o racional da decisão em comentário. **Quando algo parecer estranho, o
motivo está escrito lá em cima** — e quase sempre é uma regra de sigilo ou de auditoria que o
front-end não deve contornar.

---

> **Mudança de esquema é sempre pelo responsável pelo banco.** Coluna nova, tabela nova, RPC
> nova, política nova, índice novo, ou "só um `select` direto para destravar" — abra o pedido.
> Toda regra deste guia existe para proteger isolamento do paciente, sigilo entre especialidades
> e trilha de auditoria, que são obrigação contratual e legal. Contornar no cliente não resolve:
> transfere o risco para onde ele não pode ser verificado.
