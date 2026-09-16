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

## 1. O essencial em um minuto

1. **RLS está ligada em tudo.** Você nunca filtra por usuário na query — o banco já filtra.
2. **Consulta negada devolve `[]`, não erro.** Lista vazia inesperada quase sempre é RLS, não bug de dados.
3. **Painel lê dado clínico por `.rpc('read_…')` ou `.rpc('summarize_…')`, nunca por `.from()`.** Com `.from()` o painel recebe zero linhas, silenciosamente — as políticas da equipe pertencem ao role `clinical_reader`, não a `authenticated` (seção 3). O app do paciente/cuidador continua usando `.from()` normalmente.
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
| `caregivers` | Cuidador acompanhante. O perfil **nasce no aceite do convite**, não no cadastro. |

**Regra dos dois `is_active`:** a conta precisa estar ativa **e** o perfil precisa estar ativo.
Desligar `accounts.is_active` revoga tudo na hora, em todos os perfis.

### Como nasce cada perfil

**Signup cria conta, nunca perfil.** O trigger `trg_handle_new_auth_user` insere **só** a linha
em `accounts` (id, nome, e-mail, telefone) quando o usuário aparece em `auth.users`. Perfil é
concessão separada, e cada um tem seu caminho:

| Perfil | Como nasce | Existe hoje? |
|---|---|---|
| `caregivers` | `accept_caregiver_invitation(p_token)` — o aceite do convite é o que torna a pessoa cuidadora | ✅ |
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
| `read_patient_list` | `p_search, p_protocol, p_cid10_code, p_treatment_phase_id, p_is_active=true, p_order_by='full_name', p_order_desc=false, p_limit=50, p_offset=0` | **A lista de pacientes** — busca, filtros, ordenação e **total**. Retorno estreito, CPF mascarado (5.14) |
| `read_patients` | `p_limit=50, p_offset=0` | A lista **antiga**. Continua no ar; migre para `read_patient_list` (5.14) |
| `read_patient` | `p_patient_id` | Ficha do paciente |
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
| `summarize_symptoms_by_protocol` | `p_from date, p_to date, p_protocol, p_symptom_id` | **Cruzamento protocolo × sintoma × grau × quantidade**. Estatísticas Clínicas e "efeitos por protocolo" |
| `summarize_appointments` | `p_from, p_to, p_granularity='month', p_specialty_id, p_appointment_type_id` | Sessões realizadas, faltas, cancelamentos, adesão e **volume por especialidade** |
| `summarize_chat_response_times` | `p_from, p_to, p_granularity='month', p_specialty_id` | **Tempo até a primeira resposta da equipe**, por período e especialidade |

`p_granularity` aceita `day`, `week` ou `month` — qualquer outro valor é recusado. **A janela é
obrigatória nas três**: varredura sem período não é relatório, é dump.

**Colunas de retorno**, para dimensionar a tela antes de chamar:

- `summarize_symptoms_by_protocol` → `protocol_name, symptom_id, symptom_label, grade, report_count, patient_count`
- `summarize_appointments` → `bucket_start, appointment_type_id, appointment_type_label, specialty_id, specialty_label, status_code, status_label, status_reason_id, status_reason_label, appointment_count, patient_count, confirmed_count`
- `summarize_chat_response_times` → `bucket_start, specialty_id, specialty_label, conversation_count, answered_count, unanswered_count, first_response_avg_seconds, first_response_median_seconds, first_response_p90_seconds`

#### Cinco coisas que mudam o que a tela deve mostrar

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

> [!NOTE]
> **"Engajamento no app" NÃO tem função**, e não é esquecimento: a definição não existe em fonte
> nenhuma (sessões? dias com diário? orientações lidas? mensagens?). É a questão **#44**, aberta
> em 11/09/2026 para decidir com a clínica. Número calculado sobre definição inventada é pior que
> indicador ausente.

### O que as `read_*` e as `summarize_*` **não** fazem

- **Resumo por profissional individual não existe.** "Comparativos entre profissionais
  respeitando privacidade" é requisito, e o N mínimo é a mesma decisão pendente do comparativo de
  NPS. O recorte disponível é **por especialidade**.
