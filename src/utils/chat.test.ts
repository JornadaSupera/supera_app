import { describe, expect, it } from 'vitest';
import {
  buildDiaryChatDraft,
  describeMessageAuthor,
  describeMessageSender,
  getBubblePosition,
  findOpenConversation,
  getDeliveryStatus,
  getMessageSide,
  groupMessagesByDay,
  IMAGE_WITHOUT_CAPTION_TEXT,
  isImageWithoutCaption,
  readConversationDraft,
} from './chat';
import type { EnrichedMessage, MessageAuthor } from '../types';

const PATIENT = 'conta-paciente';
const CAREGIVER = 'conta-acompanhante';

/** Mensagem num horário local fixo: o agrupamento por dia usa o fuso do aparelho. */
function message(
  id: string,
  author: MessageAuthor,
  [day, hours, minutes]: [number, number, number],
  authorAccountId: string | null = author === 'patient' ? PATIENT : author === 'caregiver' ? CAREGIVER : null
): EnrichedMessage {
  const date = new Date(2026, 8, day, hours, minutes);
  return {
    id,
    author,
    authorAccountId,
    text: `mensagem ${id}`,
    createdAt: date.toISOString(),
    attachment: null,
    date,
    timeLabel: `${hours}:${minutes}`,
  };
}

describe('groupMessagesByDay', () => {
  it('separa os dias e junta mensagens seguidas do mesmo remetente', () => {
    const days = groupMessagesByDay([
      message('1', 'patient', [28, 10, 0]),
      message('2', 'patient', [28, 10, 3]),
      message('3', 'professional', [28, 10, 5], 'conta-enfermeira'),
      message('4', 'professional', [29, 9, 0], 'conta-enfermeira'),
    ]);

    expect(days).toHaveLength(2);
    expect(days[0].groups.map((group) => group.messages.map((m) => m.id))).toEqual([['1', '2'], ['3']]);
    expect(days[1].groups.map((group) => group.messages.map((m) => m.id))).toEqual([['4']]);
    expect(days[0].groups[0].side).toBe('own');
    expect(days[0].groups[1].side).toBe('team');
  });

  it('abre grupo novo depois de 5 minutos, mesmo com o mesmo remetente', () => {
    const [day] = groupMessagesByDay([
      message('1', 'patient', [28, 10, 0]),
      message('2', 'patient', [28, 10, 5]),
      message('3', 'patient', [28, 10, 11]),
    ]);

    expect(day.groups.map((group) => group.messages.length)).toEqual([2, 1]);
  });

  it('não junta paciente e acompanhante, embora fiquem do mesmo lado', () => {
    const [day] = groupMessagesByDay([
      message('1', 'patient', [28, 10, 0]),
      message('2', 'caregiver', [28, 10, 1]),
    ]);

    expect(day.groups).toHaveLength(2);
    expect(day.groups.every((group) => group.side === 'own')).toBe(true);
  });

  it('mensagem de sistema fica sozinha, no centro', () => {
    const [day] = groupMessagesByDay([
      message('1', 'system', [28, 10, 0]),
      message('2', 'system', [28, 10, 1]),
    ]);

    expect(day.groups.map((group) => group.side)).toEqual(['system', 'system']);
  });

  it('lista vazia não tem dia nenhum', () => {
    expect(groupMessagesByDay([])).toEqual([]);
  });
});

describe('getBubblePosition', () => {
  it('marca a bolha isolada e as pontas do grupo', () => {
    expect(getBubblePosition(0, 1)).toBe('single');
    expect([0, 1, 2].map((index) => getBubblePosition(index, 3))).toEqual(['first', 'middle', 'last']);
  });
});

describe('getMessageSide', () => {
  it('paciente e acompanhante deste lado; equipe do outro; sistema no centro', () => {
    expect(getMessageSide({ author: 'patient' })).toBe('own');
    expect(getMessageSide({ author: 'caregiver' })).toBe('own');
    expect(getMessageSide({ author: 'professional' })).toBe('team');
    expect(getMessageSide({ author: 'system' })).toBe('system');
  });
});

