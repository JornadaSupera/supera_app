// Única porta de entrada para dados do app — nenhuma página importa de
// src/mocks/ diretamente. Toda função aqui é `async` e simula latência de
// rede (`wait()`), pra já se comportar como uma chamada HTTP de verdade.
//
// Contrato de API: os nomes, parâmetros e formatos de retorno abaixo são a
// especificação de que o backend real vai precisar implementar. Quando ele
// existir, a ideia é substituir só o CORPO de cada função por uma chamada
// Axios (mesma assinatura, mesmo formato de retorno) — as telas que
// consomem essas funções não precisam mudar.

import patient from '../mocks/patient';
import appointments from '../mocks/appointments';
import diaryEntries, { SINTOMAS_DISPONIVEIS } from '../mocks/symptoms';
import notifications from '../mocks/notifications';
import conversations, { equipeCuidado } from '../mocks/messages';
import orientations from '../mocks/orientations';
import caregiverState, { PERMISSOES_PODE, PERMISSOES_NAO_PODE } from '../mocks/caregiver';
import respostasNps from '../mocks/nps';
import { unmask } from '../utils/masks';
import {
  addDays,
  formatDayLabel,
  formatRelativeTime,
  formatDiaryDateLabel,
  formatAgendaFutureLabel,
  formatFullDateWithWeekday,
  getWeekDays,
  getMonthGridDays,
  isSameDay,
} from '../utils/date';
import { temSinalDeAtencao } from '../utils/mood';
import { CATEGORIAS } from '../utils/agenda';
import { getTipoConteudoInfo } from '../utils/orientations';
import { getAssuntoInfo } from '../utils/chat';
import { getTipoNotificacaoInfo } from '../utils/notifications';

const DEFAULT_DELAY = 700;

function wait(ms = DEFAULT_DELAY) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Confere CPF + data de nascimento + celular contra o cadastro existente
 * no Centro (primeira etapa do fluxo de Cadastro).
 * @param {{cpf: string, nascimento: string, celular: string}} dados - `nascimento` no formato 'YYYY-MM-DD'.
 * @returns {Promise<{success: true, celular: string, nome: string}>}
 * @throws {Error} Se os dados não baterem com nenhum cadastro.
 */
export async function verificarIdentidade({ cpf, nascimento, celular }) {
  await wait();

  const cpfConfere = unmask(cpf) === unmask(patient.cpf);
  const nascimentoConfere = nascimento === patient.dataNascimento;
  const celularConfere = unmask(celular) === unmask(patient.celular);

  if (cpfConfere && nascimentoConfere && celularConfere) {
    return {
      success: true,
      celular: patient.celular,
      nome: patient.nome,
    };
  }

  throw new Error(
    'Não encontramos esse cadastro em nossa base. Confira os dados e tente novamente, ou fale com a recepção do Centro.'
  );
}

export const OTP_MOCK_CODE = '123456';

/**
 * Dispara o envio (real, via backend) do código de confirmação por SMS.
 * @param {string} celular
 * @returns {Promise<{success: true}>}
 */
// eslint-disable-next-line no-unused-vars
export async function enviarCodigoSms(celular) {
  await wait();
  return { success: true };
}

/**
 * Confere o código de 6 dígitos enviado por SMS.
 * @param {string} codigo
 * @returns {Promise<{success: true}>}
 * @throws {Error} Se o código estiver incorreto.
 */
export async function confirmarCodigoSms(codigo) {
  await wait();

  if (codigo === OTP_MOCK_CODE) {
    return { success: true };
  }

  throw new Error('Código incorreto. Verifique e tente novamente.');
}

/**
 * Define a senha final e conclui o fluxo de Cadastro.
 * @param {{senha: string}} dados
 * @returns {Promise<{success: true}>}
 */
export async function concluirCadastro({ senha }) {
  await wait();
  // Atualiza a senha "salva" do paciente mockado para a sessão atual, para
  // que o login logo em seguida funcione com a senha recém-criada.
  patient.senha = senha;
  return { success: true };
}