- **`read_patients`, a antiga, não busca nem conta.** Ela continua no ar só para não quebrar a
  tela que já existe. Use `read_patient_list`.
- **Exportação (PDF/Excel), agendamento de envio e mapa de calor** são do front-end. O banco
  entrega o número.

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
alterada ou removida nestas **23 tabelas** gera registro em `audit_log` sozinha, venha de RPC, de
`.insert()` direto ou de `service_role`:

`patients` · `patient_diagnoses` · `patient_clinical_history` · `patient_invitations` ·
`treatment_plans` · `diary_entries` · `specialty_notes` · `private.specialty_flags` ·
`conversations` · `messages` · `appointments` · `alerts` · `alert_rules` · `content_items` ·
`content_versions` · `content_version_reviews` · `professionals` · `professional_specialties` ·
`professional_permissions` · `admins` · `caregivers` · `legal_document_versions` ·
`security_settings`

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
| Ficha, diário, plano, agenda, chat de qualquer paciente | — | — | ✅ via `read_*` | ✅ via `read_*` |
| Anotação de especialidade (`specialty_notes`) | ❌ | ❌ | `team` + a própria especialidade | só `team` |
| Conteúdo de **Psicologia** (nota, conversa, compromisso) | — | — | só a Psicologia | ❌ nunca |
| Sinalização de sofrimento (`specialty_flags`) | ❌ | ❌ | ✅ todos | ❌ |
| Bloqueio pessoal de agenda (`professional_blocks`) | ❌ | ❌ | só o dono | ❌ |
| Favoritos/lidos de orientação | só o titular | ❌ | ❌ | ❌ |
| Notificações | só o destinatário | só o destinatário | só o destinatário | só o destinatário |
| `audit_log` | ❌ | ❌ | ❌ | ✅ |

**Sigilo da Psicologia é automático.** Nota, conversa ou compromisso roteado para uma
especialidade marcada como confidencial vira `visibility = 'specialty_restricted'` por trigger —
e some da lista das outras áreas e da administração. Não é o conteúdo que se esconde: é a linha.
O front-end não precisa (e não deve) implementar nada disso.

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

Ciclo inteiro por RPC. **Um cuidador ativo por paciente.**

| RPC | Quem chama | Retorno |
|---|---|---|
| `invite_caregiver(p_channel, p_destination)` | titular | `{ invitation_id, token }` |
| `cancel_caregiver_invitation(p_invitation_id)` | titular | — |
| `accept_caregiver_invitation(p_token)` | a conta convidada | `link_id` |
| `revoke_caregiver_link(p_link_id)` | titular | — |

`p_channel` é `'sms'` ou `'email'`.

> **O `token` volta em texto puro uma única vez e nunca mais.** O banco guarda só o hash.
> Entregue-o na hora (deep link / SMS / e-mail) — não há como reemitir. Nunca persista o token
> em log, storage local ou estado que sobreviva à sessão.

O convite **não expira**. A revogação pelo titular é o único freio, e é instantânea: a próxima
consulta do cuidador já volta vazia.

Leitura: o titular vê seus convites e vínculos; o cuidador vê só os vínculos dele
(`.from('patient_caregivers')`); a equipe vê o vínculo para exibir o contato na ficha.

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
| `decide_data_subject_request(p_request_id, p_status, p_note?)` | admin — só `'granted'` ou `'refused'` |

`legal_document_versions` com `is_current = true` é o texto a exibir antes do aceite — e a
tabela está **vazia hoje**: a RPC de publicação existe (5.17), mas ninguém a usou ainda.

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
| `confirm_appointment(p_appointment_id)` | **titular ou cuidador**, só antes do início |
| `unconfirm_appointment(p_appointment_id)` | titular ou cuidador |

