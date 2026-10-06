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

## O que mudou em 06/10/2026 (Fase L): idade mínima e encerramento de tratamento

> [!NOTE]
> **Aplicado em homologação em 06/10/2026.** Três migrations e uma Edge Function
> (`send-patient-invite`, pelo mapa de erros em `_shared/common.ts`), publicada como **v4** no mesmo dia.
> A regra dos 18 anos é **provisória** até a CEON confirmar (ADR-020 §9).

| Quem | O que muda | Seção |
|---|---|---|
| **App do paciente** | **`underage`** em `link_patient_by_verified_phone` (no `data`: `{ "linked": false, "error": "underage" }`) e em `accept_patient_invitation` (**exceção** `42501`, mensagem `underage`). Só aparece quando CPF, nascimento e celular (ou o token) **conferem** | 5.12 |
| **App do paciente** | O tipo de compromisso **`treatment_closure`** (Encerramento de tratamento). Reconheça-o **só pelo código**, nunca pelo rótulo | 5.7 |
| **Painel administrativo** | **`birth_date_in_future`** (`23514`) em `create_patient` e `update_patient`. **`underage`** (`23514`) em `invite_patient` e no envio por SMS (`send-patient-invite` responde `422 { error: 'underage' }`) | 5.12 |
| **Painel clínico** | O tipo novo aparece na lista ao marcar compromisso, como os outros sete | 5.7 |

**O que fazer já:**

- **[36]** Trate `underage` nas duas telas de ativação. Sugestão do time: *"Para usar o app é preciso
  ter 18 anos ou mais. Fale com a clínica."* Com qualquer dado errado, a resposta continua
  `invalid_invitation`: o `underage` não diz a ninguém que um CPF é de paciente menor de idade.
- **[36]** `underage` **não conta tentativa** no limite de 5 por hora, e o convite recusado por
  idade **continua pendente**: se a data da ficha estava errada e for corrigida, o mesmo convite
  volta a valer.
- **[36]** A ficha de menor de idade **continua existindo** e se cadastra normalmente. O que ela não
  faz é se ligar ao app. Só a data **depois de hoje** é recusada no cadastro.
- **[37]** Tire do app o reconhecimento pelo nome ("Encerramento…"). O administrador pode renomear
  o rótulo, e só o código não muda. **Não aposente o tipo:** o paciente só lê tipos ativos, e o
  compromisso já marcado passaria a chegar com `appointment_types` nulo, sem a tela do sino.

---

## O que mudou em 02/10/2026 (Fase K): o texto do pedido de correção e o nome do profissional

> [!NOTE]
> **Aplicado em homologação em 02/10/2026.** Só banco, nenhuma Edge Function mudou.

| Quem | O que muda | Seção |
|---|---|---|
| **App do paciente** | **`request_data_subject_action(p_request_type, p_requester_note?)`**: o pedido carrega o texto do titular (o formulário de correção). Opcional, até **1000** caracteres, brancos das pontas removidos; texto só de brancos vira `null`. Fica em `data_subject_requests.requester_note` | 5.3, 5.19 |
| **Painel administrativo** | Lê `requester_note` no pedido: é o que o titular pediu para corrigir | 5.19 |
| **App do paciente** | **`professionals.display_name`**: o nome do profissional junto do compromisso, `appointments.select('…, professionals(display_name)')`. Pode vir `null` (compromisso sem profissional, ou conta sem nome) | 5.7, 5.13 |

**O que fazer já:**

- **[34]** A chamada de hoje, só com `p_request_type`, continua valendo. Para mandar o texto:
  `supabase.rpc('request_data_subject_action', { p_request_type: 'rectification', p_requester_note: texto })`.
  Texto acima de 1000 caracteres responde **`requester_note_too_long`** (`22023`); limite também no campo.
- **[34]** O texto **não se edita** depois de enviado. Correção do texto é **outro pedido**.
- **[35]** Não leia `accounts` para mostrar o nome do profissional ao paciente: a RLS devolve `[]`.
  Leia `professionals(display_name)` embutido no compromisso. Ninguém escreve `display_name`: ele
  acompanha `accounts.full_name` sozinho, inclusive quando o profissional troca o próprio nome.

---

## O que mudou em 02/10/2026: o administrador vai da conta à ficha

> [!NOTE]
> **Aplicado em homologação em 02/10/2026.** Só banco, nenhuma Edge Function mudou.

| Quem | O que muda | Seção |
|---|---|---|
| **Painel administrativo** | **`read_patient_id_by_account(p_account_id)`** devolve o `patients.id` ligado à conta, ou `null`. Só administrador ativo em sessão **`aal2`**, mesmo com `require_admin_mfa` desligado. Toda chamada fica na trilha, **inclusive a que não acha nada** | 3, 5.13 |

**O que fazer já:**

- **Não use `.from('patients').eq('account_id', …)` no painel.** Devolve `[]` para o administrador, como
  toda leitura clínica fora das `read_*` (seção 3). Chame a função e, com o id, `read_patient`.
- **Mapeie os erros:** `forbidden` (não é administrador ativo), `mfa_required` (sessão `aal1`),
  `account_required` (`p_account_id` nulo, `22004`).
- **Não use a função para varrer contas.** Cada chamada grava uma linha com a conta consultada, e
  dezenas de linhas sem resultado aparecem como varredura para quem lê a trilha.
- Para só **avisar** se a conta é de paciente (antes de promover alguém a profissional), continue
  com `is_patient_account`: ela devolve só o booleano.

---

## O que mudou em 01/10/2026 (Fase G.2): envio dirigido de orientação — duas regras provisórias

> [!WARNING]
> **Aplicado em homologação em 01/10/2026.** Duas migrations
> (`create_content_directed_sends`, `apply_directed_sends_to_visibility`), só banco. Resposta ao
> item 12 da lista do painel de 30/09/2026. **Duas regras são provisórias** até a CEON responder:
> **quem envia** (hoje todas as especialidades, inclusive Psicologia) e **quem vê se o paciente
> abriu** (hoje a equipe toda no envio `team`; o de Psicologia, só a Psicologia). Se a resposta
> mudar, muda o banco; as chamadas abaixo não mudam.

| Quem | O que muda | Seção |
|---|---|---|
| **Painel clínico (ficha)** | **`send_directed_content(p_patient_id, p_content_item_id, p_origin_specialty_id?)`** envia uma orientação **publicada** ao paciente e devolve o id do envio. A especialidade padrão é a primária vigente de quem envia | 5.5 |
| **Painel clínico (ficha)** | **`read_content_directed_sends(p_patient_id, p_limit?, p_before?)`**: os envios do paciente, com **`opened_at`** ("abriu" quando não nulo). Leitura auditada, como as outras `read_*` | 5.5 |
| **App do paciente** | `from('content_directed_sends')` lista as orientações **enviadas para você**. A orientação enviada **abre** mesmo sem CID compatível. Ao abrir, chame **`mark_directed_content_opened(p_send_id)`**, que é idempotente | 5.5 |
| **App (acompanhante)** | Vê o envio com a área `resources` (e `clinical_record`, se a orientação tem CID). O de Psicologia, nunca. Ele **não marca** abertura | 5.5 |
| **Notificações** | Tipo novo **`content_directed`** (*"Sua equipe enviou uma orientação"*), `target_table = 'content_directed_sends'`, `target_id` = o envio | 5.8 |

## O que mudou em 01/10/2026 (Fase E.3b): só quem vê o compromisso o altera — provisório

> [!WARNING]
> **Aplicado em homologação em 01/10/2026. PROVISÓRIO** até a CEON responder à pergunta 1
> (D6), enviada em 30/09/2026. Uma migration (`restrict_confidential_appointment_writes`), só banco.
> Fecha o furo de sigilo do item 13: a navegadora com `schedule.manage` remarcava e cancelava a
> sessão de Psicologia que ela não enxerga, bastando ter o id.

| Quem | O que muda | Seção |
|---|---|---|
| **Painel clínico (quem opera a agenda)** | `reschedule_appointment` e `set_appointment_status` sobre compromisso que quem chama **não vê** (sessão de Psicologia, para quem não é da Psicologia) respondem **`appointment_not_found`** (`P0002`), o mesmo erro do id inexistente. Sobre horário bloqueado, também: o invisível nunca responde `slot_blocked` | 5.7 |
| **Psicóloga** | Remarca e cancela a própria sessão, desde que tenha `schedule.manage`, a mesma condição para marcá-la | 5.7 |

**O que fazer já:** nada novo na tela. A agenda da equipe já não mostra a sessão restrita, então o
botão não aparece. O `appointment_not_found` já está mapeado (seção 9).

**Se a CEON responder (b)**, que a navegadora também remarca e cancela, uma migration nova
acrescenta a permissão ao predicado `private.can_write_appointment`. Ela passa a agir **sem ver** o
compromisso: as RPCs devolvem só o id (remarcar) ou nada (mudar estado). A tela teria de receber o id
por outro caminho, que não existe hoje.

## O que mudou em 30/09/2026 (Fase J): o bloqueio de agenda protege o horário

> [!NOTE]
> **Aplicado em homologação em 01/10/2026.** Uma migration (`enforce_professional_blocks`),
> só banco, nenhuma Edge Function mudou. Resposta ao item 17 da lista do painel de 30/09/2026
> (decisão D7). Até aqui, o bloqueio pessoal aparecia só na agenda de quem bloqueou, e nada
> impedia marcar compromisso em cima dele.

| Quem | O que muda | Seção |
|---|---|---|
| **Painel clínico (quem agenda)** | `schedule_appointment` e `reschedule_appointment` **recusam** o horário que colide com bloqueio do profissional do compromisso: **`slot_blocked`** (`23P01`, HTTP **409**). Compromisso **sem** profissional não colide | 5.7 |
| **Painel administrativo e navegadora** | **`read_professional_busy_intervals(p_from, p_to)`**: quando cada profissional está indisponível — só `professional_id`, `starts_at`, `ends_at`. **Sem o rótulo**, que continua só do dono. Janela obrigatória, até 62 dias | 5.7 |
| **Painel clínico (quem bloqueia)** | **`save_professional_block(p_starts_at, p_ends_at, p_label?, p_block_id?)`**: cria ou move o próprio bloqueio e devolve `{ block_id, conflicts }` — os compromissos que **já estavam** no intervalo, para a tela avisar | 5.7 |

**O que fazer já:**

- **Formulário de agendamento e de remarcação:** trate `slot_blocked` com *"o profissional não
  está disponível neste horário"*. **Não** tente dizer por quê: o banco não devolve o motivo, de
  propósito. Para evitar o erro, pinte os intervalos de `read_professional_busy_intervals` como
  indisponíveis no seletor de horário.
- **Agenda da clínica (administrador) e da navegadora:** mostre os intervalos como **"Indisponível"**,
  sem texto. O administrador **continua sem ler** `professional_blocks` por `.from()` — recebe `[]`.
- **Tela de bloqueio do profissional:** troque o `.insert()`/`.update()` direto por
  `save_professional_block`. Se `conflicts` vier com itens, avise: *"você tem N compromissos neste
  intervalo; eles continuam marcados"*. **Nada é cancelado sozinho** — remarcar ou cancelar é decisão
  de quem opera a agenda. A escrita direta continua funcionando, mas não avisa.
- **A borda passa:** o bloqueio até 12h e o compromisso a partir de 12h **não** colidem.
- **Mapeie os erros novos** na seção 9: `slot_blocked`, `window_too_large`, `block_not_found`,
  `invalid_period`.

---

## O que mudou em 30/09/2026 (Fase I): relatórios, carteira e lista de pacientes

> [!NOTE]
> **Aplicado em homologação em 01/10/2026.** Quatro migrations, só banco, nenhuma Edge
> Function mudou. Resposta aos itens 5, 10, 11 e 18 da lista do painel de 30/09/2026. **A metade
> "pacientes da carteira" do item 5 NÃO entra**: ela depende de a CEON dizer quem é "paciente da
> minha carteira" (pergunta 3, enviada em 30/09/2026). Até a resposta, a carteira mostra só os
> indicadores de ação da própria pessoa.

| Quem | O que muda | Seção |
|---|---|---|
| **Painel administrativo** | **`summarize_alerts(p_from, p_to, p_granularity)`**: a fila de alertas em números — nascidos, assumidos, resolvidos, abertos, tempo até assumir e até a conduta (média, mediana, p90) e contagem por conduta | 3, 5.9 |
| **Painel administrativo** | `summarize_chat_response_times` ganha **`p_subject_id`** (filtra um assunto) e **`p_group_by_subject`** (quebra cada balde por assunto), e as colunas **`subject_id`, `subject_label`** no fim. Sem os dois, as linhas são **as mesmas de antes** | 3 |
| **Painel clínico** | **`summarize_my_portfolio(p_from, p_to)`**: a carteira **da própria pessoa** — alertas que assumiu e resolveu, tempo da primeira resposta no chat — ao lado da **média dos colegas da área**, que vem **nula** com menos de 3 colegas | 3 |
| **Painel clínico e administrativo** | `read_patient_list` traz **`last_interaction_at`** no fim da linha (a última mensagem do paciente ou do acompanhante) e aceita `p_order_by: 'last_interaction_at'` | 5.14 |

**O que fazer já:**

- **Lista de pacientes:** troque o rótulo **"Último acesso" por "Última interação"** e leia
  `last_interaction_at`. **Não é último acesso ao app**: é a última mensagem que o paciente ou o
  acompanhante mandou no chat. Nulo quer dizer "nunca escreveu" — mostre traço, não "nunca acessou".
- **Relatórios → Alertas:** um gráfico por coorte com `summarize_alerts`. **Não exiba "falso
  positivo"**: não há esse desfecho. "Resolvido com orientação" é conduta, não alarme falso.
- **Relatórios → Atendimento:** o filtro de assunto vai em `p_subject_id`, e a tabela "por assunto"
  usa `p_group_by_subject: true`. **Não some medianas entre linhas**: para o total de uma área,
  chame sem o agrupamento.
- **Carteira do profissional:** chame `summarize_my_portfolio` com a sessão do profissional. Onde o
  comparativo vier `null`, escreva *"comparativo indisponível: menos de 3 colegas na área"* (há
  `peer_count` para isso). **Não monte** "pacientes ativos", "distribuição por fase" nem "precisa de
  atenção" ainda: esperam a CEON. *Em remissão* e *em finalização* saíram por decisão da CEON em
  31/08, e "risco" depende das etiquetas do Gemed, fora do escopo de leitura.
- **Mapeie o erro novo** na seção 9: `professional_profile_required`.

---

## O que mudou em 30/09/2026 (Fase H): o chat

> [!NOTE]
> **Aplicado em homologação em 01/10/2026.** Quatro migrations, só banco, nenhuma Edge
> Function mudou. Resposta aos itens 7, 8 e 9 da lista do painel de 30/09/2026. O item 6 (horário
> por profissional) **não entra**: a CEON respondeu em 31/08 que o horário é o mesmo para toda a
> equipe.

