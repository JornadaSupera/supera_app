import { CAREGIVER_ERROR_MESSAGES as MESSAGES, CaregiverError } from '../lib/caregiverError';
import type {
  CaregiverAccess,
  CaregiverDelivery,
  CaregiverErrorCode,
  CaregiverLink,
  CreateCaregiverInput,
  MyCaregiver,
  ResetCaregiverPasswordInput,
  UpdateCaregiverInput,
} from '../types';

// Modo demonstração do acompanhante — SÓ em desenvolvimento.
//
// Faz o papel do banco enquanto as funções do item 30 do `PENDENCIAS_BANCO.md`
// não existem: os mesmos sete pontos de entrada de `services/caregiver.ts`,
// com dados de exemplo em memória (somem ao recarregar a página). Nada é
// enviado, gravado nem lido do Supabase. Só é carregado quando
// `CAREGIVER_DEMO_ENABLED` (`lib/features.ts`) está ligado, que é falso no
// build.
//
// Para ver os desvios sem plano de teste:
// - e-mail com "usado" (ex.: usado@exemplo.com) → `email_in_use`;
// - celular terminado em 0000 e envio por SMS → `sms_failed` (a conta é criada);
// - nova senha começando com "fraca" → `weak_password` (na troca do primeiro acesso).

const LATENCY_MS = 450;
const TEMPORARY_PASSWORD_VALIDITY_MS = 72 * 60 * 60 * 1000;
const PASSWORD_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';

interface DemoState {
  caregiver: MyCaregiver | null;
  links: CaregiverLink[];
  sequence: number;
}

const state: DemoState = { caregiver: null, links: [], sequence: 0 };

/**
 * Apaga o acompanhante de exemplo. A store da sessão chama na troca de conta,
 * junto com a limpeza do cache: o que uma conta digitou não aparece para outra.
 */
export function resetCaregiverDemo(): void {
  state.caregiver = null;
  state.links = [];
  state.sequence = 0;
}

function wait(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, LATENCY_MS));
}

function fail(code: CaregiverErrorCode): never {
  throw new CaregiverError(MESSAGES[code], code);
}

function generatePassword(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  return Array.from(bytes, (byte) => PASSWORD_ALPHABET[byte % PASSWORD_ALPHABET.length]).join('');
}

function newExpiry(): string {
  return new Date(Date.now() + TEMPORARY_PASSWORD_VALIDITY_MS).toISOString();
}

function requireCaregiver(): MyCaregiver {
  if (!state.caregiver) fail('no_active_caregiver');
  return state.caregiver;
}

/** O que o servidor devolve depois de criar a conta ou gerar outra senha. */
function accessFor(caregiver: MyCaregiver, delivery: CaregiverDelivery): CaregiverAccess {
  return {
    caregiverAccountId: caregiver.caregiverAccountId,
    // No SMS o servidor manda a senha e o app nunca a vê: igual ao contrato.
    temporaryPassword: delivery === 'whatsapp' ? generatePassword() : null,
    expiresAt: caregiver.temporaryPasswordExpiresAt ?? newExpiry(),
  };
}

function smsFailure(caregiver: MyCaregiver): CaregiverError {
  return new CaregiverError(MESSAGES.sms_failed, 'sms_failed', {
    caregiverAccountId: caregiver.caregiverAccountId,
    expiresAt: caregiver.temporaryPasswordExpiresAt,
  });
}

export async function createCaregiver(input: CreateCaregiverInput): Promise<CaregiverAccess> {
  await wait();

  if (state.caregiver) fail('caregiver_already_active');
  if (input.email.toLowerCase().includes('usado')) fail('email_in_use');

  state.sequence += 1;
  const caregiver: MyCaregiver = {
    caregiverAccountId: `demo-caregiver-${state.sequence}`,
    fullName: input.fullName.trim(),
    phone: input.phone,
    email: input.email.trim().toLowerCase(),
    linkedAt: new Date().toISOString(),
    passwordIsTemporary: true,
    temporaryPasswordExpiresAt: newExpiry(),
  };
  state.caregiver = caregiver;
  state.links = [
    { id: `demo-link-${state.sequence}`, status: 'active', grantedAt: caregiver.linkedAt, revokedAt: null },
    ...state.links,
  ];

  if (input.delivery === 'sms' && input.phone.endsWith('0000')) throw smsFailure(caregiver);

  return accessFor(caregiver, input.delivery);
}

export async function resetCaregiverPassword({ delivery }: ResetCaregiverPasswordInput): Promise<CaregiverAccess> {
  await wait();

  const caregiver = requireCaregiver();
  if (!caregiver.passwordIsTemporary) fail('not_first_login');

  state.caregiver = { ...caregiver, temporaryPasswordExpiresAt: newExpiry() };
  if (delivery === 'sms' && caregiver.phone.endsWith('0000')) throw smsFailure(state.caregiver);

  return accessFor(state.caregiver, delivery);
}

export async function updateCaregiver(input: UpdateCaregiverInput): Promise<void> {
  await wait();

  const caregiver = requireCaregiver();
  state.caregiver = { ...caregiver, fullName: input.fullName.trim(), phone: input.phone };
}

/**
 * Na demonstração, quem troca a senha é o próprio acompanhante da simulação: a
 * situação passa a "Ativo". Vale para quem abre `/trocar-senha`.
 */
export async function completeFirstPassword(password: string): Promise<void> {
  await wait();

  if (password.toLowerCase().startsWith('fraca')) fail('weak_password');

  if (state.caregiver) state.caregiver = { ...state.caregiver, passwordIsTemporary: false, temporaryPasswordExpiresAt: null };
}

export async function getMyCaregiver(): Promise<MyCaregiver | null> {
  await wait();
  return state.caregiver ? { ...state.caregiver } : null;
}

export async function getCaregiverLinks(): Promise<CaregiverLink[]> {
  await wait();
  return state.links.map((link) => ({ ...link }));
}

export async function revokeCaregiverLink(linkId: string): Promise<void> {
  await wait();

  const revoked: CaregiverLink['status'] = 'revoked';
  state.links = state.links.map((link) =>
    link.id === linkId ? { ...link, status: revoked, revokedAt: new Date().toISOString() } : link
  );
  state.caregiver = null;
}
