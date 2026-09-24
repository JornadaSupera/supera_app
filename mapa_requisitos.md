# Jornada Supera — Mapa de Requisitos (MVP + MÉDIO)

> Aplicativo do Paciente — Centro de Oncologia de Santa Catarina

**Fonte de verdade:** Contrato Jornada Supera – Minuta Revisada (Anexo I)

# MVP

## 1. Onboarding & Acesso

### Telas
- Splash
- Onboarding (3 slides)
- LGPD
- Cadastro
- OTP por SMS
- Criar senha
- Login
- Recuperação de senha

### Funcionalidades
- Swipe entre slides
- Validação em tempo real
- Reenvio de SMS com contador
- Login por e-mail + senha
- Recuperação por SMS ou e-mail

---

## 2. Home / Dashboard

### Componentes
- Saudação personalizada
- Próximo compromisso
- Como você está hoje?
- Atalhos rápidos
- Notificações recentes
- Bottom Tab Navigation

### Funcionalidades
- Pull to refresh
- Próximo compromisso atualizado
- Acesso rápido ao Diário
- Indicador de mensagens

---

## 3. Diário de Sintomas

### Registro
- Texto livre
- 12 sintomas
- Intensidade de 0–5
- Salvar registro

### Histórico
- Timeline 30 dias
- Filtro por período
- Filtro por sintoma

### Sintomas
- Náusea
- Vômito
- Dor
- Fadiga
- Diarreia
- Constipação
- Febre
- Falta de apetite
- Alterações na boca
- Alterações na pele
- Ansiedade
- Tristeza

---

## 4. Agenda

### Lista
- Compromissos futuros
- Detalhes
- Histórico

### Tipos
- Consulta médica
- Infusão
- Retirada de medicação
- Avaliação multidisciplinar

### Lembretes
- 24 horas
- 2 horas

---

## 5. Orientações

### Cards
- Título
- Especialidade
- Tipo
- Tempo de leitura

### Conteúdo
- Texto
- Vídeo
- PDF

### Recursos
- Favoritar
- Não lidas
- Filtro por CID
- Filtro por especialidade

---

## 6. Chat

### Conversas
- Lista
- Prévia
- Horário
- Não lida

### Chat
- Texto
- Imagem
- Confirmação de leitura
- Histórico completo

---

## 7. Tela de Notificações

### COMPOSIÇÃO DA TELA

- Lista cronológica com mais recentes no topo
- Cada notificação mostra ícone por tipo, título, prévia e horário
- Indicador visual de notificações não lidas
- Filtros por tipo (agenda, chat, orientações, alertas)

### FUNCIONALIDADES

- Marcar uma notificação como lida por toque
- Marcar todas como lidas em um único botão
- Abertura do conteúdo relacionado ao tocar (ex.: "nova mensagem" abre o chat)
- Arquivar notificações antigas

---

## 8. Tela de Perfil

### COMPOSIÇÃO DA TELA

- Avatar do paciente (foto opcional)
- Bloco de dados pessoais (apenas leitura)
- Bloco de dados do tratamento (diagnóstico, estadiamento, protocolo ativo)
- Seção de configurações (notificações, idioma, modo escuro)
- Seção de privacidade (direitos LGPD) e link para ajuda e contato
- Botão de sair da conta

### FUNCIONALIDADES

- Atualização da foto de perfil
- Configuração detalhada de preferências de notificação (horários, canais, tipos)
- Solicitação de exportação dos próprios dados (direito LGPD)
- Solicitação de exclusão da conta
- Acesso direto ao suporte técnico


### Configurações
- Notificações
- Idioma
- Modo escuro
- LGPD
- Suporte
- Exportação
- Exclusão da conta

---

# MÉDIO (Acréscimos)

## Diário
- Gráfico evolutivo
- Seleção de métrica
- Banner de alerta
- Alerta automático para equipe

---

## Agenda

### Novas visualizações
- Lista
- Semanal
- Mensal

### Recursos
- Gestos
- Marcadores por tipo
- Legenda

---

## Chat

### Organização por assunto
- Medicação
- Agendamento
- Sintomas
- Outros

Direcionamento automático para o profissional correto.

---

## Segurança
- Face ID
- Touch ID
- Login Google
- Login Apple
- Biometria nas próximas sessões

---

## NPS
- Nota 0–10
- Comentário opcional
- Tela de agradecimento

Marcos:
- Início
- Meio
- Conclusão

---

## Acompanhante

### Fluxo
- Gerenciamento interno pelo paciente
- Um acompanhante por paciente
- Cadastro de nome, telefone e e-mail
- Geração automática de senha temporária
- Compartilhamento dos dados via WhatsApp
- Login próprio
- Troca obrigatória de senha no primeiro acesso
- Revogação imediata do acesso

### Pode acessar
- Agenda
- Lembretes
- Orientações
- Chat
- Diário

### Não pode
- LGPD
- Exportar conta
- Excluir conta
- Gerenciar vínculo
- Assinatura/Pagamentos
- Configurações do paciente