/**
 * Autentica o paciente por e-mail + senha.
 * @param {{email: string, senha: string}} credenciais
 * @returns {Promise<{success: true, nome: string}>}
 * @throws {Error} Se e-mail ou senha não conferirem.
 */
export async function login({ email, senha }) {
  await wait();

  const emailConfere = String(email).trim().toLowerCase() === patient.email.toLowerCase();
  const senhaConfere = senha === patient.senha;

  if (emailConfere && senhaConfere) {
    return { success: true, nome: patient.nome };
  }

  throw new Error('E-mail ou senha incorretos.');
}

/**
 * Inicia a recuperação de senha por e-mail ou celular. Por segurança, nunca
 * revela se o identificador existe ou não na base — a resposta é sempre de
 * sucesso, exista o cadastro ou não.
 * @param {{identificador: string}} dados
 * @returns {Promise<{success: true}>}
 */
// eslint-disable-next-line no-unused-vars
export async function solicitarRecuperacaoSenha({ identificador }) {
  await wait();
  return { success: true };
}

/**
 * Define a nova senha ao final do fluxo de recuperação.
 * @param {{senha: string}} dados
 * @returns {Promise<{success: true}>}
 * @throws {Error} Se a senha tiver menos de 8 caracteres.
 */
export async function redefinirSenha({ senha }) {
  await wait();

  if (!senha || senha.length < 8) {
    throw new Error('A senha precisa ter pelo menos 8 caracteres.');
  }

  patient.senha = senha;
  return { success: true };
}

/**
 * Retorna o paciente autenticado por completo (dados pessoais, diagnóstico,
 * CID, protocolo, estadiamento, alergias, preferências).
 * @returns {Promise<object>}
 */
export async function getPatient() {
  await wait();
  return patient;
}

/**
 * Retorna o próximo compromisso futuro (o mais próximo no tempo), já
 * enriquecido com rótulos formatados para exibição.
 * @returns {Promise<object|null>} `null` se não houver nenhum compromisso futuro.
 */
export async function getProximoCompromisso() {
  await wait();

  const futuros = appointments
    .filter((appointment) => appointment.diasAPartirDeHoje >= 0)
    .sort((a, b) => a.diasAPartirDeHoje - b.diasAPartirDeHoje);

  const proximo = futuros[0];
  if (!proximo) return null;

  const data = addDays(new Date(), proximo.diasAPartirDeHoje);
  return {
    id: proximo.id,
    tipo: CATEGORIAS[proximo.categoria]?.tipo || 'consulta',
    titulo: proximo.titulo,
    data,
    diaLabel: formatDayLabel(data),
    hora: proximo.hora,
    local: proximo.local,
    profissional: proximo.profissional
      ? { nome: proximo.profissional.nome, cargo: proximo.profissional.cargo, foto: null }
      : null,
    dica: proximo.observacoes,
  };
}

function calcularSequenciaDias(entries) {
  const dias = new Set(entries.map((entry) => entry.diasAPartirDeHoje));
  let streak = 0;
  while (dias.has(-streak)) streak++;
  return streak;
}

/**
 * Retorna o registro de diário de hoje (se existir) e a sequência de dias
 * consecutivos com registro, para o card de Diário da Home.
 * @returns {Promise<{registro: object|null, sequenciaDias: number}>}
 */
export async function getRegistroDeHoje() {
  await wait();

  const registro = diaryEntries.find((entry) => entry.diasAPartirDeHoje === 0) || null;
  const sequenciaDias = calcularSequenciaDias(diaryEntries);

  return { registro, sequenciaDias };
}

/**
 * Retorna as notificações mais recentes, com rótulo de horário relativo.
 * @param {{limit?: number}} [opcoes] - Limita a quantidade retornada.
 * @returns {Promise<object[]>}
 */
export async function getNotificacoes({ limit } = {}) {
  await wait();

  const ordenadas = [...notifications].sort((a, b) => a.minutosAtras - b.minutosAtras);
  const lista = typeof limit === 'number' ? ordenadas.slice(0, limit) : ordenadas;

  return lista.map((notification) => ({
    ...notification,
    horaLabel: formatRelativeTime(notification.minutosAtras),
  }));
}

