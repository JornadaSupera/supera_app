// Barril de reexport dos tipos do domínio — permite import limpo, ex.:
// `import type { Patient, Appointment } from '@/types';` em vez de apontar
// pra cada arquivo individualmente.
export type * from './session';
export type * from './patient';
export type * from './appointments';
export type * from './diary';
export type * from './messages';
export type * from './notifications';
export type * from './orientations';
export type * from './caregiver';
export type * from './nps';