> ⚠️ **MUDOU EM 11/09/2026: marcar exige a permissão `schedule.manage`.**
> Não basta ser profissional ativo. A clínica definiu que quem opera a agenda é a **enfermagem
> navegadora**, e isso virou uma permissão concedida pelo painel administrativo.
> **Profissional cadastrado a partir de 11/09/2026 nasce SEM ela** e recebe
> `apenas profissional ativo marca compromisso` em todas as cinco RPCs acima até alguém conceder.
> Não é bug: é a tela de cadastro que precisa oferecer a concessão. Ver seção 5.10.

- **Não existe UPDATE de horário.** Remarcar é `reschedule_appointment` — o relatório de adesão conta remarcações.
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
  .select('*, notification_types(label, category, icon_name)')
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

> `critical_alert` é insilenciável **por chave estrangeira**. Tentar criar preferência para ele
> falha com violação de FK (`23503`) — não é bug, é o desenho. Esconda o toggle na UI.

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

- A pesquisa é **aberta pela rotina agendada** (`open_nps_survey`, só `service_role`). O app
  **não** a abre: `.rpc('open_nps_survey')` devolve `permission denied` para qualquer usuário.
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
| `unlink_patient_account(id)` | administrador | desfaz o vínculo |

**O CPF pode ir mascarado.** `529.982.247-25` e `52998224725` são a mesma coisa: a RPC normaliza.

**O aceite tem dois fatores, e isso é da tela:** além do token que chegou por SMS, o app precisa
mandar **CPF e data de nascimento** — que o onboarding já coleta. Sem os dois, recusa.

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

Substitui `read_patients` na tela de pacientes. **A antiga continua no ar** até você migrar; ela
sai por migration nova, com aviso.

```ts
const { data, error } = await supabase.rpc('read_patient_list', {
  p_search: termo || null,          // nome (sem acento/caixa), CPF por prefixo, chave do Gemed
  p_protocol: protocolo || null,    // protocolo VIGENTE do paciente
  p_cid10_code: cid || null,
  p_treatment_phase_id: faseId || null,
  p_is_active: true,                // null traz ativos e arquivados
  p_order_by: 'full_name',          // full_name | birth_date | created_at
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
  número que o operador já tem em mãos, e não serve para coletar. O CPF completo continua em
  `read_patient`, um paciente por vez, com o acesso registrado naquele titular.
- **Não sai `account_id`** — sai `has_account` (booleano), que é o que a lista precisa saber.
- **Vem junto o que a lista mostra**, sem uma segunda chamada por paciente: `treatment_phase_label`,
  `protocol_name`, `current_cycle_number`, `primary_cid10_code`, `primary_cid10_label`.
- **Filtro de risco não existe e não vai existir nesta fase.** "Risco" são as etiquetas da
  sistematização de enfermagem do Gemed, e elas **não estão no escopo de leitura contratado**.
- `p_order_by` fora de `full_name` / `birth_date` / `created_at` é **recusado** — não há SQL
  dinâmico aqui.

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

---

## 6. Escrita direta vs. RPC — a lista fechada

**Só isto aceita `.insert()` / `.update()` / `.upsert()` direto:**

| Tabela | Verbos | Por quem |
|---|---|---|
| `accounts` | UPDATE (`full_name`, `phone`) | o dono |
| `diary_entries` | INSERT, UPDATE (rascunho) | titular e cuidador |
| `diary_symptom_reports` | INSERT, UPDATE, DELETE (rascunho) | titular e cuidador |
| `messages` | INSERT | paciente, cuidador, profissional da área |
| `message_attachments` | INSERT | autor da mensagem |
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

## 7. Storage — anexos

Dois buckets **privados**, ambos 20 MiB por arquivo:

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
await supabase.storage.from('chat-attachments').upload(path, file)

// REMOVER: apaga o arquivo PRIMEIRO, depois a linha
await supabase.storage.from('chat-attachments').remove([path])
await supabase.from('message_attachments').delete().eq('storage_path', path)
```

Sem a linha registrada, o upload é **negado**. Sem remover o arquivo antes, o `delete` da linha
falha com `foreign_key_violation` — para nunca existir arquivo órfão no bucket.