/**
 * Retorna a equipe de cuidado (multidisciplinar) do paciente.
 * @returns {Promise<{equipe: object[], total: number}>}
 */
export async function getResumoEquipe() {
  await wait();
  return { equipe: equipeCuidado, total: equipeCuidado.length };
}

/**
 * Retorna a soma de mensagens não lidas em todas as conversas do Chat.
 * @returns {Promise<{total: number}>}
 */
export async function getConversasNaoLidas() {
  await wait();
  const total = conversations.reduce((acc, conversation) => acc + conversation.naoLidas, 0);
  return { total };
}

/**
 * Retorna os 12 sintomas disponíveis para registro no Diário.
 * @returns {Promise<{nome: string, descricao: string}[]>}
 */
export async function getSintomasDisponiveis() {
  await wait();
  return SINTOMAS_DISPONIVEIS;
}

function enrichDiaryEntry(entry) {
  return {
    ...entry,
    data: addDays(new Date(), entry.diasAPartirDeHoje),
    dataLabel: formatDiaryDateLabel(entry.diasAPartirDeHoje, entry.hora),
    temAlerta: temSinalDeAtencao(entry.sintomas),
  };
}

/**
 * Retorna o histórico de registros do Diário, do mais recente ao mais
 * antigo, opcionalmente filtrado.
 * @param {{periodoDias?: number, sintoma?: string}} [filtros] - `periodoDias` limita aos últimos N dias; `sintoma` filtra por nome exato de um sintoma.
 * @returns {Promise<object[]>}
 */
export async function getRegistrosDiario({ periodoDias, sintoma } = {}) {
  await wait();

  let lista = [...diaryEntries].sort((a, b) => b.diasAPartirDeHoje - a.diasAPartirDeHoje);

  if (typeof periodoDias === 'number') {
    lista = lista.filter((entry) => entry.diasAPartirDeHoje >= -periodoDias);
  }

  if (sintoma) {
    lista = lista.filter((entry) => entry.sintomas.some((item) => item.nome === sintoma));
  }

  return lista.map(enrichDiaryEntry);
}

/**
 * Retorna um registro específico do Diário.
 * @param {string} id
 * @returns {Promise<object>}
 * @throws {Error} Se o registro não existir.
 */
export async function getRegistroPorId(id) {
  await wait();

  const entry = diaryEntries.find((item) => item.id === id);
  if (!entry) {
    throw new Error('Registro não encontrado.');
  }

  return enrichDiaryEntry(entry);
}

let proximoIdRegistro = diaryEntries.length;

/**
 * Stub do aviso automático à equipe para um registro com sintoma(s) em
 * nível crítico (`temSinalDeAtencao`). Hoje só loga em dev; quando o
 * backend existir, o corpo desta função vira uma chamada real (endpoint de
 * alerta ou fila de notificação para a equipe assistencial) sem precisar
 * mudar `salvarRegistro` nem nenhuma tela.
 * @param {object} registro
 */
function notificarAlertaEquipe(registro) {
  if (import.meta.env.DEV) {
    console.info(`[mock] Alerta crítico seria enviado à equipe — registro ${registro.id}`);
  }
}

/**
 * Cria o registro de diário do dia (ou sobrescreve o de hoje, se já
 * existir um — só é permitido um registro por dia).
 * @param {{texto?: string, grau: number, sintomas: {nome: string, intensidade: number}[]}} dados
 * @returns {Promise<{success: true, id: string, temAlerta: boolean, auditoria: {paciente: string, data: string, horario: string}}>}
 * `temAlerta` sinaliza sintoma(s) com intensidade ≥ 4 (ver `ALERTA_LIMIAR` em
 * `utils/mood.js`) e já dispara `notificarAlertaEquipe`. `auditoria` traz os
 * metadados que o mapa_requisito.md pede para o registro de auditoria
 * (paciente/data/horário — não há `profissional` aqui porque quem escreve
 * o registro é o próprio paciente).
 */