| Quem | O que muda | Seção |
|---|---|---|
| **Painel administrativo** | **`set_conversation_subject_specialty(p_subject_id, p_specialty_id)`** liga um assunto do chat a uma especialidade; `null` devolve o assunto à navegadora. **Psicologia é recusada** (`confidential_specialty_not_routable`). O mapa **continua vazio** até alguém ligar | 5.6, 5.21 |
| **Painel clínico** | `claim_conversation` passa a aceitar a conversa **roteada e ainda sem responsável** da **área de quem assume**, e a conversa **fica na área dela** | 5.6 |
| **Painel administrativo** | **Respostas rápidas**: `create_quick_reply`, `update_quick_reply` e `set_quick_reply_active`. A tabela `quick_replies` **nasce vazia**: os textos são da clínica | 5.6 |
| **Painel clínico** | Lista de respostas rápidas: **`.from('quick_replies')`**, direto. Vêm as **gerais** e as da **área** da pessoa | 5.6 |
| **Painel clínico** | **Encaminhar avisa quem recebe** (`chat_assigned`) e **resolver avisa quem tinha encaminhado** (`chat_forward_resolved`, tipo novo). Nada a fazer para gerar: chegam pela caixa e pelo push | 5.6, 5.8 |
| **App do paciente** | A **mensagem automática do encaminhamento** passa a gerar `chat_message`, como a resposta da equipe. O acompanhante também recebe, se tiver a área `chat` e a conversa não ficar restrita | 5.8 |
| **Painel clínico** | `conversation_assignments.release_reason` diz por que cada designação se encerrou: `transferred`, `resolved` ou `returned` | 5.6 |

**O que fazer já:**

- **Tela de vocabulários (assuntos):** mostre a área de cada assunto (`conversation_subjects.specialty_id`)
  e um seletor que **não ofereça especialidade com `is_confidential = true`**. Explique o efeito:
  *"conversas deste assunto vão direto para a fila da área, sem passar pela navegadora"*.
- **Fila do painel clínico:** a conversa roteada aparece para todos (é `team`), mas o botão
  **"Assumir" só vale para quem é da área** dela. Para os demais, esconda o botão ou trate o `42501`.
  Se ninguém da área atender, o administrador a devolve com `return_conversation_to_queue`.
- **Chat do profissional:** um seletor de respostas rápidas que **cola o `body` no campo de
  texto**. A mensagem continua sendo um `.insert()` em `messages`, como hoje.
- **Configurações → Respostas rápidas:** lista (o administrador vê também as aposentadas),
  criar, editar (o formulário salva **tudo**; área vazia torna a resposta geral) e aposentar.
- **Caixa do painel:** trate os tipos `chat_assigned` e `chat_forward_resolved`. Os dois apontam
  para a **conversa** (`target_table = 'conversations'`). Leia o rótulo do tipo, não fixe texto.
- **Mapeie os erros novos** na seção 9: `confidential_specialty_not_routable`, `subject_not_found`,
  `quick_reply_not_found`, `invalid_label`, `invalid_body`.

---

## O que mudou em 30/09/2026 (Fase G): o administrador escreve orientação

> [!NOTE]
> **Aplicado em homologação em 01/10/2026.** Três migrations, só banco. Resposta ao item 1
> da lista do painel de 30/09/2026. As duas primeiras sobem **juntas**: a autoria do administrador
> nunca vai para homologação sem a trava de autoaprovação.

| Quem | O que muda | Seção |
|---|---|---|
| **Painel administrativo** | O administrador **cria, redige, anexa, marca CID e envia para revisão**, pelos mesmos `.insert()`/`.update()` do profissional, assinando com **`author_admin_id`** e **`created_by_admin_id`** | 5.5 |
| **Painel administrativo** | Escreve em **qualquer categoria ativa, inclusive Psicologia**. O profissional continua só na própria área | 5.5 |
| **Painel administrativo** | **Ninguém aprova a própria versão**: `self_approval_not_allowed` (`42501`). A versão do administrador espera **outro administrador**. **Provisório** até a resposta da CEON | 5.5 |
| **Painel clínico e administrativo** | `author_professional_id` e `created_by_professional_id` **podem vir `null`** (autor é o administrador) | 5.5 |
| **App do paciente** | Nada muda: a orientação do administrador chega pela mesma elegibilidade por CID | — |

**O que fazer já:**

- **Formulário de orientação no painel administrativo:** leia o próprio `admins.id`
  (`from('admins').select('id').eq('account_id', user.id)`) e mande-o em `author_admin_id` e
  `created_by_admin_id`, **sem** as colunas do profissional.
- **Fila de aprovação:** esconda "Aprovar" quando `created_by` é o usuário da sessão, e explique
  que outro administrador precisa aprovar. "Devolver" continua disponível: é como o autor retira o
  texto da fila.
- **Autor na tela:** trate as colunas do profissional como opcionais; o nome vem da conta
  (`authored_by`/`created_by`).
- **Mapeie os erros novos** na seção 9: `self_approval_not_allowed` e o `23514` de autoria.

> [!WARNING]
> **Com um único administrador ativo, a orientação que ele escreve não é publicada** até existir um
> segundo. É consequência da trava, e a CEON foi avisada junto com a pergunta.

---

## O que mudou em 30/09/2026 (Fase F): contas da equipe

> [!NOTE]
> **Aplicado em homologação em 01/10/2026**, migrations e Edge Functions. Três migrations e **duas Edge
> Functions novas**, `create-staff-account` e `reset-mfa-factor`, publicadas em v1. Resposta aos itens 3 e 4 da lista do painel de
> 30/09/2026. Depende da Fase E (a recusa de conta de paciente, E.5).

| Quem | O que muda | Seção |
|---|---|---|
| **Painel administrativo** | **Cadastrar profissional ou administrador novo** pela Edge Function **`create-staff-account`**. A pessoa recebe **convite por e-mail** e define a própria senha; nenhuma senha passa pelo painel | 5.13 |
| **Painel administrativo** | O papel nasce **pendente** (`pending_confirmation = true`, `is_active = false`) e só vale quando a pessoa **abre o link do e-mail**. `list_pending_staff_invitations()` alimenta o "convite pendente"; o reenvio é a mesma função com `{ resend: true, account_id }` | 5.13 |
| **Painel administrativo** | `set_professional_active` sobre papel pendente responde **`staff_invitation_pending`**. Para desistir de um convite, **desative a conta** (`set_account_active`) | 5.13 |
| **Painel administrativo** | **Redefinir o segundo fator de outra pessoa da equipe** pela Edge Function **`reset-mfa-factor`**. Os fatores saem, as sessões da pessoa caem, e a trilha registra | 5.18 |
| **Painel administrativo** | As duas funções exigem **sessão `aal2`** (segundo fator verificado), **mesmo com `require_admin_mfa` desligado**. Sem ela: `mfa_required` (`403`) | 5.13, 5.18 |

**O que fazer já:**

- **Tela de cadastro da equipe:** chame `create-staff-account` em vez de pedir um `account_id`. O
  fluxo antigo (`create_professional`/`create_admin` sobre conta existente) continua valendo para
  quem **já está na equipe** e ganha um segundo papel.
- **Tela de definir senha:** o link do convite cai na **Site URL** do Auth (ou em
  `STAFF_INVITE_REDIRECT_URL`, se configurado), já com sessão. Ali o painel chama
  `supabase.auth.updateUser({ password })`. Configure a *Redirect URL* no Auth do projeto.
- **Lista de profissionais:** `professionals.pending_confirmation` distingue **"convite pendente"**
  de **"desativado"**. Os dois têm `is_active = false`.
- **Mapeie os erros novos** na seção 9: `mfa_required`, `invalid_email`, `invalid_role`,
  `staff_invitation_pending`, `staff_invitation_not_found`, `invite_failed`,
  `cannot_reset_own_factor`, `staff_account_not_found`, `reset_failed`.