Quem lê o arquivo é exatamente quem lê a linha correspondente. O painel obtém o `storage_path`
do chat **só** por `read_message_attachments` — e é essa chamada que deixa o acesso na trilha.

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
| `23505` (unique) | Já existe: cuidador ativo, plano vigente, versão publicada, sintoma já marcado | Ler o estado antes |
| `23503` (FK) | Ex.: preferência para `critical_alert` | Insilenciável por desenho |
| `forbidden` (42501) | RPC chamada por perfil errado | Verificar perfil/especialidade |
| `PGRST202` (função não encontrada) | Nome do parâmetro errado | Os nomes têm prefixo `p_` e batem exatamente |

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
| **Notificação automática de agenda e conteúdo** | A caixa, as preferências, o registro de aparelho e a fila de envio existem, e o **alerta** já produz notificação. Lembrete de compromisso e aviso de orientação publicada ainda **não têm produtor**. |
| **Envio efetivo de push** | `notification_deliveries` enfileira; **nenhuma Edge Function consome a fila**. A notificação aparece na caixa e não sai no aparelho. O provedor é o **OneSignal**, e falta a credencial. |
| **Envio do SMS de convite** | `invite_patient` devolve o token; **ninguém o entrega**. Em homologação, exiba o token no painel para alguém digitar no app — é o que torna a ativação testável sem provedor de SMS. |
| **Sincronização com o Gemed** | `gemed_outbox` enfileira o alerta crítico, e **ninguém consome a fila**. As linhas ficam `pending`. |
| **Integração Gemed** | Nada sincroniza. Diagnóstico e plano entram por RPC manual; as colunas de origem/sync existem e ficam em `local`. A **fila de conferência** do vínculo já existe (`read_external_refs`), e está vazia porque nada propõe vínculo ainda. |
| **Disparo automático do NPS** | As tabelas e a RPC existem; a **rotina agendada que chama `open_nps_survey` não existe**. Nenhuma pesquisa é aberta sozinha. Dois dos três marcos dependem do plano terapêutico, que só o Gemed preenche. |
| **Definição de "engajamento no app"** | As outras duas frentes de relatório existem desde 11/09/2026 (seção 3). Esta **não**, e não é esquecimento: nenhuma fonte diz o que conta como engajamento. Questão **#44**, a decidir com a clínica. |
| **Comparativo entre profissionais individuais** | O recorte das `summarize_*` é **por especialidade**. Por profissional esbarra no mesmo N mínimo do comparativo de NPS: com poucos casos, a média re-identifica. |
| **Exportação, agendamento de envio e mapa de calor** | O banco entrega o número; PDF, Excel, envio por e-mail e visualização são do front-end. |
| **Roteamento automático de conversa** | O mapa assunto → especialidade está vazio; tudo cai na fila geral. |
| **A lista de motivos de falta** | As RPCs existem (5.16); a **lista** é da clínica. Enquanto a tabela estiver vazia, `p_reason_id` fica `NULL`. |
| **Cor e ícone de tipo de compromisso** | Nascem `NULL`; a clínica ainda não definiu. |
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
Povoados e confiáveis: `specialties` (7) · `symptoms` (12) · `appointment_types` (7) ·
`notification_types` (9) · `conversation_subjects` (4) · `permissions` (2) ·
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
> **Vocabulário se aposenta, nunca se apaga** (`is_active = false`). Apagar um sintoma ou uma
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
| `create_caregiver_links` | Convite, vínculo e revogação do cuidador |
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

Cada arquivo abre com o racional da decisão em comentário. **Quando algo parecer estranho, o
motivo está escrito lá em cima** — e quase sempre é uma regra de sigilo ou de auditoria que o
front-end não deve contornar.

---

> **Mudança de esquema é sempre pelo responsável pelo banco.** Coluna nova, tabela nova, RPC
> nova, política nova, índice novo, ou "só um `select` direto para destravar" — abra o pedido.
> Toda regra deste guia existe para proteger isolamento do paciente, sigilo entre especialidades
> e trilha de auditoria, que são obrigação contratual e legal. Contornar no cliente não resolve:
> transfere o risco para onde ele não pode ser verificado.