export async function salvarRegistro({ texto, grau, sintomas }) {
  await wait();

  const novoRegistro = {
    id: `entry-novo-${proximoIdRegistro++}`,
    diasAPartirDeHoje: 0,
    hora: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
    grau,
    texto: texto || '',
    sintomas: sintomas || [],
  };

  const indiceHoje = diaryEntries.findIndex((entry) => entry.diasAPartirDeHoje === 0);
  if (indiceHoje >= 0) {
    diaryEntries[indiceHoje] = novoRegistro;
  } else {
    diaryEntries.unshift(novoRegistro);
  }

  const temAlerta = temSinalDeAtencao(novoRegistro.sintomas);
  if (temAlerta) {
    notificarAlertaEquipe(novoRegistro);
  }

  const agora = new Date();
  return {
    success: true,
    id: novoRegistro.id,
    temAlerta,
    auditoria: {
      paciente: patient.id,
      data: agora.toISOString().slice(0, 10),
      horario: novoRegistro.hora,
    },
  };
}

/**
 * Retorna a série temporal de humor/grau dos últimos registros, para o
 * gráfico evolutivo do Diário.
 * @param {{limit?: number}} [opcoes] - Quantidade de pontos (padrão 7).
 * @returns {Promise<{dataLabel: string, valor: number}[]>} Ordenado do mais antigo para o mais recente.
 */
export async function getEvolucaoHumor({ limit = 7 } = {}) {
  await wait();

  const recentes = [...diaryEntries]
    .sort((a, b) => b.diasAPartirDeHoje - a.diasAPartirDeHoje)
    .slice(0, limit)
    .reverse();

  return recentes.map((entry) => {
    const data = addDays(new Date(), entry.diasAPartirDeHoje);
    return {
      dataLabel: data.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
      valor: entry.grau,
    };
  });
}

function enrichAppointment(appointment) {
  const data = addDays(new Date(), appointment.diasAPartirDeHoje);
  const categoriaInfo = CATEGORIAS[appointment.categoria] || CATEGORIAS.consulta;
  const dataLabel =
    appointment.diasAPartirDeHoje >= 0
      ? formatAgendaFutureLabel(appointment.diasAPartirDeHoje, appointment.hora)
      : formatDiaryDateLabel(appointment.diasAPartirDeHoje, appointment.hora);

  return {
    ...appointment,
    data,
    dataLabel,
    dataCompletaLabel: formatFullDateWithWeekday(data),
    icon: categoriaInfo.icon,
    colorVar: categoriaInfo.colorVar,
    tipo: categoriaInfo.tipo,
  };
}

/**
 * Retorna todos os compromissos futuros, enriquecidos e ordenados do mais
 * próximo ao mais distante.
 * @returns {Promise<object[]>}
 */
export async function getProximosCompromissos() {
  await wait();

  return appointments
    .filter((appointment) => appointment.diasAPartirDeHoje >= 0)
    .sort((a, b) => a.diasAPartirDeHoje - b.diasAPartirDeHoje)
    .map(enrichAppointment);
}

/**
 * Retorna todos os compromissos passados, enriquecidos e ordenados do mais
 * recente ao mais antigo.
 * @returns {Promise<object[]>}
 */
export async function getHistoricoCompromissos() {
  await wait();

  return appointments
    .filter((appointment) => appointment.diasAPartirDeHoje < 0)
    .sort((a, b) => b.diasAPartirDeHoje - a.diasAPartirDeHoje)
    .map(enrichAppointment);
}

/**
 * Retorna um compromisso específico da Agenda.
 * @param {string} id
 * @returns {Promise<object>}
 * @throws {Error} Se o compromisso não existir.
 */
export async function getCompromissoPorId(id) {
  await wait();

  const appointment = appointments.find((item) => item.id === id);
  if (!appointment) {
    throw new Error('Compromisso não encontrado.');
  }

  return enrichAppointment(appointment);
}

