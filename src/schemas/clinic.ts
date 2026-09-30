import { z } from 'zod';

// Validação do que o banco devolve em `get_clinic_presentation` (guia §5.20).
// O banco já recusa slide fora do formato na gravação; aqui é a defesa do
// outro lado: o dado é lido sem login e desenhado antes de qualquer tela, e um
// slide malformado não pode derrubar a abertura do app — ele só não aparece.

/** Tetos do banco: até 5 slides, título até 80 e texto até 400 caracteres. */
const MAX_SLIDES = 5;

export const onboardingSlideSchema = z.object({
  title: z.string().trim().min(1).max(80),
  body: z.string().trim().min(1).max(400),
});

/** A linha de `get_clinic_presentation()`. As cores não são usadas pelo app. */
export const clinicPresentationRowSchema = z.object({
  onboarding_slides: z.unknown(),
  logo_path: z.string().trim().min(1).nullable().catch(null),
});

/** Só os slides que passam na validação, na ordem da clínica. */
export function parseOnboardingSlides(value: unknown): z.infer<typeof onboardingSlideSchema>[] {
  if (!Array.isArray(value)) return [];

  return value
    .flatMap((item) => {
      const result = onboardingSlideSchema.safeParse(item);
      return result.success ? [result.data] : [];
    })
    .slice(0, MAX_SLIDES);
}