> [!WARNING]
> **Antes de liberar ao painel, conferir no Auth de homologação** (painel do Supabase): o limite de
> e-mails por hora (*Rate Limits*), o modelo do convite em pt-BR (*Email Templates → Invite user*) e a
> *Site URL*/*Redirect URLs*. Um convite de teste para conta sintética fecha a verificação. O SMTP
> próprio já está configurado (30/09/2026).

---

## O que mudou em 30/09/2026 (Fase E): defeitos e sigilo

> [!NOTE]
> **Aplicado em homologação em 01/10/2026.** Só banco, nenhuma Edge Function mudou.
> Resposta aos itens 2, 13, 14, 15 e 19 e à pergunta 3 da lista do painel de 30/09/2026.

| Quem | O que muda | Seção |
|---|---|---|
| **Painel clínico** | Assumir e encaminhar conversa usam a especialidade **vigente**. Quem trocou de área assume na área nova e consegue encerrar (acabou o 403) | 5.6 |
| **Painel administrativo** | **`return_conversation_to_queue(p_conversation_id)`** devolve uma conversa assumida à fila geral. É assim que as três conversas presas em homologação voltam | 5.6 |
| **Painéis** | `set_appointment_status` e `reschedule_appointment` com id inexistente respondem **`appointment_not_found`** (`P0002`). Antes, `set_appointment_status` **dava sucesso** | 5.7 |
| **Painéis** | `schedule_appointment` recusa **especialidade sigilosa de outra pessoa** com `origin_specialty_not_allowed` (`42501`). A navegadora não marca sessão de Psicologia | 5.7 |
| **Painéis** | Toda `read_*` (e `reveal_patient_identifiers`) com paciente **inexistente** devolve **vazio**, em vez de `409` | 3 |
| **Painel administrativo** | **`is_patient_account(p_account_id)`** diz se a conta é de paciente. `create_professional`/`create_admin` recusam conta de paciente (`account_is_patient`) e de acompanhante (`account_is_caregiver`) | 5.13 |
| **Painel administrativo** | `patients.address` tem **formato fixo** (sete chaves), e **`{}` limpa o endereço** | 5.12 |
| **App e painéis** | Rótulos semeados com acento: 5 sintomas, 7 CIDs e 2 fases aposentadas. **Os códigos não mudaram** | 5.21 |

**O que fazer já:**

- **Não fixe os rótulos antigos** (`Nausea`, `Em remissao`…) em teste nem em tela. Leia o rótulo do
  banco. Filtro e lógica usam `code`, que não mudou.
- **Mapeie os erros novos** na tabela da seção 9: `appointment_not_found`, `origin_specialty_not_allowed`,
  `conversation_not_found`, `account_is_patient`, `account_is_caregiver`.
- **Endereço:** grave no formato da seção 5.12. Chave fora da lista é recusada com `23514`.
- **Antes de oferecer uma conta como "profissional novo"**, pergunte `is_patient_account`. O banco
  recusa de qualquer jeito, mas a tela avisa antes.

> [!NOTE]
> **Fechado provisoriamente em 01/10/2026 (Fase E.3b).** Nesta fase, quem tinha `schedule.manage` e o
> **id** de uma sessão de Psicologia ainda a remarcava ou mudava o estado dela sem vê-la. A
> `restrict_confidential_appointment_writes` fechou o furo no modo **restritivo**: só quem vê o
> compromisso o altera, e o invisível responde `appointment_not_found`. Vale até a CEON responder à
> pergunta 1 (D6). Ver *O que mudou em 01/10/2026 (Fase E.3b)*.

---

## O que mudou em 29/09/2026 (Fase D): a confirmação que disputou o número não liga a ficha

> [!NOTE]
> **Em homologação desde 29/09/2026.** Só banco: nenhuma Edge Function mudou.

O Auth confirma a troca de celular procurando **qualquer** conta com aquele número pendente, e
com o Twilio Verify o código vale para o número, não para a conta. Com duas contas pedindo o
mesmo número, o código legítimo de uma pode confirmar a outra. O banco agora registra cada
confirmação e marca a que aconteceu com outra conta pendente no mesmo número.

| Quem | O que muda | Seção |
|---|---|---|
| **App do paciente** | `link_patient_by_verified_phone` ganha o código **`phone_contested`**. A tela conduz ao **convite por SMS** | 5.12 |
| **App do paciente** | O pedido de troca de celular **não confirmado em 15 min** é apagado. Quem volta depois disso pede o código de novo (`updateUser({ phone })`) | 5.12 |
| **Painéis** | Nada muda | — |

- `phone_contested` **não conta tentativa** e vem antes de olhar a ficha: responde igual com
  qualquer CPF.
- Mensagem neutra: *"Não foi possível confirmar este número. Use o link do convite enviado pela
  clínica."* Não diga que outra conta pediu o mesmo número.
- **Mantenha a trava de 28/09**: se a sessão devolvida pela confirmação for de **outra conta**,
  saia da sessão. Ela continua sendo a primeira barreira.

---

## O que mudou em 29/09/2026 (noite): as áreas escolhidas na criação do acompanhante

> [!NOTE]
> **Em homologação desde 29/09/2026**: o banco e a Edge Function `create-caregiver` (v4).

**O paciente escolhe as áreas no próprio formulário de criação do acompanhante**, e o vínculo já
nasce com a escolha. Até aqui ele nascia com as cinco ligadas, e o paciente só podia desligar
depois, com o acompanhante já vendo tudo desde a troca da senha.

| Quem | O que muda | Seção |
|---|---|---|
| **App do paciente** | `create-caregiver` aceita `scopes` no corpo, **opcional**: sem o campo, nada muda | 5.2 |
| **App do acompanhante** | Nada. Ativado, ele alcança só o que foi escolhido, pelas mesmas regras de 5.2 | — |
| **Painéis** | Nada muda | — |

```ts
await supabase.functions.invoke('create-caregiver', {
  body: { full_name, email, phone, delivery: 'whatsapp', scopes: ['schedule', 'chat'] },
})
```

- `scopes` **ausente ou `null`** → as cinco ligadas, como antes. `[]` → nenhuma: o acompanhante
  nasce "pausado".
- Valor fora das cinco áreas, item nulo ou `scopes` que não é lista → **`422 { error: 'invalid_scope' }`**,
  e **nenhuma conta é criada**.
- A escolha fica na trilha de auditoria, com o paciente como autor de cada área desligada.
- Depois de criado, o ajuste continua por `set_caregiver_scope`.

---

## O que mudou em 29/09/2026 (fim da tarde): as notificações respeitam as áreas

> [!NOTE]
> **Em homologação desde 29/09/2026.**

**Área desligada deixa de gerar notificação para o acompanhante, e as antigas daquela área somem
da caixa dele.** Com o chat desligado, a equipe responde, o titular recebe o push e o acompanhante
não recebe nada. Religar devolve as antigas à caixa. As notificações criadas durante o período
desligado não são recriadas.

| Área desligada | O acompanhante deixa de receber, e deixa de ver na caixa |
|---|---|
| `schedule` | `appointment_scheduled`, `appointment_changed`, `appointment_reminder_24h`, `appointment_reminder_2h` |
| `chat` | `chat_message` |
| `resources` | `content_published` |
| `clinical_record` | `content_published` de orientação **marcada por CID**: o aviso revelaria o diagnóstico |

| Quem | O que muda | Seção |
|---|---|---|
| **App do paciente** | Nada. O titular continua recebendo tudo o que é dele. **A chave de áreas já pode ir ao usuário final** | 5.2 |
| **App do acompanhante** | Nada a chamar. `.from('notifications')` e o Realtime já chegam recortados. Contador de não lidas: conte pela mesma consulta, não guarde número no cliente | 5.8 |
| **Painéis** | Nada muda. Notificação da equipe não tem área | — |

- **Acompanhante revogado** deixa de ver as notificações de agenda, chat e orientação daquele
  paciente, mesmo as recebidas antes da revogação.
- O lembrete criado com a agenda ligada e desligada antes do envio **não sai** (fica `skipped` na
  fila). A área é conferida duas vezes: quando a notificação nasce e quando o push sai.
- O pacote de dados do próprio usuário (`export_my_data`) continua levando **todas** as notificações
  da conta. É o registro do que ela recebeu, não uma tela.

---

## O que mudou em 29/09/2026 (tarde): áreas do acompanhante

> [!NOTE]
> **Em homologação desde 29/09/2026.** O único vínculo vivo que existia lá recebeu as cinco áreas
> ligadas, então o acompanhante dele continua vendo o mesmo que via.

**O paciente passa a escolher, área por área, o que o acompanhante alcança** (mudança de escopo
aceita pela clínica em 29/09/2026). São cinco áreas: agenda, diário, chat, orientações e dados
clínicos. **Todas nascem ligadas, inclusive nos vínculos que já existem**: nada muda para quem já
usa o app até o paciente desligar alguma.

| Quem | O que muda | Seção |
|---|---|---|
| **App do paciente** | Tela do acompanhante ganha uma chave por área: `rpc('get_caregiver_scopes')` para ler, `rpc('set_caregiver_scope', { p_scope, p_enabled })` para mudar | 5.2 |
| **App do acompanhante** | `rpc('get_my_ward_scopes')` diz quais áreas ele tem, para montar o menu. Área desligada **devolve `[]`** nas leituras (não é erro) e **recusa** as escritas daquela área | 5.2 |
| **App do acompanhante** | Com `clinical_record` desligada, a biblioteca mostra **só as orientações universais**: a marcada por CID revelaria o diagnóstico | 5.2, 5.5 |
| **Painéis** | Nada muda. A equipe e a administração não veem nem mudam as áreas | — |

> [!NOTE]
> **As notificações também respeitam as áreas**, desde o fim da tarde do mesmo dia (seção acima).
> A chave pode ir ao usuário final.

---

## O que mudou em 29/09/2026 (manhã)

Duas mudanças, as duas no primeiro acesso do paciente:

1. **O Auth recusa criar conta sem e-mail** (`create_auth_signup_hook`). Na prática, fecha o
   cadastro por telefone (`signInWithOtp({ phone })` para número que não tem conta), que qualquer
   pessoa podia chamar com a chave pública e que envolve SMS pago.
2. **O paciente liga a conta à ficha sem o código do convite** (`create_patient_link_attempts` +
   `create_link_patient_by_verified_phone`). Depois de confirmar o celular por SMS, ele informa
   CPF e data de nascimento e chama `link_patient_by_verified_phone`. O convite continua valendo
   como reserva.

| Quem | O que muda | Seção |
|---|---|---|
| **App do paciente** | `signInWithOtp({ phone })` para número **sem conta** responde **403 `email_required`**. Não é bug: conta nasce por e-mail e senha, Google ou Apple. Confirmar o celular de conta existente (`updateUser({ phone })`) continua igual | 2 |
| **App do paciente** | **RPC nova `link_patient_by_verified_phone(p_cpf, p_birth_date)`**. Ela **não levanta erro**: devolve `{ linked, patient_id }` ou `{ linked: false, error }`. Leia o `data`, não o `error` | 5.12 |
| **Painéis** | Nada muda. O convite pendente da ficha ligada pelo celular passa a `cancelled` sozinho e sai da fila de reenvio | 5.12 |

**Onde está cada uma:** as três migrations estão em homologação desde 29/09/2026, e o hook está
**ativo**. Hoje, porém, o provedor de SMS de homologação está sem credencial: qualquer chamada
por telefone (criar conta **ou** confirmar o celular) responde antes, com **400 `phone_provider_disabled`**. Até o Twilio ser
configurado, o 403 do hook não aparece e **nenhuma conta consegue confirmar o celular**, então a
ligação pelo celular também não tem como ser testada de ponta a ponta em homologação.

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
| `admins` | Bootstrap (só com a tabela vazia), Edge Function `create-staff-account` (conta nova, por convite) ou `create_admin(p_account_id)` (conta que já existe) — ver 5.13 | ✅ |
| `patients` | A ficha por `create_patient(...)`; o **vínculo com a conta** por `link_patient_by_verified_phone(...)` ou `accept_patient_invitation(...)` — ver 5.12 | ✅ **desde 11/09/2026** |
| `professionals` | Edge Function `create-staff-account` (conta nova, por convite, **desde 30/09/2026**) ou `create_professional(...)` (conta que já existe), pelo administrador — ver 5.13 | ✅ **desde 11/09/2026** |

**Papel pendente — desde 30/09/2026.** `create_professional` e `create_admin` sobre conta cujo
e-mail **ainda não foi confirmado** criam o papel com `is_active = false` e
`pending_confirmation = true`. A confirmação do e-mail (a pessoa abre o link do convite) o ativa,
por trigger. Sobre conta já confirmada, o papel nasce ativo, como sempre.

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
**liga ficha e conta** por um de dois caminhos: `link_patient_by_verified_phone` (celular
confirmado por SMS **mais** CPF e data de nascimento, desde 29/09/2026) ou
`accept_patient_invitation` (token do convite **mais** CPF e data de nascimento). Ver 5.12.
Enquanto `account_id` for `NULL`, `private.my_own_patient_id()` não devolve a ficha — o titular não vê nada, o que é o comportamento correto e não um bug.

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

### Conta sem e-mail é recusada — **desde 29/09/2026**

Toda conta precisa de e-mail. O hook *Before User Created* do Auth
(`private.before_user_created`) recusa, **antes** de gravar qualquer coisa e antes de qualquer
SMS, a criação de usuário que chega sem e-mail. Na prática, isso só acontece no cadastro por
telefone:

```ts
// número que ainda não tem conta
const { error } = await supabase.auth.signInWithOtp({ phone: '+5549999990000' })
// error.status  === 403
// error.message === 'email_required'
```

| Caminho | Resultado |
|---|---|
| `signUp({ email, password })`, Google, Apple | Passa. A Apple manda o e-mail de retransmissão quando a pessoa esconde o dela |
| `signInWithOtp({ phone })` / `signUp({ phone, password })` para número **sem conta** | **403 `email_required`**, sem SMS |
| `updateUser({ phone })` numa conta **existente** (confirmar o celular) | Passa: o hook só roda na **criação** de usuário, não na atualização |
| Acompanhante criado pelo paciente (`create-caregiver`) | Passa: usa o admin API, que não passa pelo hook, e sempre manda e-mail |

**Não use o login por SMS para criar conta.** O SMS serve para **confirmar o celular** de quem
já entrou por e-mail, Google ou Apple, e é esse celular confirmado que liga a conta à ficha
(`link_patient_by_verified_phone`, seção 5.12). Se a tela de entrada oferece "entrar com o
celular", trate `email_required` como "este número não tem conta — cadastre-se com e-mail".

> [!note] Antes de 29/09/2026 a criação por telefone também falhava, mas mal
> O trigger que cria `accounts` exige e-mail, e o Auth desfazia o usuário. A resposta, porém, era
> um **500** com o erro cru do Postgres (nome da tabela, da coluna e a linha com o telefone), e a
> proteção dependia de uma constraint que não foi escrita para isso. Se o app tratava esse 500,
> troque pelo 403 acima.

### MFA — o que o cliente precisa tratar

O **TOTP (app autenticador) está habilitado** no projeto. SMS não. Estado atual e o que ele exige de vocês:

- **O 2FA é obrigatório para o administrador** (contrato), **opcional** para paciente e profissional. Hoje o banco **ainda não exige**: nenhuma política olha o nível de garantia da sessão. Quando passar a exigir, o aviso vem com antecedência — não é mudança que se descobre em produção.
- **Sessão com fator cadastrado e não verificado é encerrada em 15 minutos.** Está ligado no projeto (*Limit duration of AAL1 sessions*). Vale para **todos os perfis**, inclusive o app do paciente: se a pessoa cadastrar um autenticador e não completar a verificação, a sessão cai sozinha. **Trate `TOKEN_REFRESHED`/`SIGNED_OUT` no `onAuthStateChange`** e leve para a tela de verificação — não para um erro genérico.
- Quem não tem fator cadastrado **não é afetado**: não há o que verificar.
- **Verificar um fator novo derruba as outras sessões `aal1` da mesma pessoa** (comportamento do
  Auth, medido em 30/09/2026). Quem cadastra o autenticador no painel com o app aberto em outro
  aparelho vê o app pedir login de novo.
- **Sessão `aal2` é exigida sempre** para cadastrar alguém da equipe (`create-staff-account`) e
  para redefinir o segundo fator de alguém (`reset-mfa-factor`), com ou sem `require_admin_mfa`
  ligado (5.13, 5.18).

O nível da sessão vem em `supabase.auth.mfa.getAuthenticatorAssuranceLevel()` — `aal1` é só senha, `aal2` é segundo fator verificado.

### Como nasce um administrador

São **dois caminhos**, e o primeiro só existe uma vez.

**O primeiro admin (bootstrap).** `public.admins` não tem política de INSERT para
`authenticated`, então o acesso inicial vem de fora, pelo terminal — ver `scripts/README.md`.
O perfil é concedido por trigger (`trg_handle_auth_user_confirmed`) quando o convidado
**confirma o e-mail**, e **só enquanto `public.admins` está vazia**. Depois disso o caminho
fecha: a mesma marca em `app_metadata` deixa de conceder qualquer coisa, inclusive para
`service_role`.

**Os demais.** Pessoa nova: Edge Function **`create-staff-account`** com `role: "admin"` (5.13),
que cria a conta, concede o papel **pendente** e envia o convite; o papel vale quando a pessoa
confirma o e-mail. Conta **que já existe**: `select public.create_admin('<account_id>')`. Exige
admin ativo na sessão (`42501` caso contrário) e é idempotente: promover duas vezes devolve o
mesmo perfil.

```
convite ──► confirma e-mail ──► (admins vazia?) ──► sim: bootstrap concede
                                                └─► não: nada. Use create_admin()
```

Duas consequências para o painel:

- **Entre o convite e o clique no link, existe conta sem perfil de admin ativo.**
  `private.is_active_admin()` é `false` nesse intervalo. No bootstrap o convidado pendente **não
  aparece** na lista de administradores; pelo `create-staff-account` ele aparece com
  `pending_confirmation = true` e em `list_pending_staff_invitations()` — é esperado, não bug. A concessão depende da confirmação porque
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
| `read_patient_id_by_account` | `p_account_id` | **O `patients.id` de uma conta**, ou `null`. Só administrador em sessão `aal2`. Devolve só o id; a ficha vem de `read_patient`. A trilha grava a conta consultada (`resource_table = 'patient_by_account'`), com ou sem resultado |
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
| `summarize_chat_response_times` | `p_from, p_to, p_granularity='month', p_specialty_id, p_subject_id, p_group_by_subject=false` | **Tempo até a primeira resposta da equipe**, por período e especialidade e, desde 30/09/2026, por assunto |
| `summarize_alerts` | `p_from, p_to, p_granularity='month'` | **A fila de alertas em números**, por coorte de nascimento (desde 30/09/2026) |
| `summarize_my_portfolio` | `p_from, p_to` | **A carteira da própria pessoa** e a média dos colegas da área (desde 30/09/2026). Só profissional ativo |

`p_granularity` aceita `day`, `week` ou `month` — qualquer outro valor é recusado. **A janela é
obrigatória** em `summarize_symptoms_by_protocol`, `summarize_appointments`,
`summarize_chat_response_times`, `summarize_alerts` e `summarize_my_portfolio`: varredura sem
período não é relatório, é dump. Em
`summarize_content_reads` ela é opcional e vale sobre a data da leitura, **no fuso da clínica**.

**Colunas de retorno**, para dimensionar a tela antes de chamar:

- `summarize_symptoms_by_protocol` → `protocol_name, symptom_id, symptom_label, grade, report_count, patient_count, protocol_patient_count, patients_at_or_above`
- `summarize_treatment_protocols` → `protocol_name, plan_count, current_patient_count`
- `summarize_content_reads` → `content_item_id, read_count` (orientação sem leitura **não tem linha**: mostre zero)
- `summarize_appointments` → `bucket_start, appointment_type_id, appointment_type_label, specialty_id, specialty_label, status_code, status_label, status_reason_id, status_reason_label, appointment_count, patient_count, confirmed_count`
- `summarize_chat_response_times` → `bucket_start, specialty_id, specialty_label, conversation_count, answered_count, unanswered_count, first_response_avg_seconds, first_response_median_seconds, first_response_p90_seconds, subject_id, subject_label`
- `summarize_alerts` → `bucket_start, alert_count, triaged_count, resolved_count, open_count, triage_avg_seconds, triage_median_seconds, triage_p90_seconds, conduct_avg_seconds, conduct_median_seconds, conduct_p90_seconds, conduct_guidance_count, conduct_scheduling_count, conduct_referral_count`
- `summarize_my_portfolio` → `specialty_id, specialty_label, peer_count, alerts_triaged_count, alerts_resolved_count, peer_alerts_triaged_avg, peer_alerts_resolved_avg, first_response_count, first_response_avg_seconds, peer_first_response_avg_seconds`

#### Fila de alertas, assunto do chat e carteira — **desde 30/09/2026**

```ts
// Fila de alertas de setembro, por semana
const { data } = await supabase.rpc('summarize_alerts', {
  p_from: '2026-09-01T00:00:00-03:00', p_to: '2026-10-01T00:00:00-03:00', p_granularity: 'week',
})

// Tempo de resposta por assunto, só na Enfermagem
await supabase.rpc('summarize_chat_response_times', {
  p_from, p_to, p_specialty_id: enfermagemId, p_group_by_subject: true,
})

// A carteira de quem está logado (sessão de profissional)
const { data: carteira } = await supabase.rpc('summarize_my_portfolio', { p_from, p_to })
```

- **`summarize_alerts` conta por coorte de NASCIMENTO**, no fuso da clínica: o balde é o dia (ou
  semana, ou mês) em que o alerta nasceu, e `triaged_count`/`resolved_count` dizem quantos daquela
  coorte **já** foram assumidos ou resolvidos no momento da chamada. A coorte mais recente sempre
  parece pior, porque ainda está em andamento: `open_count` vem separado, e os tempos se calculam
  **só sobre quem passou pela etapa**. Os dois tempos se medem do nascimento do alerta.
- **Não há recorte por hora do dia**, e **não há taxa de falso positivo**: o alerta tem três
  estados e a conduta é uma de três (ADR-019 §1).
- A fila é do time inteiro: **todo profissional ativo e o administrador** recebem os mesmos números.
  Paciente e acompanhante recebem vazio.
- **`summarize_chat_response_times` com assunto:** `p_subject_id` filtra (as linhas vêm com o
  assunto preenchido); `p_group_by_subject: true` quebra cada balde por assunto. **Sem os dois,
  nada muda**: as linhas são as de antes, com `subject_id` e `subject_label` nulos. Assunto
  aposentado continua com rótulo. **Mediana e p90 não se somam**: para o total, chame sem
  agrupar.
- **`summarize_my_portfolio` é sempre de quem chama.** Não há parâmetro de profissional, e
  **nenhuma coluna traz id de colega**. Administrador, paciente e conta desativada recebem
  `42501 professional_profile_required`. Uma linha por especialidade vigente (quase sempre uma);
  os números da pessoa se repetem, e o comparativo é o daquela área.
  - **Alertas:** os que a pessoa **assumiu** (`triaged_at`) e **resolveu** (`resolved_at`) **dentro
    da janela**: vale o instante da ação, não o nascimento do alerta.
  - **Primeira resposta:** conversas **abertas na janela** em que a **primeira resposta da equipe**
    foi da pessoa, e o tempo médio desde a abertura. Responder depois de um colega não conta.
  - **Comparativo:** média dos colegas **ativos na mesma especialidade, sem contar quem consulta**.
    Para alertas, é por pessoa (o total dos colegas dividido por `peer_count`, inclusive quem não
    fez nada); para tempo, é a média das respostas deles. **Com menos de 3 colegas, os três
    campos `peer_*` vêm nulos** — com 1 ou 2, a média revelaria a pessoa.
  - O sigilo vale: conversa restrita de outra área não entra nem no número da pessoa, nem no dos
    colegas.

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

- **Resumo de OUTRO profissional não existe.** O recorte é **por especialidade**. Desde
  30/09/2026 há a carteira da **própria** pessoa (`summarize_my_portfolio`), que se compara com a
  média dos colegas da área, sem nunca identificar nenhum, e só com pelo menos 3 colegas.
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
`legal_document_versions` (só a vigente, para quem não é admin) · `quick_replies` (equipe; desde 30/09/2026)

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

### Paciente inexistente — **desde 30/09/2026**

Uma `read_*` (ou `reveal_patient_identifiers`) chamada com um `p_patient_id` que **não existe**
devolve **vazio**, como uma leitura sem resultado. Antes ela falhava com `23503`, que o PostgREST
entrega como **`409 Conflict`**.

- **Vazio não quer dizer "não existe".** Pode ser a ficha inexistente, ou uma que você não pode ver.
  A tela diz "ficha não encontrada" e oferece voltar à lista.
- **A tentativa fica na trilha**, na coluna `audit_log.attempted_patient_id`, com `row_count = 0`.
  O paciente que existe continua em `patient_id`, como sempre, e as duas colunas nunca andam juntas.
  É o que mostra, na auditoria, alguém tentando ids por tentativa e erro.
- Nenhuma assinatura mudou. As **escritas** continuam respondendo `patient_not_found` (seção 9).

---

## 4. Quem enxerga o quê

| | Paciente | Cuidador | Profissional | Admin |
|---|---|---|---|---|
| Próprios dados clínicos | ✅ direto | ✅ direto (do tutelado), **só nas áreas ligadas** pelo titular (5.2) | — | — |
| Ficha cadastral: CPF, telefone, e-mail, endereço | ✅ a própria, direto e completa | ❌ só id, nome, fase e situação, por `get_my_ward` | mascarada; completa por `reveal_patient_identifiers`, auditada | idem ao profissional |
| Ficha, diário, plano, agenda, chat de qualquer paciente | — | — | ✅ via `read_*` | ✅ via `read_*` |
| Anotação de especialidade (`specialty_notes`) | ❌ | ❌ | `team` + a própria especialidade | só `team` |
| Conteúdo de **Psicologia** (nota, conversa, compromisso) | ✅ o próprio | ❌ nunca | só a Psicologia | ❌ nunca |
| Sinalização de sofrimento (`specialty_flags`) | ❌ | ❌ | ✅ todos | ❌ |
| Bloqueio pessoal de agenda (`professional_blocks`) | ❌ | ❌ | só o dono, com rótulo; quem tem `schedule.manage` vê **só o intervalo** (`read_professional_busy_intervals`) | **só o intervalo**, sem rótulo |
| Favoritos/lidos de orientação | só o titular | ❌ | ❌ | ❌ |
| Notificações | só o destinatário | só o destinatário, **e só as das áreas ligadas** (5.8) | só o destinatário | só o destinatário |
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
| Edge Function `create-caregiver` | `{ full_name, email, phone, delivery: 'whatsapp' \| 'sms', scopes? }` | `201` — ver abaixo |
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

- **`scopes` (opcional, desde 29/09/2026):** as áreas com que o acompanhante nasce, entre
  `schedule`, `diary`, `chat`, `resources` e `clinical_record` (ver *Áreas do acompanhante*,
  abaixo). Ausente ou `null` → as cinco ligadas; `['schedule', 'chat']` → só essas; `[]` → nenhuma.
  Repetir uma área não faz diferença. Qualquer outro valor dá `invalid_scope` **antes** de criar a
  conta. Monte a tela com as cinco chaves ligadas por padrão: assim quem não mexe nelas manda as
  cinco, e o resultado é o mesmo de não mandar.

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
| `invalid_scope` | criação | `scopes` com área fora das cinco, item nulo, ou que não é lista (desde 29/09/2026) |
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

**O que o cuidador alcança do tutelado** (só com vínculo `active`, e só nas **áreas ligadas**,
abaixo): diário, plano, diagnóstico, histórico, orientações e as conversas e compromissos com
`visibility = 'team'`. Conversa e compromisso **restritos** (Psicologia) não aparecem, não aceitam
mensagem dele, não se marcam como lidos (`mark_conversation_read` devolve o mesmo erro de conversa
inexistente) e não se confirmam, com qualquer área ligada. Ver seção 4.

#### Áreas do acompanhante — **desde 29/09/2026**

O titular liga e desliga o que o acompanhante alcança. **Todas nascem ligadas**, inclusive nos
vínculos criados antes desta mudança.

| Área (`p_scope`) | O que abre ao acompanhante |
|---|---|
| `schedule` | Compromissos da equipe (`appointments`) e `confirm_appointment` / `unconfirm_appointment` |
| `diary` | Ler, criar e editar rascunho de `diary_entries`, e os sintomas (`diary_symptom_reports`) |
| `chat` | `conversations`, `messages`, `message_attachments`, o arquivo no bucket, `start_conversation`, `mark_conversation_read`, mandar mensagem e anexar |
| `resources` | Orientações publicadas (`content_items`, `content_versions`, `content_attachments`). As **marcadas por CID** exigem também `clinical_record`; sem ela, só as universais |
| `clinical_record` | `patient_diagnoses`, `treatment_plans`, `patient_clinical_history` |

**No app do paciente:**

```ts
const { data: scopes } = await supabase.rpc('get_caregiver_scopes')
// [{ scope: 'schedule', enabled: true, updated_at }, …]   — as cinco, nesta ordem; [] sem acompanhante

await supabase.rpc('set_caregiver_scope', { p_scope: 'chat', p_enabled: false })
```

- Vale para acompanhante `pending` também: o paciente pode escolher antes de ele ativar.
- **Desligar as cinco é permitido**: o acompanhante fica "pausado". Ele continua vendo o nome do
  tutelado (`get_my_ward`) e nada mais, sem que o vínculo seja revogado.
- A mudança **vale na próxima consulta** do acompanhante, e o Realtime para de entregar no mesmo
  instante. Não há sessão a derrubar.
- Nova senha (`reset-caregiver-password`) **não** mexe nas áreas. Revogar tira o acesso a tudo;
  um acompanhante novo nasce com as áreas escolhidas no `scopes` de `create-caregiver`, ou com as
  cinco ligadas se o campo não vier.
- Toda mudança fica na trilha de auditoria, com o paciente como autor.
- Só o titular muda. Acompanhante, equipe e administração recebem `not_patient_owner`.

**No app do acompanhante:**

```ts
const { data } = await supabase.rpc('get_my_ward_scopes')
// [{ scope: 'schedule' }, { scope: 'diary' }, …]   — só as ligadas; [] se pending, revogado ou pausado
```

- Use para **montar o menu**, não como segurança: quem garante é o banco. Área desligada devolve
  `[]` em `.from()` e recusa escrita (`new row violates row-level security policy`, ou `23514` ao
  acrescentar sintoma num rascunho que ele deixou de ver).
- `start_conversation` sem `chat` dá o mesmo erro de quem não tem vínculo
  (`apenas titular ou cuidador abre conversa`); `confirm_appointment` sem `schedule`, o de quem não
  acompanha.
- `resources` ligada **sem** `clinical_record` aparece na lista, mas a biblioteca mostra só as
  orientações universais. Não é bug: a orientação marcada por CID diria o diagnóstico que o paciente
  escolheu não mostrar.
- **As notificações seguem as áreas** (desde a fase C2, 29/09/2026): área desligada não gera
  notificação nova ao acompanhante, e as antigas dela somem da caixa até a área voltar. A tabela
  tipo × área está na seção 5.8.

| Erro | Onde | O que fazer |
|---|---|---|
| `not_patient_owner` (42501) | `set_caregiver_scope` | só o titular muda área |
| `caregiver_not_found` (P0002) | `set_caregiver_scope` | não há acompanhante pendente ou ativo |
| `invalid_scope` (22023) | `set_caregiver_scope` | `p_scope` ou `p_enabled` nulo |
| `22P02` (`invalid input value for enum caregiver_scope`) | `set_caregiver_scope` | área fora das cinco |
| `invalid_scope` (422) | `create-caregiver` | `scopes` inválido; nada foi criado |

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
| `request_data_subject_action(p_request_type, p_requester_note?)` | titular — `access`, `rectification`, `portability`, `consent_revocation`, `deletion`; texto opcional, até 1000 caracteres (desde 02/10/2026) |
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

#### Administrador como autor — **desde 30/09/2026**

O administrador faz as mesmas etapas do profissional: cria, redige, anexa, marca CID e envia para
revisão. A diferença está em **duas colunas** e na **categoria**:

- Assina com **`author_admin_id`** (no item) e **`created_by_admin_id`** (na versão), e deixa as
  colunas do profissional **vazias**. O banco exige **exatamente uma** autoria por linha: mandar as
  duas, ou nenhuma, dá `23514`.
- Escreve em **qualquer categoria ativa, inclusive Psicologia**. O profissional continua só na
  categoria da própria especialidade.
- Cada um escreve só no **próprio** item. O administrador não cria versão na orientação de um
  profissional, e o profissional não cria na do administrador (`42501`).
- Com `require_admin_mfa` ligado, a escrita exige **sessão `aal2`**, como tudo do administrador.

```ts
// o id do administrador da sessão (admins_select_own)
const { data: admin } = await supabase.from('admins').select('id').eq('account_id', user.id).single()

const { data: item } = await supabase.from('content_items').insert({
  category_id, author_admin_id: admin.id, authored_by: user.id
}).select().single()

await supabase.from('content_versions').insert({
  content_item_id: item.id, title, body, media_kind: 'text',
  created_by_admin_id: admin.id, created_by: user.id
})
```

Anexo, CID e envio para revisão seguem igual ao do profissional (seção 7 para o Storage).

> [!WARNING]
> **`author_professional_id` e `created_by_professional_id` agora podem vir `null`.** Toda tela que
> mostra o autor da orientação (biblioteca do painel, fila de aprovação, histórico de versões) precisa
> tratar o caso: autor é o administrador quando `author_admin_id`/`created_by_admin_id` vem
> preenchido. O nome sai da conta (`authored_by`/`created_by` → `accounts.full_name`).

#### Revisão

Revisor (admin): `rpc('review_content_version', { p_content_version_id, p_action, p_comment })`.
`p_action`: `approve` \| `return` \| `reject` \| `unpublish`. **`return` e `reject` exigem comentário.**
Aprovar arquiva a versão anterior sozinho.

**Quem escreve não aprova — desde 30/09/2026, provisório.** `approve` sobre versão criada pela
**própria conta** responde **`self_approval_not_allowed`** (`42501`), mesmo que a pessoa tenha
escrito como profissional e revise como administradora. A versão fica na fila até **outro
administrador** aprovar. Devolver, rejeitar e despublicar a própria versão continuam permitidos:
`return` é o jeito de o autor tirar da fila o texto que enviou.

> [!IMPORTANT]
> **Provisório até a resposta da CEON**, perguntada em 30/09/2026. É a regra restritiva, e a
> recomendada. Se a clínica disser que o administrador pode aprovar o próprio texto, a trava sai por
> migration nova e este parágrafo muda. **Consequência para a tela:** com um único administrador
> ativo, a orientação que ele escreve **espera um segundo administrador**. A fila de aprovação deve
> esconder o botão "Aprovar" nas versões em que `created_by` é o usuário da sessão, e dizer por quê.

Marcação por CID (`content_cid10`) define quem vê. **Sem nenhuma linha de CID = conteúdo universal**,
visível a todos os pacientes. Com CID, só quem tem aquele diagnóstico. O acompanhante segue as
áreas do titular (5.2): sem `resources`, nenhuma; com `resources` e sem `clinical_record`, só as
universais.

Paciente/cuidador leem `content_items` e `content_versions` com `.from()` e recebem **apenas o
publicado e elegível** — a regra roda no banco. Favorito e lido:

```ts
await supabase.from('patient_content_states').upsert({
  patient_id: myPatientId, content_item_id, is_favorite: true, read_at: new Date().toISOString()
})
```

Vídeo é **embed** (`video_url`), aceito só de YouTube/Vimeo em `https`. Nunca upload.

#### Envio dirigido — desde 01/10/2026 (ADR-032)

O profissional envia uma orientação **publicada** a um paciente. É dado clínico, não editorial: o
envio de Psicologia nasce `specialty_restricted` e nunca chega ao acompanhante.

```ts
// Painel: enviar (da especialidade primária vigente, ou informe p_origin_specialty_id)
const { data: sendId } = await supabase.rpc('send_directed_content', {
  p_patient_id, p_content_item_id
})

// Painel: os envios do paciente e se ele abriu (leitura auditada; pagine por p_before = sent_at)
const { data: envios } = await supabase.rpc('read_content_directed_sends', { p_patient_id })
// envios[i].opened_at === null -> ainda não abriu

// App do titular: "enviadas para você"
const { data } = await supabase.from('content_directed_sends')
  .select('id, content_item_id, sent_at, opened_at').order('sent_at', { ascending: false })

// App do titular: ao abrir a orientação vinda de um envio
await supabase.rpc('mark_directed_content_opened', { p_send_id })
```

- **"Abriu" é por envio e só do titular.** Não é `patient_content_states.read_at` (o lido da
  biblioteca, que a equipe não vê). O acompanhante e a equipe recebem `directed_send_not_found`.
- **A orientação enviada abre** para o titular mesmo sem CID compatível, com anexos.
- **Envio repetido é aceito** (dois envios, dois avisos): a tela deve avisar se o item já foi
  enviado e ainda não foi aberto.
- O administrador **não envia** (`professional_profile_required`): é ato clínico.
- **Provisório:** hoje toda especialidade envia, e a equipe toda vê o envio `team`. Se a CEON
  restringir, a tela pode receber `directed_send_not_allowed` e ver menos linhas em
  `read_content_directed_sends`. Esconda o botão de envio por esse erro, não por lista fixa.

### 5.6 Chat — `conversations`, `messages`, `message_attachments`

| RPC | Quem | O que faz |
|---|---|---|
| `start_conversation(p_subject_id, p_body)` | paciente/cuidador | Abre a conversa **e** grava a 1ª mensagem |
| `claim_conversation(p_conversation_id)` | profissional | Assume conversa **sem responsável**: a não roteada (fila geral) ganha a especialidade **vigente** de quem assume; a **roteada** (desde 30/09/2026, H.1) só por quem é da área dela, e fica na área |
| `transfer_conversation(p_conversation_id, p_to_professional_id)` | profissional da área | Encaminha, na especialidade **vigente** do destino, grava a mensagem automática e **avisa quem recebe e o paciente** (desde 30/09/2026) |
| `resolve_conversation(p_conversation_id)` | profissional da área | Marca como resolvida e **avisa quem tinha encaminhado** (desde 30/09/2026) |
| `mark_conversation_read(p_conversation_id)` | todos | Avança o carimbo de até onde se leu |
| `return_conversation_to_queue(p_conversation_id)` | **administrador** | Devolve à fila geral: sem área, sem responsável. Desde 30/09/2026 |
| `set_conversation_subject_specialty(p_subject_id, p_specialty_id)` | **administrador** | Liga o assunto a uma área (`null` = navegadora). Desde 30/09/2026 |

> ⚠️ **CORRIGIDO EM 30/09/2026: a área da conversa é a vigente.** Até então, quem trocava de
> especialidade assumia (e recebia encaminhamento) **na área antiga** e depois não conseguia
> encerrar (`42501`, o 403 do painel). Agora assumir e encaminhar usam a especialidade em que a
> pessoa está hoje. Conversas que ficaram presas na área antiga **não se corrigem sozinhas**: o
> administrador as devolve à fila com `return_conversation_to_queue`, e alguém as assume de novo.
>
> `return_conversation_to_queue` só age em conversa **aberta, já assumida e visível à
> administração**. Conversa de Psicologia, resolvida, ainda na fila ou inexistente respondem
> **igual**: `conversation_not_found` (`P0002`). O painel não deve tentar distinguir os casos. Nada
> é enviado ao paciente, e a devolução fica na trilha com o administrador como autor.

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
- Enquanto o administrador não ligar nenhum assunto, **toda conversa nasce não roteada**: a
  navegadora atende tudo (CEON, 31/08). A fila geral é `origin_specialty_id IS NULL AND status = 'open'`.

`team_last_read_at` diz ao paciente **que** a equipe leu, nunca **quem**.

#### Roteamento por assunto — **desde 30/09/2026**

O administrador decide, pelo painel, se algum assunto vai direto para uma área. **Nasce vazio**:
nenhuma linha de `conversation_subjects` tem `specialty_id`, e ninguém precisa configurar nada para
o chat funcionar como hoje.

```ts
// liga "Medicação" à Farmácia
await supabase.rpc('set_conversation_subject_specialty', { p_subject_id, p_specialty_id: farmaciaId })
// devolve à navegadora
await supabase.rpc('set_conversation_subject_specialty', { p_subject_id, p_specialty_id: null })
```

- **Vale para a próxima conversa.** A conversa já aberta não muda de área: mudar a área de uma
  conversa existente é encaminhamento, e encaminhamento é ato de profissional.
- **Especialidade sigilosa é recusada** com `confidential_specialty_not_routable` (`23514`), por
  qualquer caminho, inclusive `service_role`. Conversa roteada à Psicologia nasceria restrita e
  **sumiria da tela do acompanhante que a abriu**. O caminho até a Psicologia continua sendo o
  encaminhamento.
- A conversa roteada a área não sigilosa nasce **`team`**: a navegadora continua vendo-a na lista,
  só não a assume. Quem é da área assume com `claim_conversation`, e ela **fica na área**, mesmo que
  a pessoa tenha outra especialidade primária.
- Conversa com responsável não se assume de novo (`42501`). Tomar de um colega é `transfer_conversation`.
- A mudança de rota fica na trilha, com o administrador como autor.

#### Respostas rápidas — `quick_replies` — **desde 30/09/2026**

Textos prontos que o profissional cola no campo da mensagem. **Não são dado de paciente**: a
leitura é direta, sem pedágio, e a tabela **nasce vazia** (os textos são da clínica).

```ts
// painel clínico: as gerais + as da minha área, já ordenadas
const { data } = await supabase.from('quick_replies')
  .select('id, label, body, specialty_id').order('sort_order')

// painel administrativo
await supabase.rpc('create_quick_reply', { p_label: 'Bom dia', p_body: 'Bom dia! Em que posso ajudar?' })
await supabase.rpc('create_quick_reply', { p_label: 'Curativo', p_body: '…', p_specialty_id: enfermagemId, p_sort_order: 1 })
await supabase.rpc('update_quick_reply', { p_id, p_label, p_body, p_specialty_id: null, p_sort_order: 2 })
await supabase.rpc('set_quick_reply_active', { p_id, p_is_active: false })
```

- `specialty_id` **nulo = geral**, oferecida a todo profissional. Com área, só a quem está nela hoje.
- O profissional vê só as **ativas**; o administrador vê **todas**, inclusive as aposentadas.
  Paciente e acompanhante não veem nenhuma.
- `update_quick_reply` **substitui tudo**: mande os quatro campos. `p_specialty_id: null` torna
  a resposta geral, não "mantém a área".
- Rótulo de 1 a 80 caracteres (`invalid_label`) e texto de 1 a 2.000 (`invalid_body`), os dois `22023`.
- **Não se apaga** (`23001`, para todo papel): aposente. Não há `code`.
- Inserir a resposta no chat é a mesma `.insert()` em `messages` de sempre: o banco não sabe que o
  texto veio de uma resposta pronta.

#### Avisos do encaminhamento — **desde 30/09/2026**

Nada a fazer para gerar: os avisos nascem dentro das RPCs.

| Quando | Quem recebe | Tipo |
|---|---|---|
| `transfer_conversation` | quem recebe a conversa (se não for quem encaminhou) | `chat_assigned` |
| `transfer_conversation` | o titular, e o acompanhante com a área `chat` **se a conversa seguir `team`** | `chat_message` (a mensagem automática) |
| `resolve_conversation` | quem **estava com a conversa** quando ela foi encaminhada, exceto quem resolveu | `chat_forward_resolved` |

- **"Quem encaminhou" é quem era o responsável** no momento do encaminhamento, lido em
  `conversation_assignments.release_reason = 'transferred'`. Quem perdeu a conversa pela devolução à
  fila (`returned`) não é avisado.
- **Sigilo:** a conversa encaminhada à Psicologia fica restrita. A enfermeira que a encaminhou **não**
  é avisada da resolução, porque não enxerga mais a conversa. No envio, a peneira do push confere o
  mesmo para toda notificação da equipe que aponte para conversa: o profissional precisa enxergá-la
  (`team` ou da área vigente dele), e o administrador, só `team`.
- Tipo aposentado pelo painel **cala o aviso** e não derruba o encaminhamento nem a resolução.

`read_conversation_assignments` devolve `release_reason`: `null` na designação vigente, e
`transferred`, `resolved` ou `returned` nas encerradas. Serve ao histórico visual do encaminhamento.

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

- **Desde 30/09/2026:** `reschedule_appointment` e `set_appointment_status` com id inexistente
  respondem `appointment_not_found` (`P0002`). Antes, `set_appointment_status` **dava sucesso** sem
  alterar nada, e o painel mostrava "cancelado" sobre um compromisso que não existia.
- **Desde 30/09/2026:** `schedule_appointment` com `p_origin_specialty_id` de especialidade
  **sigilosa** (Psicologia) que **não é de quem agenda** responde `origin_specialty_not_allowed`
  (`42501`). A navegadora continua marcando para qualquer especialidade não sigilosa. A sessão de
  Psicologia é marcada pela psicóloga.
- **Desde 01/10/2026, provisório (D6):** `reschedule_appointment` e `set_appointment_status` só
  alteram o compromisso que quem chama **vê**: `team`, ou da própria especialidade vigente. A sessão
  de Psicologia, para a navegadora, responde `appointment_not_found`, igual ao id inexistente.
- **Não existe UPDATE de horário.** Remarcar é `reschedule_appointment` — o relatório de adesão conta remarcações.
- Desde 25/09/2026, marcar, remarcar e cancelar compromisso **futuro** notificam o paciente, e
  os lembretes de 24 h e 2 h saem sozinhos (5.8).
- Estado terminal (`completed`, `cancelled`, `no_show`, `rescheduled`) não transiciona mais.
- Sair de `scheduled` limpa a confirmação sozinho.
- `patient_notes` é texto **exibido ao paciente**. Conteúdo clínico vai em `specialty_notes`.
- **Bloqueio pessoal** (`professional_blocks`) é escrita e leitura diretas do próprio dono, fora do clínico. O painel monta o calendário unindo `read_my_agenda` + `.from('professional_blocks')`.

#### O nome do profissional no compromisso — **desde 02/10/2026**

```ts
// app — paciente ou acompanhante com a área da agenda
const { data } = await supabase.from('appointments')
  .select('id, title, starts_at, ends_at, location_label, professionals(display_name)')
  .order('starts_at')
// data[i].professionals?.display_name → "Consulta com Maria Silva"
```

- **`professionals.display_name`** é o nome da conta do profissional (`accounts.full_name`), mantido
  pelo banco. Não leia `accounts` para isso: o paciente não lê conta de ninguém além da própria.
- **Pode vir `null`**: compromisso sem profissional (`professionals` vem `null`) ou conta sem nome.
  Mostre só o tipo ou o título nesses casos.
- O nome não abre compromisso nenhum: quais compromissos aparecem continua sendo decisão da RLS de
  `appointments` (a sessão sigilosa de outra área, a do outro paciente, a agenda desligada para o
  acompanhante — tudo como antes).

#### O tipo `treatment_closure` — **desde 06/10/2026 (Fase L)**

`appointment_types` ganhou o oitavo tipo, **Encerramento de tratamento**, com o código
`treatment_closure`. O compromisso desse tipo é o que dispara a tela do sino no app.

```ts
// app: reconheça pelo CÓDIGO, nunca pelo rótulo
const { data } = await supabase.from('appointments')
  .select('id, starts_at, appointment_types(code, label)')
const closure = data?.find(a => a.appointment_types?.code === 'treatment_closure')
```

- **O código é reservado.** É contrato com o app, e o banco recusa a troca de código para todo
  papel (5.21). Rótulo, ordem, cor e ícone são da clínica, e o administrador pode mudá-los pelo painel.
  Um app que procure "Encerramento de tratamento" no rótulo para de funcionar no dia em que alguém
  renomear o tipo.
- **Aposentar (`is_active = false`) tira o tipo da lista do painel e também da leitura do paciente.**
  O paciente e o acompanhante só leem tipos **ativos**, e o compromisso já marcado chegaria com
  `appointment_types` nulo, sem a tela do sino. A equipe continua vendo o tipo nas `read_*`. Para
  parar de marcar encerramentos, não marque. Não aposente o tipo.
- Se o painel já tivesse criado um tipo com esse código antes da migration, ele ficaria como estava,
  com o rótulo e a ordem que a clínica escolheu.
- A "uma vez só" da tela do sino é controle do **aparelho**: reinstalar o app ou trocar de aparelho
  mostra a tela de novo. O banco não guarda "já viu".

#### Bloqueio impede agendar — **desde 30/09/2026**

```ts
// Quem agenda: o horário bloqueado é recusado
const { error } = await supabase.rpc('schedule_appointment', { /* … */ })
if (error?.message === 'slot_blocked') {
  // 409: "o profissional não está disponível neste horário" — sem motivo
}