/**
 * Retorna os 7 dias da semana de `dataReferencia`, cada um com seus
 * compromissos (para a visualização Semanal da Agenda).
 * @param {Date} dataReferencia - Qualquer dia dentro da semana desejada.
 * @returns {Promise<{data: Date, eventos: object[]}[]>}
 */
export async function getSemanaAgenda(dataReferencia) {
  await wait();

  const dias = getWeekDays(dataReferencia);

  return dias.map((dia) => ({
    data: dia,
    eventos: appointments
      .filter((appointment) => isSameDay(addDays(new Date(), appointment.diasAPartirDeHoje), dia))
      .sort((a, b) => a.hora.localeCompare(b.hora))
      .map(enrichAppointment),
  }));
}

/**
 * Retorna a grade do mês de `dataReferencia` (células vazias de
 * preenchimento + um dia por célula), cada dia com seus compromissos, para
 * a visualização Mensal da Agenda.
 * @param {Date} dataReferencia - Qualquer dia dentro do mês desejado.
 * @returns {Promise<({data: Date, eventos: object[]}|null)[]>} `null` nas células de preenchimento antes do dia 1.
 */
export async function getMesAgenda(dataReferencia) {
  await wait();

  const celulas = getMonthGridDays(dataReferencia);

  return celulas.map((dia) => {
    if (!dia) return null;

    return {
      data: dia,
      eventos: appointments
        .filter((appointment) => isSameDay(addDays(new Date(), appointment.diasAPartirDeHoje), dia))
        .map(enrichAppointment),
    };
  });
}

function enrichOrientation(orientation) {
  const tipoInfo = getTipoConteudoInfo(orientation.tipo);
  const [ano, mes, dia] = orientation.publicadoEm.split('-').map(Number);
  const dataPublicacao = new Date(ano, mes - 1, dia);

  return {
    ...orientation,
    tipoLabel: tipoInfo.label,
    icon: tipoInfo.icon,
    colorVar: tipoInfo.colorVar,
    duracaoLabel: orientation.tipo === 'video' ? `${orientation.tempoLeituraMin}:00` : null,
    publicadoLabel: `Publicado em ${dataPublicacao.toLocaleDateString('pt-BR', {
      day: 'numeric',
      month: 'long',
    })}`,
  };
}

function orientacoesDoDiagnostico() {
  const cid = patient.diagnostico?.cid;
  if (!cid) return orientations;
  return orientations.filter((orientation) => orientation.cids.includes(cid));
}

/**
 * Retorna as orientações já restritas ao CID do paciente autenticado,
 * opcionalmente filtradas.
 * @param {{categoria?: string, tipo?: string, favoritas?: boolean, naoLidas?: boolean}} [filtros]
 * @returns {Promise<object[]>}
 */
export async function getOrientacoes({ categoria, tipo, favoritas, naoLidas } = {}) {
  await wait();

  let lista = orientacoesDoDiagnostico();

  if (categoria) lista = lista.filter((orientation) => orientation.categoria === categoria);
  if (tipo) lista = lista.filter((orientation) => orientation.tipo === tipo);
  if (favoritas) lista = lista.filter((orientation) => orientation.favorito);
  if (naoLidas) lista = lista.filter((orientation) => !orientation.lida);

  return lista.map(enrichOrientation);
}

/**
 * Retorna as categorias distintas presentes nas orientações do paciente
 * (para os filtros da tela de Orientações).
 * @returns {Promise<string[]>}
 */
export async function getCategoriasOrientacoes() {
  await wait();

  const categorias = [];
  orientacoesDoDiagnostico().forEach((orientation) => {
    if (!categorias.includes(orientation.categoria)) categorias.push(orientation.categoria);
  });

  return categorias;
}

/**
 * Retorna uma orientação específica.
 * @param {string} id
 * @returns {Promise<object>}
 * @throws {Error} Se a orientação não existir.
 */
export async function getOrientacaoPorId(id) {
  await wait();

  const orientation = orientations.find((item) => item.id === id);
  if (!orientation) {
    throw new Error('Orientação não encontrada.');
  }

  return enrichOrientation(orientation);
}

/**
 * Marca uma orientação como lida.
 * @param {string} id
 * @returns {Promise<{success: true}>}
 */
