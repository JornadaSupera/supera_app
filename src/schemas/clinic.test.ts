import { describe, expect, it } from 'vitest';
import { clinicPresentationRowSchema, parseOnboardingSlides } from './clinic';

describe('parseOnboardingSlides', () => {
  it('fica com os slides válidos, na ordem da clínica, aparando espaços', () => {
    expect(
      parseOnboardingSlides([
        { title: ' Bem-vindo ', body: 'Acompanhe seu tratamento.' },
        { title: 'Equipe', body: 'Fale com a equipe pelo chat.' },
      ])
    ).toEqual([
      { title: 'Bem-vindo', body: 'Acompanhe seu tratamento.' },
      { title: 'Equipe', body: 'Fale com a equipe pelo chat.' },
    ]);
  });

  it('descarta o slide malformado sem derrubar os outros', () => {
    const slides = parseOnboardingSlides([
      { title: '', body: 'Sem título' },
      { title: 'Longo', body: 'x'.repeat(401) },
      'texto solto',
      { title: 'Certo', body: 'Este fica.' },
    ]);
    expect(slides).toEqual([{ title: 'Certo', body: 'Este fica.' }]);
  });

  it('não passa de cinco e aceita o estado de fábrica', () => {
    const six = Array.from({ length: 6 }, (_, index) => ({ title: `Slide ${index}`, body: 'Texto.' }));
    expect(parseOnboardingSlides(six)).toHaveLength(5);
    expect(parseOnboardingSlides([])).toEqual([]);
    expect(parseOnboardingSlides(null)).toEqual([]);
  });
});

describe('clinicPresentationRowSchema', () => {
  it('logotipo vazio vira nulo', () => {
    expect(clinicPresentationRowSchema.parse({ onboarding_slides: [], logo_path: '' }).logo_path).toBeNull();
    expect(clinicPresentationRowSchema.parse({ onboarding_slides: [], logo_path: null }).logo_path).toBeNull();
    expect(clinicPresentationRowSchema.parse({ onboarding_slides: [], logo_path: 'logo.png' }).logo_path).toBe(
      'logo.png'
    );
  });
});