// Administrador ou navegadora (schedule.manage): quando cada um está indisponível
const { data: busy } = await supabase.rpc('read_professional_busy_intervals', {
  p_from: inicioDaSemana.toISOString(),
  p_to:   fimDaSemana.toISOString(),    // até 62 dias
})
// busy: [{ professional_id, starts_at, ends_at }] — sem rótulo, sem id do bloqueio

// O profissional bloqueia (ou move, com p_block_id) e recebe os conflitos
const { data } = await supabase.rpc('save_professional_block', {
  p_starts_at: inicio.toISOString(),
  p_ends_at:   fim.toISOString(),
  p_label:     'Congresso',            // opcional; só o dono lê
  p_block_id:  null,                   // id do bloqueio para mover
})
// data: { block_id, conflicts: [{ starts_at, ends_at }] }
```

- **O que colide:** o intervalo é **semiaberto**, `[início, fim)`. Bloqueio até 12h e compromisso a
  partir de 12h passam. A conta é contra o **profissional do compromisso** (`p_professional_id` ao
  marcar; o do original ao remarcar). Compromisso **sem** profissional nunca colide.
- **Ordem dos erros:** quem não pode agendar recebe o erro de permissão **antes** de qualquer conta de
  horário, e o id inexistente na remarcação continua `appointment_not_found`. Ninguém descobre
  bloqueio por tentativa sem poder agendar.
- **`read_professional_busy_intervals`:** administrador ativo (com o segundo fator, quando exigido) ou
  profissional com `schedule.manage`. Os demais recebem `forbidden`. Devolve os bloqueios que
  **tocam** a janela, mesmo que comecem antes dela. Ordem crescente por início. **Não paga pedágio:**
  não há paciente na linha. O próprio profissional lê os seus, **com rótulo**, por
  `.from('professional_blocks')`.
- **`save_professional_block`:** só o próprio profissional ativo. O bloqueio é **aceito mesmo com
  conflito**. `conflicts` traz só o horário dos compromissos **não terminais** do profissional que ele
  enxerga — **sem paciente, título nem id**; a tela já tem a agenda carregada e destaca pelo horário.
  A sessão sigilosa de outra área atribuída a ele **não** aparece. Bloqueio de outra pessoa e
  bloqueio inexistente dão o mesmo `block_not_found`.
- **Bloqueio sobre compromisso existente não cancela nada.** O compromisso continua `scheduled` e
  continua notificando o paciente. Remarcar ou cancelar é decisão de quem opera a agenda.
- **Corrida conhecida:** a checagem é na função, não `EXCLUDE` (são duas tabelas). Um bloqueio
  gravado no mesmo instante de um agendamento pode passar — e aparece como conflito para quem
  bloqueou.

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
| `chat_message` | cada mensagem de **profissional**, e desde 30/09/2026 a **mensagem automática do encaminhamento** | titular + acompanhante¹ | `conversations` |
| `chat_assigned` | conversa encaminhada a alguém — desde 30/09/2026 | quem recebe | `conversations` |
| `chat_forward_resolved` | conversa encaminhada foi resolvida — desde 30/09/2026 | quem estava com ela quando a encaminhou (5.6) | `conversations` |
| `content_published` | **primeira** aprovação de uma orientação | quem pode lê-la (CID) + acompanhante | `content_items` |
| `critical_alert` / `alert_assigned` | alerta disparado / designado | equipe com `alerts.triage` / o designado | `alerts` |
| `report_ready` | relatório agendado venceu (5.22) | o administrador destinatário | `report_runs` |

¹ **Exceto** quando o alvo é restrito (sessão ou conversa de psicologia): aí só o titular.
Desde 29/09/2026, também só o titular quando **a área do tipo está desligada** para o
acompanhante (tabela abaixo).

#### Notificação e áreas do acompanhante — **desde 29/09/2026**

Cada tipo diz a área que exige em `notification_types.caregiver_scope`:

| `caregiver_scope` | Tipos |
|---|---|
| `schedule` | `appointment_scheduled`, `appointment_changed`, `appointment_reminder_24h`, `appointment_reminder_2h` |
| `chat` | `chat_message` |
| `resources` | `content_published` (a orientação **marcada por CID** exige também `clinical_record`) |
| `null` | os demais: sem recorte |

- A área é conferida **em três pontos**: quando a notificação nasce, quando o push sai (lembrete
  criado antes de o titular desligar a agenda sai `skipped`) e **na leitura da caixa**. Com a área
  desligada, `.from('notifications')` não devolve as daquela área, o Realtime não entrega, e
  `update({ read_at })` não as alcança. Religar devolve.
- Tipo da equipe **nunca** tem área (constraint), e a coluna não é editável pelo painel: o
  `update_vocabulary_term` muda só rótulo e ordem.
- O titular, a equipe e a administração não são afetados.

- Mensagem do paciente e do acompanhante **não** notificam. A do sistema, só a do encaminhamento
  (desde 30/09/2026); a resposta automática fora do horário, não.
  Realizado e falta também não — só o cancelamento muda o que o paciente tem de fazer.
- Compromisso marcado com **menos de 24 h** de antecedência não recebe o lembrete de 24 h (o
  "novo compromisso" acabou de sair); o mesmo vale para o de 2 h. O lembrete **expira no
  início do compromisso**: atrasado pela janela de silêncio, ele não sai depois da consulta.
- Corrigir uma orientação já publicada **não** avisa de novo.
- `chat_assigned` ganhou produtor em 30/09/2026 (`transfer_conversation`), e `chat_forward_resolved`
  nasceu no mesmo dia (`resolve_conversation`). Os dois são da equipe (`audience = 'team'`).
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
`read_alert_gemed_status` (o indicador *"já foi registrado no Gemed"*, **em lote**). **Relatório
da fila:** `summarize_alerts` (seção 3, desde 30/09/2026) — números por coorte, sem paciente.

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
  sozinha**, no instante em que o paciente ativa o app (`accept_patient_invitation` ou, desde
  29/09/2026, `link_patient_by_verified_phone`). O app
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
| `link_patient_by_verified_phone(cpf, nascimento)` | **a conta do paciente**, com celular confirmado | liga ficha e conta **sem o token**. Devolve `jsonb`, nunca levanta erro de dado. **Caminho principal desde 29/09/2026** — ver abaixo |
| `accept_patient_invitation(token, cpf, nascimento)` | **a conta do paciente** | liga ficha e conta pelo convite. Devolve o `patient_id`. **Reserva** desde 29/09/2026 |
| Edge Function `send-patient-invite` `{ patient_id }` | administrador | **envia o convite por SMS** ao celular da ficha. Devolve `{ invitation_id, phone_masked, expires_at }`, **nunca** o token. Desde 25/09/2026 |
| `unlink_patient_account(id)` | administrador | desfaz o vínculo |

> [!note] Convite por SMS (`send-patient-invite`)
> O destino é **sempre o celular da ficha**; para outro número, corrija a ficha com `update_patient`
> antes. Erros: `forbidden`, `patient_not_found`, `patient_already_linked`, `patient_inactive`,
> `underage` (ficha de menor de 18 anos, desde 06/10/2026), `invalid_phone` (fixo ou incompleto)
> e `sms_failed`. Em `sms_failed` o convite emitido é
> **cancelado**: caia para o "mostrar uma vez" com `invite_patient`. Sem conta do Twilio configurada,
> a função responde `sms_failed` sem emitir nada.

**O CPF pode ir mascarado.** `529.982.247-25` e `52998224725` são a mesma coisa: a RPC normaliza.

**Endereço (`p_address`) — formato fixo desde 30/09/2026.** Objeto com até sete chaves, todas
**texto** e todas **opcionais**, alinhadas ao `endereco` do Gemed:

```ts
p_address: {
  cep: '89801-000', logradouro: 'Av. Getúlio Vargas', numero: 'S/N',
  complemento: 'Sala 2', bairro: 'Centro', cidade: 'Chapecó', uf: 'SC',
}
```

- Chave fora da lista, valor que não é texto (`numero: 120`) e `uf` fora de duas letras
  maiúsculas são recusados com `23514` (`check_violation`). `numero` é texto de propósito:
  `S/N`, `120-A`.
- O banco **não** valida o CEP nem a lista de UFs. Máscara e seleção são da tela.
- Em `update_patient`, o endereço vai **inteiro**: o objeto enviado substitui o anterior.
  - `p_address` omitido ou `null` → não mexe;
  - `{}` → **limpa** o endereço (antes não havia como);
  - chave com `null` (`{ complemento: null }`) → a chave é removida.

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
> Três recusas escapam da regra, porque não vazam nada: `account_has_other_profile`
> (a conta já é admin, profissional ou cuidador — essa conta não ativa o app),
> `account_already_linked` (a conta já é de outro paciente) e, desde 06/10/2026, `underage`
> (a ficha é de menor de 18 anos), que só sai **depois** de token, CPF e nascimento conferirem.

#### Ligação pelo celular confirmado — **desde 29/09/2026**

O paciente não precisa mais do código de 64 caracteres. O fluxo no app:

1. **Cria a conta** por e-mail e senha, Google ou Apple (conta sem e-mail é recusada — seção 2).
2. **Confirma o celular** pelo Auth: `updateUser({ phone })` e depois `verifyOtp({ phone, token,
   type: 'phone_change' })` com o código do SMS. O Auth grava `phone_confirmed_at`.
3. **Informa CPF e data de nascimento** e chama a RPC.

A ficha só liga se o **celular confirmado for o mesmo da ficha**. A comparação ignora máscara e
prefixo: `(49) 99999-0000` na ficha e `+5549999990000` na conta batem. Número fixo, estrangeiro ou
ficha sem celular **nunca** ligam por aqui. Esses casos usam o convite.

```ts
// depois de updateUser({ phone }) + verifyOtp({ ..., type: 'phone_change' })
const { data, error } = await supabase.rpc('link_patient_by_verified_phone', {
  p_cpf: cpf,               // com ou sem máscara
  p_birth_date: nascimento, // 'AAAA-MM-DD'
})