export async function marcarOrientacaoComoLida(id) {
  await wait(150);

  const orientation = orientations.find((item) => item.id === id);
  if (orientation) orientation.lida = true;

  return { success: true };
}

/**
 * Alterna o estado de favorito de uma orientação.
 * @param {string} id
 * @returns {Promise<{success: true, favorito: boolean}>} `favorito` já reflete o novo estado.
 * @throws {Error} Se a orientação não existir.
 */
export async function alternarFavoritoOrientacao(id) {
  await wait(150);

  const orientation = orientations.find((item) => item.id === id);
  if (!orientation) {
    throw new Error('Orientação não encontrada.');
  }

  orientation.favorito = !orientation.favorito;
  return { success: true, favorito: orientation.favorito };
}

function ultimaMensagemDe(conversa) {
  return conversa.mensagens[conversa.mensagens.length - 1];
}

function resumoMensagem(mensagem) {
  if (mensagem.tipo === 'imagem') return '📷 Imagem';
  return mensagem.texto;
}

function tituloConversa(conversa) {
  if (conversa.titulo) return conversa.titulo;
  const assuntoInfo = conversa.assunto ? getAssuntoInfo(conversa.assunto) : null;
  return assuntoInfo ? assuntoInfo.label : 'Conversa com a equipe';
}

function enrichConversaResumo(conversa) {
  const ultima = ultimaMensagemDe(conversa);

  return {
    id: conversa.id,
    titulo: tituloConversa(conversa),
    profissional: conversa.profissional,
    assunto: conversa.assunto,
    assuntoInfo: conversa.assunto ? getAssuntoInfo(conversa.assunto) : null,
    ultimaMensagem: resumoMensagem(ultima),
    horaLabel: formatRelativeTime(ultima.minutosAtras),
    minutosAtras: ultima.minutosAtras,
    naoLidas: conversa.naoLidas,
  };
}

function enrichMensagem(mensagem) {
  const data = new Date(Date.now() - mensagem.minutosAtras * 60000);

  return {
    ...mensagem,
    data,
    horaLabel: data.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
  };
}

/**
 * Retorna a lista de conversas do Chat, resumidas (sem as mensagens) e
 * ordenadas pela mais recente atividade.
 * @returns {Promise<object[]>}
 */
export async function getConversas() {
  await wait();

  return [...conversations]
    .sort((a, b) => ultimaMensagemDe(a).minutosAtras - ultimaMensagemDe(b).minutosAtras)
    .map(enrichConversaResumo);
}

/**
 * Retorna uma conversa completa, com todas as mensagens.
 * @param {string} id
 * @returns {Promise<object>}
 * @throws {Error} Se a conversa não existir.
 */
export async function getConversaPorId(id) {
  await wait();

  const conversa = conversations.find((item) => item.id === id);
  if (!conversa) {
    throw new Error('Conversa não encontrada.');
  }

  return {
    id: conversa.id,
    titulo: tituloConversa(conversa),
    profissional: conversa.profissional,
    assunto: conversa.assunto,
    assuntoInfo: conversa.assunto ? getAssuntoInfo(conversa.assunto) : null,
    naoLidas: conversa.naoLidas,
    mensagens: conversa.mensagens.map(enrichMensagem),
  };
}

/**
 * Zera o contador de mensagens não lidas de uma conversa.
 * @param {string} id
 * @returns {Promise<{success: true}>}
 */
export async function marcarConversaComoLida(id) {
  await wait(150);

  const conversa = conversations.find((item) => item.id === id);
  if (conversa) conversa.naoLidas = 0;

  return { success: true };
}

let proximoIdMensagem = 1000;

/**
 * Envia uma mensagem de texto numa conversa existente.
 * @param {string} conversaId
 * @param {string} texto
 * @returns {Promise<{success: true, mensagem: object}>}
 * @throws {Error} Se a conversa não existir.
 */
