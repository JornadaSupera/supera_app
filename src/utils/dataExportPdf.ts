import { format } from 'date-fns';
import { formatDateBr, formatDateTimeBr, parseDateOnly } from './date';
import { formatCPF } from './masks';
import type { DataSubjectExport } from '../types';

// O PDF de "Baixar meus dados": a cópia legível do pacote de `export_my_data`
// (Política de Privacidade, "Confirmação e acesso: [...] receber uma cópia").
// O pacote vem cru do banco, linha por linha, e este arquivo só o apresenta:
// nada entra ou sai do conteúdo, além dos identificadores internos (UUID), que
// não dizem nada a quem lê. Quando o app sabe o nome do que o UUID aponta (o
// CID, o sintoma, o tipo de compromisso), mostra o nome no lugar.
//
// Genérico de propósito: coluna nova no banco aparece no PDF com o nome
// original, sem exigir mudança aqui.

/** Nome legível de um identificador do pacote (CID, sintoma, tipo…). */
export type ExportReferenceNames = Record<string, string>;

/** As seções da ficha, na ordem do PDF. */
const PATIENT_SECTIONS: [string, string][] = [
  ['record', 'Ficha'],
  ['diagnoses', 'Diagnósticos'],
  ['treatment_plans', 'Planos de tratamento'],
  ['clinical_history', 'Histórico clínico'],
  ['diary_entries', 'Diário'],
  ['diary_symptom_reports', 'Sintomas registrados no diário'],
  ['appointments', 'Agenda'],
  ['conversations', 'Conversas'],
  ['messages', 'Mensagens'],
  ['message_attachments', 'Anexos das mensagens'],
  ['directed_contents', 'Orientações enviadas a você'],
  ['content_states', 'Orientações lidas e favoritas'],
  ['nps_responses', 'Pesquisas de satisfação'],
  ['caregiver_links', 'Acompanhante'],
  ['caregiver_scopes', 'Áreas liberadas ao acompanhante'],
];

/** As seções da conta, na ordem do PDF. */
const ACCOUNT_SECTIONS: [string, string][] = [
  ['consents', 'Consentimentos'],
  ['data_subject_requests', 'Pedidos sobre os seus dados'],
  ['notification_preferences', 'Preferências de notificação'],
  ['notifications', 'Notificações'],
  ['device_tokens', 'Aparelhos cadastrados para avisos'],
  ['caregiver_profiles', 'Perfil de acompanhante'],
  ['caregiver_links', 'Vínculos como acompanhante'],
  ['messages_as_caregiver', 'Mensagens escritas como acompanhante'],
];

/** Chaves do topo do pacote que não são seção. */
const ENVELOPE_KEYS = new Set(['format', 'format_version', 'generated_at', 'request_id', 'account', 'patient']);