describe('getDeliveryStatus', () => {
  const sent = { author: 'patient' as const, createdAt: '2026-09-29T13:00:00.000Z' };

  it('"Lida" quando a equipe leu depois da mensagem', () => {
    expect(getDeliveryStatus(sent, '2026-09-29T13:05:00.000Z')).toBe('read');
    expect(getDeliveryStatus(sent, '2026-09-29T13:00:00.000Z')).toBe('read');
  });

  it('"Enviada" sem leitura, ou com leitura anterior', () => {
    expect(getDeliveryStatus(sent, null)).toBe('sent');
    expect(getDeliveryStatus(sent, '2026-09-29T12:59:59.000Z')).toBe('sent');
  });

  it('nada para mensagem da equipe', () => {
    expect(getDeliveryStatus({ author: 'professional', createdAt: sent.createdAt }, null)).toBeNull();
  });
});

describe('quem escreveu', () => {
  const patientView = { accountId: PATIENT, isCaregiver: false };
  const caregiverView = { accountId: CAREGIVER, isCaregiver: true };
  const fromPatient = { author: 'patient' as const, authorAccountId: PATIENT };
  const fromCaregiver = { author: 'caregiver' as const, authorAccountId: CAREGIVER };

  it('a própria mensagem é "Você", sem rótulo acima', () => {
    expect(describeMessageAuthor(fromPatient, patientView)).toBe('Você');
    expect(describeMessageSender(fromPatient, patientView)).toBeNull();
    expect(describeMessageAuthor(fromCaregiver, caregiverView)).toBe('Você');
    expect(describeMessageSender(fromCaregiver, caregiverView)).toBeNull();
  });

  it('o paciente vê a mensagem do acompanhante com o rótulo dele', () => {
    expect(describeMessageAuthor(fromCaregiver, patientView)).toBe('Seu acompanhante');
    expect(describeMessageSender(fromCaregiver, patientView)).toBe('Enviada pelo seu acompanhante');
  });

  it('o acompanhante vê a mensagem do paciente e a de outro acompanhante', () => {
    expect(describeMessageAuthor(fromPatient, caregiverView)).toBe('Quem você acompanha');
    expect(describeMessageSender(fromPatient, caregiverView)).toBe('Enviada por quem você acompanha');
    const otherCaregiver = { author: 'caregiver' as const, authorAccountId: 'outra-conta' };
    expect(describeMessageAuthor(otherCaregiver, caregiverView)).toBe('Outro acompanhante');
  });

  it('a equipe não tem rótulo deste lado', () => {
    const fromTeam = { author: 'professional' as const, authorAccountId: 'conta-enfermeira' };
    expect(describeMessageAuthor(fromTeam, patientView)).toBeNull();
    expect(describeMessageSender(fromTeam, patientView)).toBeNull();
  });
});

describe('isImageWithoutCaption', () => {
  it('reconhece o marcador atual e o antigo, com emoji', () => {
    expect(isImageWithoutCaption(IMAGE_WITHOUT_CAPTION_TEXT)).toBe(true);
    expect(isImageWithoutCaption('📷 Imagem')).toBe(true);
    expect(isImageWithoutCaption('Foto da receita')).toBe(false);
  });
});

describe('findOpenConversation', () => {
  const conversations = [
    { id: 'resolvida', isOpen: false, subjectCode: 'scheduling' },
    { id: 'recente', isOpen: true, subjectCode: 'scheduling' },
    { id: 'antiga', isOpen: true, subjectCode: 'scheduling' },
    { id: 'sintomas', isOpen: true, subjectCode: 'symptoms' },
  ];

  it('reabre a conversa aberta mais recente do assunto, ignorando a resolvida', () => {
    expect(findOpenConversation(conversations, 'scheduling')?.id).toBe('recente');
  });

  it('sem conversa aberta no assunto, devolve null (abre a nova)', () => {
    expect(findOpenConversation(conversations, 'medication')).toBeNull();
  });
});

describe('readConversationDraft', () => {
  it('lê o começo da mensagem do estado de navegação', () => {
    expect(readConversationDraft({ draft: 'Sobre o compromisso: ' })).toBe('Sobre o compromisso: ');
  });

  it('estado ausente ou estranho vira campo vazio', () => {
    expect(readConversationDraft(null)).toBe('');
    expect(readConversationDraft({ draft: 42 })).toBe('');
    expect(readConversationDraft('texto')).toBe('');
  });
});

describe('buildDiaryChatDraft', () => {
  it('cita o registro de hoje pelo nome e os outros pela data', () => {
    expect(buildDiaryChatDraft(new Date())).toBe('Sobre o meu registro do diário de hoje: ');
    expect(buildDiaryChatDraft(new Date(2026, 8, 3, 12))).toBe('Sobre o meu registro do diário de 03/09: ');
  });
});