export async function enviarMensagem(conversaId, texto) {
  await wait(400);

  const conversa = conversations.find((item) => item.id === conversaId);
  if (!conversa) {
    throw new Error('Conversa não encontrada.');
  }

  const novaMensagem = {
    id: `m-novo-${proximoIdMensagem++}`,
    autor: 'paciente',
    tipo: 'texto',
    texto,
    minutosAtras: 0,
    statusEnvio: 'enviada',
  };
  conversa.mensagens.push(novaMensagem);

  return { success: true, mensagem: enrichMensagem(novaMensagem) };
}

function mensagemAutomatica(assuntoInfo) {
  const sufixo = assuntoInfo ? ` sobre ${assuntoInfo.label.toLowerCase()}` : '';
  return `Recebemos sua mensagem${sufixo}! 🙌 A equipe responde em horário comercial (seg–sex, 08h–18h) — em cerca de 45 minutos.`;
}

let proximoIdConversa = 1000;

/**
 * Cria uma nova conversa (organizada por assunto — Medicação/Agendamento/
 * Sintomas/Outros) com a mensagem inicial do paciente e uma resposta
 * automática mockada. No backend real, isso deve direcionar a conversa ao
 * profissional correto pelo assunto (ver mapa_requisito.md, Chat/MÉDIO).
 * @param {{assunto?: string, texto: string}} dados
 * @returns {Promise<{success: true, id: string}>}
 */
export async function iniciarConversa({ assunto, texto }) {
  await wait(500);

  const assuntoInfo = assunto ? getAssuntoInfo(assunto) : null;

  const novaConversa = {
    id: `c-novo-${proximoIdConversa++}`,
    titulo: null,
    profissional: null,
    assunto: assunto || null,
    naoLidas: 0,
    mensagens: [
      {
        id: `m-novo-${proximoIdMensagem++}`,
        autor: 'sistema',
        tipo: 'sistema',
        texto: assuntoInfo ? `Conversa iniciada sobre ${assuntoInfo.label}` : 'Conversa iniciada',
        minutosAtras: 0,
      },
      {
        id: `m-novo-${proximoIdMensagem++}`,
        autor: 'paciente',
        tipo: 'texto',
        texto,
        minutosAtras: 0,
        statusEnvio: 'enviada',
      },
      {
        id: `m-novo-${proximoIdMensagem++}`,
        autor: 'automatica',
        tipo: 'texto',
        texto: mensagemAutomatica(assuntoInfo),
        minutosAtras: 0,
      },
    ],
  };

  conversations.unshift(novaConversa);
  return { success: true, id: novaConversa.id };
}

function enrichNotificacaoCompleta(notification) {
  return {
    ...notification,
    horaLabel: formatRelativeTime(notification.minutosAtras),
    tipoInfo: getTipoNotificacaoInfo(notification.tipo),
  };
}

/**
 * Retorna todas as notificações (lidas e não lidas), enriquecidas, para a
 * Central de Notificações.
 * @returns {Promise<object[]>}
 */
export async function getTodasNotificacoes() {
  await wait();

  return [...notifications]
    .sort((a, b) => a.minutosAtras - b.minutosAtras)
    .map(enrichNotificacaoCompleta);
}

/**
 * Marca uma notificação como lida.
 * @param {string} id
 * @returns {Promise<{success: true}>}
 */
export async function marcarNotificacaoComoLida(id) {
  await wait(150);

  const notification = notifications.find((item) => item.id === id);
  if (notification) notification.lida = true;

  return { success: true };
}

/**
 * Marca todas as notificações como lidas de uma vez.
 * @returns {Promise<{success: true}>}
 */
export async function marcarTodasNotificacoesComoLidas() {
  await wait(300);

  notifications.forEach((notification) => {
    notification.lida = true;
  });

  return { success: true };
}

/**
 * Atualiza uma preferência do paciente (Perfil > Preferências).
 * @param {'biometria'|'lembretes24h'|'lembretes2h'|'novidadesBiblioteca'|'temaEscuro'} chave
 * @param {boolean} valor
 * @returns {Promise<{success: true}>}
 */
export async function atualizarPreferencia(chave, valor) {
  await wait(150);

  patient.preferencias[chave] = valor;
  return { success: true };
}