if (error) {
  // só falta de sessão (forbidden) ou erro de rede chegam aqui
} else if (data.linked) {
  // data.patient_id — a ficha agora é desta conta
} else {
  switch (data.error) { /* tabela abaixo */ }
}
```

> [!IMPORTANT]
> **Esta RPC é a exceção do guia: a recusa vem no `data`, não no `error`.** O `error` fica `null`
> e o `data` traz `{ "linked": false, "error": "<código>" }`. O motivo é o limite de tentativas: se
> a recusa fosse exceção, o banco desfaria o registro da tentativa junto, e o contador nunca
> subiria. Quem testa só `if (error)` vai tratar recusa como sucesso.

| `data.error` | O que significa | Conta tentativa? | O que a tela faz |
|---|---|---|---|
| `phone_not_verified` | A conta não tem celular confirmado no Auth, ou o número mudou sem nova confirmação | não | Voltar ao passo 2 |
| `phone_contested` | No instante em que o celular foi confirmado, **outra conta** também tinha pedido esse número, e o código pode ter sido o dela. Desde 29/09/2026 (Fase D) | não | "Não foi possível confirmar este número", e conduzir ao **convite por SMS** |
| `invalid_invitation` | CPF, nascimento ou celular não conferem; ou a ficha está inativa ou já tem conta. **Indistinguíveis de propósito** — mesma regra do convite | **sim** | "Não conseguimos confirmar seus dados", e oferecer o convite ou falar com a clínica |
| `too_many_attempts` | **5** `invalid_invitation` na última hora, desta conta. Vale mesmo com os dados certos | não | "Muitas tentativas. Tente de novo em uma hora" |
| `underage` | CPF, nascimento e celular **conferem**, e a ficha é de quem ainda não tem 18 anos. Desde 06/10/2026 (Fase L) | não | "Para usar o app é preciso ter 18 anos ou mais. Fale com a clínica" |
| `account_already_linked` | A conta já tem ficha | não | Seguir para a home |
| `account_has_other_profile` | A conta é admin, profissional ou acompanhante | não | Essa conta não ativa o app |

O que acontece junto com a ligação, sem nada no cliente: o **convite pendente** da ficha passa a
`cancelled` (sai da fila de reenvio do painel), a ligação entra na **trilha de auditoria** com a
pessoa como autora, e a **pesquisa NPS do primeiro acesso** abre (5.10), como no convite.

O banco guarda de cada tentativa errada **só a conta e o instante**, nunca o CPF, a data ou o
telefone digitados, e apaga as tentativas com mais de um dia.

**O pedido de troca de celular vence em 15 minutos** (a validade do código, 10 min, mais 5 de
margem). Uma rotina a cada 5 minutos apaga o pedido não confirmado; quem volta depois disso
chama `updateUser({ phone })` de novo. Desde 29/09/2026 (Fase D).

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
| `birth_date_in_future` | nascimento **depois de hoje** (`23514`), em `create_patient` ou `update_patient`. Desde 06/10/2026 | validação de formulário |
| `underage` | `invite_patient` ou o SMS para ficha de menor de 18 anos (`23514`). Nenhum convite é emitido. Desde 06/10/2026 | "Paciente menor de 18 anos não usa o app" |

#### Idade mínima para o app — **desde 06/10/2026 (Fase L), provisória**

- **A regra:** a conta do app só se liga à ficha de quem tem **18 anos completos**. É provisória até
  a CEON confirmar (ADR-020 §9). A ficha de menor de idade **existe e se cadastra** normalmente: a
  clínica atende menores. O que ela não faz é se ligar ao app.
- **"Hoje" é o da clínica**, no fuso de `clinic_settings.time_zone`, e não o do servidor (UTC). Quem
  faz 18 anos hoje já passa. Quem nasceu em **29/02** passa em **01/03** nos anos não bissextos.
- **Onde a recusa aparece:** na ligação pelo celular (`data.error = 'underage'`), no aceite do
  convite (exceção `underage`, `42501`), e no painel, ao convidar (`invite_patient` e SMS, `23514`).
  No app, só **depois** que todos os dados conferem: com dado errado, a resposta é
  `invalid_invitation`, como sempre.
- **Data no futuro:** recusada por gatilho em `patients`, também para o Gemed (que escreve sem
  passar pelas RPCs). Ficha antiga com data no futuro **continua editável**: o gatilho só recusa
  quando a data muda.
- **O que não acontece:** a ligação já feita não se desfaz sozinha. Se a data for corrigida depois e o
  paciente ficar com menos de 18 anos, a conta continua ligada; desligar é `unlink_patient_account`,
  decisão do administrador.

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
- **Conta de paciente ou de acompanhante não vira equipe — desde 30/09/2026.** `create_professional`
  e `create_admin` recusam com `account_is_patient` ou `account_is_caregiver` (`23514`). Antes
  aceitavam, e a conta do app passaria a ler o prontuário dos outros. Para avisar **antes** de
  tentar, o painel pergunta `is_patient_account(p_account_id)` (só administrador; devolve só
  `true`/`false`, e `false` para conta inexistente). A equipe usa conta própria, com e-mail
  corporativo. Para **abrir a ficha** a partir da conta, use `read_patient_id_by_account`
  (desde 02/10/2026; só administrador em `aal2`, com trilha).
- **Registro de conselho é obrigatório** (`council_registration_required`), e o formato **não** é
  validado: CRM, COREN e CREFITO têm formatos diferentes e uma regex rejeitaria cadastro legítimo.
- **Ao menos uma especialidade** (`specialty_required`). Sem área o perfil nasce inerte: a pessoa
  entra e não consegue registrar nada.
- **Ninguém cria nem edita o próprio perfil profissional** (`cannot_manage_own_professional_profile`).
  Um administrador que se concedesse `psychology` leria o que nem a administração pode ver. A
  clínica **pode** ter quem acumule os dois papéis: outro administrador faz a concessão.
- **Tirar uma especialidade encerra a vigência, não apaga a linha.** O histórico de quem podia ler
  o quê, e em que data, é o que uma auditoria pergunta.
- **O nome que o paciente vê — `display_name`, desde 02/10/2026.** Vem de `accounts.full_name` e é
  mantido pelo banco: no cadastro, e sempre que o nome da conta muda. **Para trocar, troque o nome da
  conta** (o próprio profissional, por `.from('accounts').update({ full_name })`); escrever
  `display_name` não tem efeito — o banco sobrescreve com o nome da conta. Qualquer conta logada lê
  `display_name`, como já lia especialidade e registro no conselho (ADR-014, emenda de 02/10/2026).

#### Cadastro de pessoa nova, por convite — **desde 30/09/2026**

Edge Function **`create-staff-account`**, com o JWT do administrador em **sessão `aal2`**.

```ts
// Profissional
await supabase.functions.invoke('create-staff-account', { body: {
  email: 'enfermeira@ceon.com.br', full_name: 'Maria Silva', role: 'professional',
  council_registration: 'COREN-SC 123456',
  specialty_ids: [nursingId], primary_specialty_id: nursingId,   // primária opcional
}})
// → 201 { account_id, role: 'professional', profile_id, pending: true }