const FIELD_LABELS: Record<string, string> = {
  full_name: 'Nome',
  email: 'E-mail',
  phone: 'Telefone',
  cpf: 'CPF',
  birth_date: 'Data de nascimento',
  address: 'Endereço',
  cep: 'CEP',
  logradouro: 'Logradouro',
  numero: 'Número',
  complemento: 'Complemento',
  bairro: 'Bairro',
  cidade: 'Cidade',
  uf: 'UF',
  documents: 'Documentos',
  insurance_name: 'Convênio',
  time_zone: 'Fuso horário',
  avatar_path: 'Foto do perfil',
  is_active: 'Ativo',
  demographics_source: 'Origem do cadastro',
  demographics_synced_at: 'Cadastro atualizado em',
  clinical_source: 'Origem dos dados clínicos',
  clinical_synced_at: 'Dados clínicos atualizados em',
  cid10_id: 'CID',
  staging: 'Estadiamento',
  tnm: 'TNM',
  diagnosed_on: 'Data do diagnóstico',
  is_primary: 'Principal',
  source: 'Origem',
  kind: 'Tipo',
  description: 'Descrição',
  cycle_number: 'Ciclo',
  protocol_name: 'Protocolo',
  cycles_planned: 'Ciclos previstos',
  intent: 'Finalidade',
  started_on: 'Início',
  ended_on: 'Fim',
  current_cycle_number: 'Ciclo atual',
  current_cycle_started_on: 'Início do ciclo atual',
  synced_at: 'Atualizado em',
  entry_date: 'Data',
  free_text: 'Texto',
  status: 'Situação',
  acting_as: 'Registrado por',
  submitted_at: 'Enviado em',
  symptom_id: 'Sintoma',
  grade: 'Intensidade (0 a 5)',
  title: 'Título',
  appointment_type_id: 'Tipo',
  status_id: 'Situação',
  starts_at: 'Início',
  ends_at: 'Fim',
  location_label: 'Local',
  location_address: 'Endereço do local',
  location_phone: 'Telefone do local',
  patient_notes: 'Orientações',
  origin_specialty_id: 'Especialidade',
  visibility: 'Visibilidade',
  confirmed_at: 'Confirmado em',
  subject_id: 'Assunto',
  opened_by: 'Aberta por',
  last_message_at: 'Última mensagem em',
  team_last_read_at: 'Lida pela equipe em',
  resolved_at: 'Encerrada em',
  author_kind: 'Escrita por',
  body: 'Mensagem',
  storage_path: 'Arquivo',
  mime_type: 'Tipo de arquivo',
  byte_size: 'Tamanho (bytes)',
  score: 'Nota (0 a 10)',
  comment: 'Comentário',
  answered_at: 'Respondida em',
  is_favorite: 'Favorita',
  read_at: 'Lida em',
  granted_at: 'Concedido em',
  activated_at: 'Ativado em',
  revoked_at: 'Revogado em',
  dormant_since: 'Inativo desde',
  scope: 'Área',
  enabled: 'Liberada',
  sent_by: 'Enviada por',
  sent_at: 'Enviada em',
  opened_at: 'Aberta em',
  document_kind: 'Documento',
  document_version: 'Versão',
  accepted_at: 'Aceito em',
  request_type: 'Pedido',
  requester_note: 'Seu texto',
  reviewed_at: 'Em análise desde',
  decided_at: 'Decidido em',
  decision_note: 'Resposta da equipe',
  executed_at: 'Cumprido em',
  type_id: 'Tipo de aviso',
  channel: 'Canal',
  is_silenceable: 'Pode ser silenciada',
  is_enabled: 'Ligada',
  quiet_hours_start: 'Silêncio a partir de',
  quiet_hours_end: 'Silêncio até',
  target_table: 'Sobre',
  archived_at: 'Arquivada em',
  token: 'Identificador do aparelho',
  platform: 'Sistema',
  last_seen_at: 'Visto por último em',
  created_at: 'Criado em',
  updated_at: 'Atualizado em',
};