/**
 * Solicita a exportação dos dados do paciente (LGPD).
 * @returns {Promise<{success: true}>}
 */
export async function solicitarExportacaoDados() {
  await wait(600);
  return { success: true };
}

/**
 * Solicita a exclusão da conta do paciente (LGPD).
 * @returns {Promise<{success: true}>}
 */
export async function solicitarExclusaoConta() {
  await wait(600);
  return { success: true };
}

function horaAtual() {
  return new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function enrichHistoricoCuidador(item) {
  const data = addDays(new Date(), item.diasAPartirDeHoje);
  return {
    ...item,
    dataLabel: `${data.toLocaleDateString('pt-BR')} · ${item.hora}`,
  };
}

/**
 * Retorna o vínculo de cuidador atual (se houver), o histórico de vínculos
 * e as listas fixas de permissões (o que o cuidador pode/não pode acessar).
 * @returns {Promise<{atual: object|null, historico: object[], permissoesPode: string[], permissoesNaoPode: string[]}>}
 */
export async function getCuidador() {
  await wait();

  return {
    atual: caregiverState.atual,
    historico: [...caregiverState.historico]
      .sort((a, b) => b.diasAPartirDeHoje - a.diasAPartirDeHoje)
      .map(enrichHistoricoCuidador),
    permissoesPode: PERMISSOES_PODE,
    permissoesNaoPode: PERMISSOES_NAO_PODE,
  };
}

let proximoIdHistoricoCuidador = 100;

/**
 * Convida um cuidador (por SMS ou e-mail). Se já houver um vínculo ativo,
 * ele é revogado antes — só existe um vínculo por vez (ver mapa_requisito.md,
 * Cuidador: "Vínculo único").
 * @param {{nome: string, parentesco: string, meio: 'sms'|'email', contato: string}} dados
 * @returns {Promise<{success: true}>}
 */
export async function convidarCuidador({ nome, parentesco, meio, contato }) {
  await wait(700);

  if (caregiverState.atual) {
    caregiverState.historico.unshift({
      id: `h-novo-${proximoIdHistoricoCuidador++}`,
      evento: 'revogado',
      nome: caregiverState.atual.nome,
      parentesco: caregiverState.atual.parentesco,
      diasAPartirDeHoje: 0,
      hora: horaAtual(),
    });
  }

  caregiverState.atual = { nome, parentesco, meio, contato };

  caregiverState.historico.unshift(
    {
      id: `h-novo-${proximoIdHistoricoCuidador++}`,
      evento: 'convite_aceito',
      nome,
      parentesco,
      diasAPartirDeHoje: 0,
      hora: horaAtual(),
    },
    {
      id: `h-novo-${proximoIdHistoricoCuidador++}`,
      evento: 'vinculo_ativo',
      nome,
      parentesco,
      diasAPartirDeHoje: 0,
      hora: horaAtual(),
    }
  );

  return { success: true };
}

/**
 * Revoga o vínculo de cuidador atual.
 * @returns {Promise<{success: true}>}
 */
export async function removerCuidador() {
  await wait(500);

  if (caregiverState.atual) {
    caregiverState.historico.unshift({
      id: `h-novo-${proximoIdHistoricoCuidador++}`,
      evento: 'revogado',
      nome: caregiverState.atual.nome,
      parentesco: caregiverState.atual.parentesco,
      diasAPartirDeHoje: 0,
      hora: horaAtual(),
    });
  }

  caregiverState.atual = null;
  return { success: true };
}

let proximoIdNps = 1;

/**
 * Registra a resposta de NPS do paciente.
 * @param {{nota: number, comentario?: string}} dados - `nota` de 0 a 10.
 * @returns {Promise<{success: true}>}
 */
export async function enviarRespostaNps({ nota, comentario }) {
  await wait(600);

  respostasNps.push({
    id: `nps-${proximoIdNps++}`,
    nota,
    comentario: comentario || '',
    respondidoEm: new Date().toISOString(),
  });

  return { success: true };
}