// Administrador
await supabase.functions.invoke('create-staff-account', { body: {
  email: 'gestora@ceon.com.br', full_name: 'Ana Souza', role: 'admin',
}})

// Reenviar o convite de quem ainda não confirmou
await supabase.functions.invoke('create-staff-account', { body: { resend: true, account_id } })
// → 200 { account_id, resent: true }

// "Convites pendentes" (RPC, só administrador)
const { data } = await supabase.rpc('list_pending_staff_invitations')
// → [{ account_id, full_name, email, role, profile_id, invited_at, account_is_active }]
```

O que acontece, na ordem: o banco confere o administrador, a sessão `aal2`, o formato do e-mail e
que ele está livre (`prepare_staff_account`); a conta nasce no Auth **sem e-mail**; o papel nasce
**pendente**, validando conselho e especialidades; **só então** sai o convite. Se o cadastro for
recusado (conselho em branco, especialidade inválida), a conta é desfeita e **nenhum e-mail sai**.

- **O papel pendente não vale nada.** `is_active = false`, `pending_confirmation = true`: nenhum
  helper, nenhuma política e nenhuma RPC o reconhece. Ele vira ativo **sozinho** quando a pessoa
  abre o link do e-mail (a confirmação), e a trilha registra essa ativação como ato do sistema,
  separada do convite (que tem o administrador como autor).
- **A pessoa define a própria senha.** O link leva à *Site URL* do Auth (ou a
  `STAFF_INVITE_REDIRECT_URL`), com sessão no fragmento da URL; a tela chama
  `supabase.auth.updateUser({ password })`. Não há senha provisória nem link mostrado na tela.
- **Na lista de profissionais**, `pending_confirmation` separa "convite pendente" de "desativado".
- **`set_professional_active` recusa papel pendente** (`staff_invitation_pending`), nas duas
  direções: ativar antes da confirmação é o que a regra impede, e "desativar" seria desfeito pela
  confirmação. **Para desistir do convite, desative a conta** (`set_account_active(account_id,
  false)`): mesmo que a pessoa confirme depois, a conta desativada não entra. Na lista de
  pendentes, o convite desistido vem com `account_is_active = false`.
- **`invite_failed` (`502`) vem com `account_id`**: conta e papel existem, só o e-mail não saiu
  (limite de envio do Auth, SMTP fora). Use o reenvio.
- **E-mail já usado** por qualquer conta: `email_in_use`. De paciente ou de acompanhante:
  `account_is_patient`/`account_is_caregiver` (a equipe usa e-mail próprio).
- **O limite de e-mails por hora do Auth vale para convites.** Cadastro em lote esbarra nele.

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
                                    // primary_cid10_code | treatment_phase | is_active |
                                    // last_interaction_at (desde 30/09/2026)
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
- **Última interação** (desde 30/09/2026): `last_interaction_at`, **depois** de `created_at`, é a
  **última mensagem do paciente ou do acompanhante** no chat. Resposta da equipe e mensagem
  automática não contam. **Não é "último acesso ao app"**: o app não registra abertura, e
  `last_sign_in_at` do Auth mostraria o último login, que com biometria pode ter meses. Renomeie a
  coluna da tela para **"Última interação"**. Nulo = nunca escreveu.
  - **O sigilo vale na data.** A mensagem numa conversa restrita da Psicologia só entra para quem
    enxerga a conversa: a psicóloga pode ver uma data mais recente que a enfermeira para o mesmo
    paciente. Não é inconsistência; não "corrija" no cliente.
  - Ordenar por ela: `p_order_by: 'last_interaction_at', p_order_desc: true` (mais recente
    primeiro). Quem nunca escreveu vai para o fim nos dois sentidos.
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

#### Redefinir o segundo fator de outra pessoa — **desde 30/09/2026**

Quem perdeu o celular do autenticador pede a **outro administrador**. Edge Function
**`reset-mfa-factor`**, com o JWT do administrador em **sessão `aal2`**:

```ts
const { data } = await supabase.functions.invoke('reset-mfa-factor', { body: { account_id } })
// → 200 { account_id, factors_removed, sessions_ended }
```

- **Alvo:** só conta de equipe (profissional ou administrador, ativo ou não). Paciente ou conta
  inexistente: `staff_account_not_found`. **A própria conta é recusada**
  (`cannot_reset_own_factor`): o seu autenticador você troca pelo próprio perfil, com sessão
  `aal2`, ou pede a outra pessoa.
- **O que acontece:** todos os fatores da pessoa saem, **todas as sessões dela caem** (inclusive
  as `aal2` que já passaram pelo fator perdido) e a trilha registra `delete` em `mfa_factors`,
  com o alvo e quem fez. O token de acesso já emitido vale até expirar (tempo do JWT do projeto);
  a renovação não passa mais.
- **Consequência para administrador:** com `require_admin_mfa` ligado, quem teve o fator
  redefinido perde o acesso administrativo até cadastrar outro. É o desenho. A tela deve dizer
  isso antes de confirmar.
- **`reset_failed` (`502`):** repetir termina o trabalho. A chamada repetida devolve
  `factors_removed: 0` e `sessions_ended: 0`, e grava outra linha na trilha.

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
// app — o titular abre o pedido, com o texto do formulário (opcional)
const { data: id } = await supabase.rpc('request_data_subject_action', {
  p_request_type: 'rectification',
  p_requester_note: 'Dados a corrigir: Celular. Meu celular mudou.',
})
// app — o titular lê os próprios pedidos direto
const { data } = await supabase.from('data_subject_requests')
  .select('id, request_type, status, requester_note, decision_note, created_at, decided_at, executed_at')
  .order('created_at', { ascending: false })
```

