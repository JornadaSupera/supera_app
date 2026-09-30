import { appError } from '../lib/appError';
import { clinicPresentationRowSchema, parseOnboardingSlides } from '../schemas/clinic';
import { requireSupabase } from './supabaseClient';
import type { BusinessHoursInterval, ClinicPresentation } from '../types';

// Configuração da clínica que o app do paciente lê (guia do banco §5.20).

/**
 * Horário de atendimento da equipe, em ordem de dia e de abertura.
 *
 * Leitura direta: `clinic_business_hours` é aberta a qualquer conta logada
 * (`clinic_business_hours_select_authenticated`). Lista vazia não é erro nem
 * RLS: é a clínica que ainda não configurou o horário — o estado de fábrica.
 */
export async function getBusinessHours(signal?: AbortSignal): Promise<BusinessHoursInterval[]> {
  let query = requireSupabase()
    .from('clinic_business_hours')
    .select('weekday, opens_at, closes_at')
    .order('weekday')
    .order('opens_at');

  if (signal) query = query.abortSignal(signal);

  const { data, error } = await query;

  if (error) throw appError('Não foi possível carregar o horário da equipe.', error);

  return (data ?? []).map((row) => ({
    weekday: row.weekday,
    opensAt: row.opens_at,
    closesAt: row.closes_at,
  }));
}

/** O bucket público do logotipo da clínica (guia §7). */
const BRANDING_BUCKET = 'clinic-branding';

/**
 * Os slides e o logotipo que a clínica configurou para o carrossel antes do
 * login. É a única chamada do banco que funciona sem sessão.
 *
 * Nada aqui é de paciente. O estado de fábrica é vazio (sem slides e sem
 * logotipo), e quem usa cai no que o app já tem embutido. As cores da
 * Identidade Visual não entram: a paleta do app é a validada em contraste, e
 * uma cor escolhida no painel poderia deixar o texto branco ilegível.
 */
export async function getClinicPresentation(signal?: AbortSignal): Promise<ClinicPresentation> {
  const client = requireSupabase();
  let query = client.rpc('get_clinic_presentation');
  if (signal) query = query.abortSignal(signal);

  const { data, error } = await query;

  if (error) throw appError('Não foi possível carregar a apresentação da clínica.', error);

  const parsed = clinicPresentationRowSchema.safeParse(data?.[0]);
  if (!parsed.success) return { slides: [], logoUrl: null };

  const logoPath = parsed.data.logo_path;
  return {
    slides: parseOnboardingSlides(parsed.data.onboarding_slides),
    // A URL pública se monta sem ir ao servidor: o bucket é aberto à leitura.
    logoUrl: logoPath ? client.storage.from(BRANDING_BUCKET).getPublicUrl(logoPath).data.publicUrl : null,
  };
}
