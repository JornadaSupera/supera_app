import { appError } from '../lib/appError';
import { requireSupabase } from './supabaseClient';
import type { BusinessHoursInterval } from '../types';

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