**O texto do titular — `requester_note`** (desde 02/10/2026). O que o titular escreveu ao abrir o
pedido: no app, o formulário de correção ("quais dados, e o que deveria constar").

- **Opcional**, para qualquer tipo de pedido. Sem o parâmetro, a coluna fica `null`.
- **Até 1000 caracteres**, contados depois de tirar das pontas espaço, tab e quebra de linha. Texto
  só de brancos vira `null`. Acima do limite: `requester_note_too_long` (`22023`).
- **Imutável.** Ninguém reescreve o texto, nem `service_role`: `data_subject_request_immutable`
  (`42501`). A única escrita aceita é **apagar** (→ `null`), reservada à eliminação futura (ADR-005).
- Quem lê o pedido lê o texto: o titular e o administrador. **Fica fora da trilha**: a linha do
  `audit_log` só referencia o pedido pelo id. Entra no pacote do titular (`export_my_data`).

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
  titular) e as seções da conta (`consents`, `notifications`, `caregiver_links`…). Desde
  29/09/2026, `patient.caregiver_scopes` traz as áreas que o titular ligou ou desligou.
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
| `requester_note_too_long` (`22023`) | `p_requester_note` com mais de 1000 caracteres depois de aparado |
| `data_subject_request_immutable` (`42501`) | reescrever titular, tipo, data de entrada ou o texto do pedido |

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
- **Código reservado:** `treatment_closure` (tipo de compromisso) é contrato com o app (5.7). O
  rótulo se corrige; o tipo não se aposenta.
- **Aposentados:** o administrador continua lendo os inativos de tipos de compromisso, assuntos,
  tipos de notificação e motivos de falta, para poder reativar. Os demais perfis veem só os ativos.
- **Tipo de notificação não se cria**, porque só o banco produz notificação. Rótulo e ordem se
  corrigem, e os silenciáveis se aposentam (**aposentar para de gerar aquele tipo para todos**).
  `critical_alert` e `alert_assigned` **não se desligam**: devolve `23001`.
- **Assunto novo nasce sem roteamento.** Desde 30/09/2026 o administrador o liga a uma área com
  `set_conversation_subject_specialty` (5.6); Psicologia é recusada. Categoria nova exige especialidade.
- **Trocar a especialidade de uma categoria** ou a marca psicológica de um sintoma não existe:
  aposente e crie outro.
- Motivos de falta seguem com as RPCs próprias (5.16).
- **Acentos da carga inicial — corrigidos em 30/09/2026.** Sintomas (*Náusea*, *Vômito*,
  *Constipação*, *Alterações na boca*, *Alterações na pele*), sete rótulos de CID-10 (*cólon*,
  *brônquios e pulmão*, *próstata*, *estômago*, *pâncreas*, *ovário*, *glândula tireoide*) e as
  duas fases aposentadas (*Em remissão*, *Em finalização*). Só mudou o rótulo que ainda era o da
  carga: o sintoma que o administrador já tinha corrigido pela tela ficou como ele deixou. **CID-10
  continua sem edição pelo painel**: é referência espelhada do Gemed.

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
| `content_items` | INSERT, UPDATE (`category_id`) | autor: profissional na própria área; **administrador em qualquer categoria** (desde 30/09/2026) |
| `content_versions` | INSERT, UPDATE (conteúdo + `status`) | autor, em **`draft`** (`returned` não existe mais) |
| `content_cid10`, `content_attachments` | ALL | autor (profissional ou administrador) |
| `patient_content_states` | ALL | só o titular |
| `professional_blocks` | ALL | só o dono — prefira `save_professional_block`, que avisa dos conflitos (desde 30/09/2026) |
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

No bucket editorial (`content-attachments`), o autor do rascunho — profissional ou, desde
30/09/2026, administrador — continua podendo subir, trocar e remover arquivo — ali é material em edição, não mensagem enviada. A ordem é a mesma: apaga o
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

O canal respeita a mesma RLS da leitura, evento por evento: com uma área desligada, o
acompanhante não recebe pelo Realtime a notificação daquela área, nem mensagem ou conversa do chat
desligado (5.2, 5.8).

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
| `42501` `mfa_required` em `read_patient_id_by_account` | Administrador em sessão `aal1` — vale mesmo com `require_admin_mfa` desligado (desde 02/10/2026) | Levar à verificação do TOTP e repetir |
| `22004` `account_required` | `read_patient_id_by_account` chamada com `p_account_id` nulo | Passar o id da conta |
| `42501` `directed_send_not_allowed` | `send_directed_content` de especialidade que não envia — hoje nenhuma; **provisório** (ADR-032) | Esconder o botão de envio |
| `22023` `content_not_published` | `send_directed_content` com orientação sem versão publicada | Enviar só da biblioteca publicada |
| `P0002` `directed_send_not_found` | `mark_directed_content_opened` com envio que não é do titular da sessão (inclusive do acompanhante) | Só o titular marca |
| `P0002` `appointment_not_found` | `reschedule_appointment`/`set_appointment_status` com id que não existe — desde 30/09/2026 (antes, `set_appointment_status` dava sucesso) — ou que quem chama não vê, desde 01/10/2026 (**provisório**, D6) | Recarregar a agenda |
| `42501` `origin_specialty_not_allowed` | `schedule_appointment` com especialidade sigilosa (Psicologia) que não é de quem agenda — desde 30/09/2026 | Só a própria especialidade marca a sessão sigilosa |
| `P0002` `conversation_not_found` | `return_conversation_to_queue` em conversa restrita, resolvida, já na fila ou inexistente — igual para todas, de propósito | Recarregar a lista; não tente distinguir |
| `23514` `account_is_patient` / `account_is_caregiver` | `create_professional`/`create_admin` com conta do app — desde 30/09/2026 | A equipe usa conta própria; `is_patient_account` avisa antes |
| `23514` (`check_violation`) em `create_patient`/`update_patient` | Endereço fora do formato: chave desconhecida, valor não texto ou `uf` inválida — desde 30/09/2026 | Seção 5.12 |
| `409` numa `read_*` | **Não acontece mais desde 30/09/2026**: paciente inexistente devolve vazio | Tratar vazio como "ficha não encontrada" (seção 3) |
| `403` `email_required` (Auth) | `signInWithOtp({ phone })` ou `signUp({ phone })` para número sem conta — desde 29/09/2026 | Conta nasce por e-mail, Google ou Apple; o SMS só confirma o celular depois (seção 2) |
| `{ linked: false, error: … }` com `error` nulo | `link_patient_by_verified_phone` devolve a recusa no `data` — desde 29/09/2026 | Ler `data.error` (seção 5.12) |
| `[]` no app do acompanhante, dados existem | A área está desligada pelo titular — desde 29/09/2026 | Conferir `get_my_ward_scopes` (seção 5.2) |
| Notificação some da caixa do acompanhante, ou não chega | A área do tipo foi desligada pelo titular — desde 29/09/2026 | Tabela tipo × área na seção 5.8 |
| `invalid_scope` / `22P02` em `set_caregiver_scope` | Área nula ou fora das cinco | Seção 5.2 |
| `422` `invalid_scope` em `create-caregiver` | `scopes` com área fora das cinco, item nulo ou que não é lista — desde 29/09/2026 | Seção 5.2; nenhuma conta foi criada |
| `403` `mfa_required` em `create-staff-account` ou `reset-mfa-factor` | Sessão do administrador sem segundo fator verificado (`aal1`) — desde 30/09/2026, vale mesmo com `require_admin_mfa` desligado | Levar à verificação do TOTP e repetir |
| `409` `email_in_use` / `account_is_patient` / `account_is_caregiver` em `create-staff-account` | O e-mail já tem conta — de paciente e de acompanhante com o motivo | A equipe usa e-mail próprio |
| `422` `invalid_email` / `invalid_name` / `invalid_role` / `council_registration_required` / `specialty_required` / `unknown_specialty` / `primary_specialty_not_in_list` em `create-staff-account` | Cadastro recusado | Corrigir o formulário; **nenhuma conta nem e-mail** ficou para trás |
| `502` `invite_failed` (com `account_id`) | Conta e papel criados, o e-mail não saiu | Reenviar com `{ resend: true, account_id }` (5.13) |
| `404` `staff_invitation_not_found` | Reenvio para conta que já confirmou, sem papel pendente, desativada ou inexistente — igual para todas | Recarregar a lista de pendentes |
| `55000` `staff_invitation_pending` | `set_professional_active` sobre papel que espera a confirmação do e-mail | Esperar a confirmação; para desistir, `set_account_active(account_id, false)` |
| `403` `cannot_reset_own_factor` / `404` `staff_account_not_found` em `reset-mfa-factor` | Alvo é a própria conta, ou não é de equipe | 5.18 |
| `502` `reset_failed` em `reset-mfa-factor` | A Admin API ou o registro falhou no meio | Repetir: a segunda chamada termina o trabalho |
| `42501` `self_approval_not_allowed` | `review_content_version(…, 'approve')` sobre versão que a própria conta criou — desde 30/09/2026, **provisório** | Outro administrador aprova; esconder o botão (5.5) |
| `23514` em `content_items`/`content_versions` | As duas autorias preenchidas, ou nenhuma — desde 30/09/2026 | Profissional manda só `author_professional_id`; administrador, só `author_admin_id` (5.5) |
| `23514` `confidential_specialty_not_routable` | `set_conversation_subject_specialty` com especialidade sigilosa — desde 30/09/2026 | Não oferecer Psicologia no seletor (5.6) |
| `P0002` `subject_not_found` / `23503` `unknown_specialty` | Roteamento com assunto inexistente, ou especialidade inexistente ou inativa | Recarregar os vocabulários |
| `42501` `conversa inexistente, resolvida, ja assumida ou de outra area` | `claim_conversation` em conversa com responsável, resolvida ou roteada a outra área — texto desde 30/09/2026 | Esconder "Assumir" fora da área; tomar de colega é encaminhar (5.6) |
| `22023` `invalid_label` / `invalid_body`, `P0002` `quick_reply_not_found` | Resposta rápida com rótulo ou texto fora do tamanho, ou id inexistente — desde 30/09/2026 | 5.6 |
| `42501` `professional_profile_required` | `summarize_my_portfolio` chamada por administrador, paciente, acompanhante ou conta desativada — desde 30/09/2026 | A carteira é do profissional ativo; não mostrar a tela para os demais (seção 3) |
| `22023` em `summarize_alerts` com `p_granularity: 'hour'` | Não há recorte por hora, por decisão | `day`, `week` ou `month` |
| `409` / `23P01` `slot_blocked` | `schedule_appointment`/`reschedule_appointment` em horário bloqueado pelo profissional — desde 30/09/2026 | "Profissional indisponível neste horário", sem motivo; pintar `read_professional_busy_intervals` no seletor (5.7) |
| `22023` `requester_note_too_long` | `request_data_subject_action` com texto acima de 1000 caracteres depois de aparado — desde 02/10/2026 | Limitar o campo do formulário a 1000 (5.19) |
| `42501` `data_subject_request_immutable` em `requester_note` | Reescrever o texto de um pedido — desde 02/10/2026 | Correção do texto é outro pedido (5.19) |
| `22023` `window_too_large` / `janela invalida` | `read_professional_busy_intervals` com janela acima de 62 dias, nula ou sem duração | Pedir a semana ou o mês visível |
| `42501` `forbidden` em `read_professional_busy_intervals` | Profissional sem `schedule.manage`, paciente ou acompanhante | O profissional lê os próprios bloqueios por `.from('professional_blocks')` |
| `P0002` `block_not_found` / `22023` `invalid_period` / `42501` `professional_profile_required` | `save_professional_block` com bloqueio alheio ou inexistente, fim antes do início, ou chamada por quem não é profissional ativo | Recarregar os bloqueios; validar o intervalo no formulário (5.7) |

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
| **Comparativo entre profissionais individuais** | O recorte das `summarize_*` é **por especialidade**. Desde 30/09/2026 a pessoa vê a **própria** carteira ao lado da média dos colegas da área (`summarize_my_portfolio`, mínimo de 3 colegas); ver o número de outro profissional continua não existindo. |
| **Pacientes da carteira, distribuição por fase e "precisa de atenção"** | Esperam a CEON dizer quem é "paciente da minha carteira" (pergunta 3, enviada em 30/09/2026; a recomendação é *quem o profissional atendeu nos últimos 90 dias*). Não sobe antes da resposta, porque a definição muda o número da tela. Até lá, a carteira mostra só os indicadores de ação (seção 3). |
| **Último acesso ao app** | Não existe: a lista traz a **última interação** no chat (5.14). Registrar a abertura do app só entra se a clínica pedir. |
| **SMS e e-mail de notificação** | Os canais existem na fila de notificações e fecham como `skipped`. O Twilio acima serve às credenciais e convites, não à fila. Vale também para o aviso de **relatório agendado** (5.22): chega na caixa e no push, e o e-mail espera um provedor de e-mail transacional, que ainda não foi contratado. |
| **Exportação e mapa de calor** | O banco entrega o número; PDF, Excel e visualização são do front-end. O arquivo gerado deve ser **declarado** com `log_data_export` (5.19). O **agendamento** existe desde 25/09/2026 (5.22). |
| **Filtro por especialidade no resumo de sintomas** | Não existe e não vai existir: o diário não tem especialidade de origem (seção 3, item 8). |
| **Anonimização e eliminação do dado clínico** | A exclusão pedida pelo titular **encerra o acesso** (5.19). Eliminar o prontuário depende da janela de retenção, que é decisão legal da clínica. |
| **Roteamento automático de conversa** | **Existe desde 30/09/2026** (5.6) e o mapa **nasce vazio, por decisão**: a navegadora atende tudo (CEON, 31/08). Ligar um assunto a uma área é do administrador, pelo painel. |
| **Horário de atendimento por profissional** | Não entra: a CEON respondeu em 31/08 que o horário é o mesmo para toda a equipe (`clinic_business_hours`, 5.20). O campo sai do formulário de usuário. |
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
| **Orientação enviada a um paciente, e "abriu ou não"** | Não existe. A orientação vale para todo paciente elegível pelo CID. O envio dirigido espera a clínica confirmar o formato (item 12 do painel de 30/09/2026); o marcador de adesão da fisioterapia é nível COMPLETO. |

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
| `quick_replies` | **0** | Nenhuma resposta rápida: o seletor do chat fica vazio. Nasceu em 30/09/2026 | Administrador, pelas RPCs da 5.6 |