/** Códigos que o banco grava em inglês, com o nome que a tela usa. */
const VALUE_LABELS: Record<string, string> = {
  patient: 'Paciente',
  caregiver: 'Acompanhante',
  professional: 'Equipe',
  system: 'Sistema',
  team: 'Equipe',
  specialty_restricted: 'Só a especialidade',
  local: 'Cadastro da clínica',
  gemed: 'Sistema Gemed',
  saved: 'Salvo',
  draft: 'Rascunho',
  open: 'Aberta',
  resolved: 'Encerrada',
  active: 'Ativo',
  pending: 'Pendente',
  revoked: 'Revogado',
  requested: 'Recebido',
  under_review: 'Em análise',
  granted: 'Deferido',
  refused: 'Recusado',
  executed: 'Cumprido',
  access: 'Acesso aos dados',
  portability: 'Portabilidade',
  rectification: 'Correção',
  deletion: 'Exclusão da conta',
  consent_revocation: 'Revogação de consentimento',
  terms_of_use: 'Termos de Uso',
  privacy_policy: 'Política de Privacidade',
  push: 'Notificação no celular',
  sms: 'SMS',
  email: 'E-mail',
  ios: 'iOS',
  android: 'Android',
  web: 'Navegador',
  schedule: 'Agenda',
  diary: 'Diário',
  chat: 'Chat',
  resources: 'Orientações',
  clinical_record: 'Ficha clínica',
  allergy: 'Alergia',
  prior_reaction: 'Reação anterior',
  conversations: 'Conversa',
  appointments: 'Compromisso',
  content_items: 'Orientação',
  diary_entries: 'Diário',
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * As fontes padrão do PDF só desenham o Latin-1 (acentos do português
 * incluídos). Aspas e travessões tipográficos viram os simples; o resto
 * (emoji, por exemplo) sai, em vez de virar símbolo quebrado.
 */
function toPdfText(text: string): string {
  return text
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/…/g, '...')
    .replace(/[^\n -ÿ]/g, '');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function labelOf(key: string): string {
  return FIELD_LABELS[key] ?? key.replace(/_/g, ' ');
}

/** O valor como texto, ou `null` quando é um identificador sem nome conhecido. */
function formatValue(key: string, value: unknown, names: ExportReferenceNames): string | null {
  if (value === null || value === undefined || value === '') return '-';
  if (typeof value === 'boolean') return value ? 'Sim' : 'Não';
  if (typeof value === 'number') return value.toLocaleString('pt-BR');
  if (typeof value === 'string') {
    if (UUID.test(value)) return names[value] ?? null;
    if (TIMESTAMP.test(value)) return formatDateTimeBr(value);
    if (DATE_ONLY.test(value)) return format(parseDateOnly(value), 'dd/MM/yyyy');
    if (key === 'cpf') return formatCPF(value);
    return VALUE_LABELS[value] ?? value;
  }
  if (Array.isArray(value)) {
    const items = value
      .map((item) => formatValue(key, item, names))
      .filter((item): item is string => item !== null);
    return items.length ? items.join(', ') : '-';
  }
  if (isRecord(value)) {
    const parts = Object.entries(value)
      .map(([innerKey, innerValue]) => {
        const text = formatValue(innerKey, innerValue, names);
        return text === null ? null : `${labelOf(innerKey)}: ${text}`;
      })
      .filter((part): part is string => part !== null);
    return parts.length ? parts.join('; ') : '-';
  }
  return String(value);
}

/** Coluna que aponta para outro registro (`cid10_id`, `recorded_by`…). */
const REFERENCE_KEY = /(_id|_by|_by_account)$/;

/**
 * As linhas "Rótulo: valor" de um registro, sem os identificadores internos:
 * o `id`, a referência vazia e a que o app não sabe nomear.
 */
function recordLines(row: Record<string, unknown>, names: ExportReferenceNames): string[] {
  return Object.entries(row)
    .filter(([key, value]) => key !== 'id' && !(REFERENCE_KEY.test(key) && value === null))
    .map(([key, value]) => {
      const text = formatValue(key, value, names);
      return text === null ? null : `${labelOf(key)}: ${text}`;
    })
    .filter((line): line is string => line !== null);
}

interface PdfSection {
  title: string;
  /** Um bloco de linhas por registro. */
  records: string[][];
}

function toSection(title: string, value: unknown, names: ExportReferenceNames): PdfSection {
  if (Array.isArray(value)) {
    return { title, records: value.filter(isRecord).map((row) => recordLines(row, names)) };
  }
  return { title, records: isRecord(value) ? [recordLines(value, names)] : [] };
}

/** As seções conhecidas na ordem combinada e, depois, as que o banco acrescentar. */
function orderedSections(
  source: Record<string, unknown>,
  known: [string, string][],
  skip: Set<string>,
  names: ExportReferenceNames
): PdfSection[] {
  const knownKeys = new Set(known.map(([key]) => key));
  const sections = known
    .filter(([key]) => key in source)
    .map(([key, title]) => toSection(title, source[key], names));
  const extra = Object.keys(source)
    .filter((key) => !knownKeys.has(key) && !skip.has(key))
    .map((key) => toSection(labelOf(key), source[key], names));
  return [...sections, ...extra];
}

// Medidas em pontos (A4 = 595 × 842). Cores do guia: `teal-deep` nos títulos,
// `ink` no texto e `ink-muted` no secundário.
const MARGIN = 48;
const TEAL_DEEP: [number, number, number] = [28, 115, 107];
const INK: [number, number, number] = [18, 51, 47];
const INK_MUTED: [number, number, number] = [84, 104, 101];

/**
 * Monta o PDF do pacote. A biblioteca só é carregada aqui, na hora do
 * download: não pesa na abertura do app.
 */
export async function buildDataExportPdf(
  exportData: DataSubjectExport,
  names: ExportReferenceNames
): Promise<Blob> {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageBottom = doc.internal.pageSize.getHeight() - MARGIN;
  const textWidth = pageWidth - MARGIN * 2;
  let y = MARGIN;

  function write(
    text: string,
    { size = 10, bold = false, color = INK, indent = 0, after = 0 }: {
      size?: number;
      bold?: boolean;
      color?: [number, number, number];
      indent?: number;
      after?: number;
    } = {}
  ) {
    const lineHeight = size * 1.4;
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.setFontSize(size);
    doc.setTextColor(...color);
    const lines: string[] = doc.splitTextToSize(toPdfText(text), textWidth - indent);
    for (const line of lines) {
      if (y + lineHeight > pageBottom) {
        doc.addPage();
        y = MARGIN;
      }
      doc.text(line, MARGIN + indent, y + size);
      y += lineHeight;
    }
    y += after;
  }

  const generatedAt =
    typeof exportData.generated_at === 'string' ? exportData.generated_at : new Date().toISOString();

  write('Meus dados', { size: 20, bold: true, color: TEAL_DEEP });
  write('Jornada Supera · Supera Oncologia', { size: 11, color: INK_MUTED, after: 4 });
  write(`Gerado em ${formatDateTimeBr(generatedAt)}`, { size: 10, color: INK_MUTED, after: 12 });
  write(
    'Esta é a cópia dos seus dados guardados no aplicativo Jornada Supera: o que você vê no app, ' +
      'nem mais nem menos. Os códigos internos do sistema foram omitidos. Para levar os dados a outro ' +
      'serviço, use a opção "Baixar em JSON" no app.',
    { size: 10, after: 16 }
  );

  const sections: PdfSection[] = [];
  if (isRecord(exportData.account)) {
    sections.push(toSection('Conta', exportData.account, names));
  }
  if (isRecord(exportData.patient)) {
    sections.push(...orderedSections(exportData.patient, PATIENT_SECTIONS, new Set(), names));
  }
  sections.push(...orderedSections(exportData, ACCOUNT_SECTIONS, ENVELOPE_KEYS, names));

  for (const section of sections) {
    // O título não fica sozinho no pé da página.
    if (y + 60 > pageBottom) {
      doc.addPage();
      y = MARGIN;
    }
    const count = section.records.length > 1 ? ` (${section.records.length})` : '';
    write(`${section.title}${count}`, { size: 14, bold: true, color: TEAL_DEEP, after: 4 });

    if (section.records.length === 0) {
      write('Nenhum registro.', { color: INK_MUTED, after: 12 });
      continue;
    }

    section.records.forEach((lines, index) => {
      if (section.records.length > 1) write(`${index + 1}.`, { bold: true });
      lines.forEach((line) => write(line, { indent: 12 }));
      y += 8;
    });
    y += 8;
  }

  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page += 1) {
    doc.setPage(page);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...INK_MUTED);
    doc.text(
      `Página ${page} de ${pages} · gerado em ${formatDateBr(generatedAt)}`,
      MARGIN,
      doc.internal.pageSize.getHeight() - MARGIN / 2
    );
  }

  return doc.output('blob');
}
