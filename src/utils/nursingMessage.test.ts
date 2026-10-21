import { describe, expect, it } from 'vitest';
import { buildNursingMessage } from './nursingMessage';

describe('buildNursingMessage', () => {
  it('identifica o titular pelo nome, pela data de nascimento e pelo diagnóstico', () => {
    const text = buildNursingMessage({
      patientName: 'Maria da Silva',
      patientBirthDate: '1970-05-10',
      diagnosis: { cid: 'C50.9', description: 'Neoplasia maligna da mama, não especificada' },
      subject: 'Sintomas',
      question: 'Estou enjoada desde ontem.',
    });

    expect(text).toBe(
      [
        'Olá, enfermagem.',
        'Sou Maria da Silva (nascimento: 10/05/1970), paciente da Supera Oncologia.',
        'Diagnóstico: C50.9 · Neoplasia maligna da mama, não especificada',
        '',
        'Assunto: Sintomas',
        'Dúvida: Estou enjoada desde ontem.',
        '',
        'Mensagem enviada pelo app Jornada Supera.',
      ].join('\n')
    );
  });

  it('o acompanhante diz quem é e de quem cuida, sem a data que não recebe', () => {
    const text = buildNursingMessage({
      patientName: 'Maria da Silva',
      patientBirthDate: null,
      caregiverName: 'Carlos da Silva',
      subject: 'Medicação',
      question: 'Pode tomar junto com o café?',
    });

    expect(text).toContain('Sou Carlos da Silva, acompanhante de Maria da Silva, paciente da Supera Oncologia.');
    expect(text).not.toContain('nascimento');
  });

  it('sem diagnóstico na ficha (ou sem a ficha clínica compartilhada), a linha não entra', () => {
    const text = buildNursingMessage({
      patientName: 'Maria da Silva',
      patientBirthDate: '1970-05-10',
      diagnosis: null,
      subject: 'Outros',
      question: 'Dúvida',
    });

    expect(text).not.toContain('Diagnóstico');
  });

  it('nunca leva o CPF nem uma data ilegível', () => {
    const text = buildNursingMessage({
      patientName: 'Maria da Silva',
      patientBirthDate: 'data ruim',
      subject: 'Outros',
      question: 'Dúvida',
    });

    expect(text).toContain('Sou Maria da Silva, paciente');
    expect(text).not.toMatch(/\d{3}\.?\d{3}\.?\d{3}-?\d{2}/);
  });
});