Povoados e confiáveis: `specialties` (7) · `symptoms` (12) · `appointment_types` (7) ·
`notification_types` (11, desde 30/09/2026) · `conversation_subjects` (4, **todos sem área**) · `permissions` (2) ·
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
| `create_auth_signup_hook` | Hook *Before User Created*: o Auth recusa conta sem e-mail (`403 email_required`) — fecha o cadastro por telefone |
| `create_patient_link_attempts` | O contador de tentativas da ligação pelo celular: só conta e instante, em `private`, apagado depois de um dia |
| `create_link_patient_by_verified_phone` | **`link_patient_by_verified_phone`**: celular confirmado + CPF + nascimento ligam a conta à ficha, sem o token; recusa no `jsonb`, 5 erros por hora |
| `create_caregiver_scopes` | **Áreas do acompanhante**: enum `caregiver_scope`, `patient_caregiver_scopes`, as cinco nascem ligadas em todo vínculo (trigger + backfill) |
| `create_caregiver_scope_helpers` | `my_ward_patient_ids_for(área)`: o recorte das políticas; linha ausente nega |
| `apply_caregiver_scopes_to_reads` | As políticas e funções do acompanhante passam a respeitar a área; orientação por CID exige `clinical_record` |
| `create_caregiver_scope_rpcs` | `get_caregiver_scopes`, `set_caregiver_scope`, `get_my_ward_scopes`; `export_my_data` leva as áreas |
| `apply_caregiver_scopes_to_notifications` + `validate_…` | **As notificações respeitam as áreas**: `notification_types.caregiver_scope`, e a área conferida na criação, no envio e na caixa |
| `add_scopes_to_link_caregiver_account` | **Áreas escolhidas na criação**: `link_caregiver_account` ganha `p_scopes` (uma assinatura só, sem sobrecarga); a Edge Function `create-caregiver` aceita `scopes` |
| `create_phone_confirmations` | `private.phone_confirmations` + dois triggers em `auth.users`: cada confirmação de celular fica registrada, e `contested` quando outra conta tinha o mesmo número pendente |
| `create_phone_change_purge` | `private.purge_abandoned_phone_changes()` + job `purge-abandoned-phone-changes` (a cada 5 min): pedido de troca não confirmado em 15 min some |
| `add_contested_check_to_link_patient` | `link_patient_by_verified_phone` exige o registro da confirmação (sem ele, `phone_not_verified`) e recusa a contestada com `phone_contested`, sem contar tentativa |
| `fix_conversation_specialty_lookup` | **Correção:** assumir e encaminhar conversa usam a especialidade **vigente**; encerrar uma especialidade desliga a primária. Era o 403 de quem trocou de área |
| `create_conversation_queue_return` | `return_conversation_to_queue`: o administrador devolve conversa assumida à fila geral, sem alcançar a restrita |
| `guard_appointment_writes` | `appointment_not_found` em remarcar e mudar estado (antes, id inexistente dava sucesso); agendar recusa especialidade sigilosa de outra pessoa |
| `record_attempted_patient_reads` | `audit_log.attempted_patient_id`: leitura de paciente inexistente devolve vazio e fica na trilha, em vez de `409` |
| `guard_staff_account_roles` | `create_professional`/`create_admin` recusam conta de paciente e de acompanhante; `is_patient_account` para o painel |
| `fix_seed_accents` | Acentos nos rótulos semeados de sintomas, CID-10 e fases; só onde o rótulo ainda era o da carga |
| `constrain_patient_address` | `patients.address` com sete chaves de texto (`cep` … `uf`), e `{}` limpa o endereço |
| `validate_phase_e_constraints` | `VALIDATE` das duas constraints da Fase E que nasceram `NOT VALID` |
| `create_staff_invitations` | **Cadastro da equipe por convite**: `pending_confirmation` em `professionals` e `admins`, o papel pendente sobre conta não confirmada, `trg_activate_pending_staff` em `auth.users`, `prepare_staff_account`, `list_pending_staff_invitations` e `prepare_staff_invitation_resend`; `set_professional_active` recusa o pendente |
| `create_mfa_factor_reset` | **Redefinição do segundo fator**: `authorize_mfa_factor_reset` e `record_mfa_factor_reset` (encerra as sessões do alvo e grava `delete` em `mfa_factors`), para a Edge Function `reset-mfa-factor` |
| `validate_phase_f_constraints` | `VALIDATE` das duas constraints de pendente-e-inativo |
| `allow_admin_content_authoring` | **O administrador escreve orientação**: `author_admin_id`/`created_by_admin_id` com uma autoria só por linha, `private.my_admin_id()`, `content_items_insert_admin` (qualquer categoria ativa) e a perna do administrador nas políticas de autor e do bucket |
| `forbid_self_review` | **Quem escreve não aprova** (provisório, D1b): `review_content_version` recusa `approve` da versão criada pela própria conta |
| `validate_phase_g_constraints` | `VALIDATE` das duas FKs e dos dois `CHECK` de autoria |
| `create_conversation_subject_routing` | **Roteamento por assunto**: `set_conversation_subject_specialty`, o gatilho que recusa área sigilosa como rota, e `claim_conversation` aceitando a conversa roteada sem responsável da área de quem assume |
| `create_quick_replies` | **Respostas rápidas**: `quick_replies` (configuração, sem paciente), leitura direta pela equipe, `create_quick_reply`, `update_quick_reply`, `set_quick_reply_active`, e a recusa do `DELETE` |
| `create_conversation_transfer_notices` | **Avisos do encaminhamento**: `release_reason` em `conversation_assignments`, o tipo `chat_forward_resolved`, `private.notify_professional`, os avisos em `transfer_conversation` e `resolve_conversation`, e a peneira do envio conferindo a visibilidade da conversa para a equipe |
| `validate_phase_h_constraints` | `VALIDATE` da constraint designação encerrada ⇔ com motivo |
| `create_alert_summary` | **`summarize_alerts`**: a fila de alertas por coorte de nascimento (nascidos, assumidos, resolvidos, abertos, tempos e conduta), e `idx_alerts_period` |
| `add_subject_to_chat_response_summary` | `summarize_chat_response_times` ganha `p_subject_id` e `p_group_by_subject`, e `subject_id`/`subject_label` no fim (uma assinatura só); o fuso passa a ser o da clínica; política de leitura de `conversation_subjects` para o leitor auditado |
| `create_professional_portfolio` | **`summarize_my_portfolio`**: a carteira da própria pessoa e a média dos colegas da área, sem quem consulta, só com 3 ou mais (D5); `private.active_specialty_peer_ids` |
| `add_last_interaction_to_patient_list` | `read_patient_list` traz `last_interaction_at` (última mensagem do paciente ou do acompanhante, sob o sigilo) e ordena por ela; índice parcial `idx_messages_last_patient_interaction` |
| `enforce_professional_blocks` | **Bloqueio impede agendar** (D7, ADR-014 §12): `schedule_appointment` e `reschedule_appointment` recusam com `slot_blocked`; `read_professional_busy_intervals` (intervalo sem rótulo, administrador e `schedule.manage`); `save_professional_block` (grava e devolve os conflitos); `private.is_slot_blocked` e `private.my_appointment_conflicts` |
| `restrict_confidential_appointment_writes` | **Só quem vê o compromisso o altera** (E.3b, **provisório**, D6): `private.can_write_appointment`, exigido por `reschedule_appointment` e `set_appointment_status`; o invisível responde `appointment_not_found` |
| `create_content_directed_sends` | **Envio dirigido** (G.2, ADR-032, regras provisórias): `content_directed_sends`, `send_directed_content`, `mark_directed_content_opened`, `read_content_directed_sends`, tipo `content_directed`, `directed_contents` em `export_my_data`; helpers `can_send_directed_content` e `directed_send_visible_to_staff` |
| `apply_directed_sends_to_visibility` | A orientação enviada abre no app (`is_content_visible_to_me`), e a notificação do envio passa pela regra de CID e pela peneira do push |
| `create_patient_id_by_account_lookup` | **`read_patient_id_by_account`**: o administrador em `aal2` vai da conta à ficha, com trilha (ADR-008, emenda de 02/10/2026) |
| `add_requester_note_to_data_subject_requests` | **O texto do titular no pedido** ([34]): `requester_note` (até 1000, imutável salvo apagamento), `request_data_subject_action(p_request_type, p_requester_note?)` (DROP + CREATE, uma assinatura só) e o guard estendido (ADR-025, emenda de 02/10/2026) |
| `add_display_name_to_professionals` | **O nome do profissional no compromisso** ([35]): `professionals.display_name`, mantido de `accounts.full_name` por dois gatilhos (`sync_professional_display_name`, `propagate_account_name_to_professional`) (ADR-014, emenda de 02/10/2026) |
| `add_treatment_closure_appointment_type` | **O tipo `treatment_closure`** ([37], Fase L): oitavo tipo de compromisso, *Encerramento de tratamento*. O código é contrato com o app (a tela do sino); rótulo, ordem e estilo são da clínica |
| `create_patient_birth_date_guard` | **A data de nascimento no futuro** ([36], Fase L): gatilho `trg_reject_future_birth_date` em `patients` (`birth_date_in_future`, também para o Gemed; no UPDATE, só quando a data muda), `private.clinic_today()` (o hoje no fuso da clínica) e `private.is_of_minimum_age` (18 anos, provisório) (ADR-020 §9) |
| `add_minimum_age_to_patient_activation` | **Idade mínima para o app** ([36], Fase L, provisória): `underage` em `link_patient_by_verified_phone` e `accept_patient_invitation`, **depois** da verificação, e em `invite_patient` e `issue_patient_sms_invite` (ADR-020 §9) |

Cada arquivo abre com o racional da decisão em comentário. **Quando algo parecer estranho, o
motivo está escrito lá em cima** — e quase sempre é uma regra de sigilo ou de auditoria que o
front-end não deve contornar.

---

> **Mudança de esquema é sempre pelo responsável pelo banco.** Coluna nova, tabela nova, RPC
> nova, política nova, índice novo, ou "só um `select` direto para destravar" — abra o pedido.
> Toda regra deste guia existe para proteger isolamento do paciente, sigilo entre especialidades
> e trilha de auditoria, que são obrigação contratual e legal. Contornar no cliente não resolve:
> transfere o risco para onde ele não pode ser verificado.
