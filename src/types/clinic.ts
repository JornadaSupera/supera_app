// Configuração da clínica que o app do paciente lê (guia do banco §5.20).
//
// O paciente lê o horário de atendimento da equipe — um só para todas as
// áreas. A tabela nasce vazia: sem horário configurado, o app não mostra
// horário nenhum, em vez de inventar um.

/**
 * Um intervalo de atendimento (`clinic_business_hours`), no fuso da clínica.
 * O mesmo dia pode ter mais de um (ex.: 08:00–12:00 e 13:00–18:00).
 */
export interface BusinessHoursInterval {
  /** 0 = domingo … 6 = sábado, como no banco. */
  weekday: number;
  /** `HH:MM:SS`. */
  opensAt: string;
  /** `HH:MM:SS`, sempre depois de `opensAt` (o banco não aceita virar a meia-noite). */
  closesAt: string;
}
