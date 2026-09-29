// Erro que sai da camada de serviços com duas informações, e não só uma.
//
// A mensagem continua em português e pronta para a tela mostrar. O que faltava
// era o código do servidor: sem ele, "sem permissão" e "sem conexão" chegavam
// iguais, e a nova tentativa automática repetia falhas que nunca iam mudar de
// resposta — só atrasando a tela de erro.

/** O servidor não respondeu: rede caiu, aparelho offline, servidor fora do ar. */
const NETWORK_CODE = 'network';

/** O erro nasceu aqui, antes de qualquer ida ao servidor (validação, configuração). */
const APP_CODE = 'app';

/**
 * Códigos do Postgres que valem uma segunda tentativa: são estados
 * momentâneos do servidor, não recusas.
 */
const TRANSIENT_CODES = new Set([
  '08000', // connection_exception
  '08003', // connection_does_not_exist
  '08006', // connection_failure
  '40001', // serialization_failure
  '40P01', // deadlock_detected
  '53300', // too_many_connections
  '57014', // query_canceled (tempo limite)
]);

export class AppError extends Error {
  /**
   * `network`, `app` ou o código que o servidor devolveu — Postgres
   * (`42501`, `23505`), PostgREST (`PGRST202`), Auth (`invalid_credentials`)
   * ou o status do Storage (`404`).
   */
  readonly code: string;

  constructor(message: string, code: string, cause?: unknown) {
    super(message, { cause });
    this.name = 'AppError';
    this.code = code;
  }
}

/**
 * Descobre o código do erro cru. Cada camada do Supabase devolve um formato:
 * PostgREST usa `code` (e o deixa vazio quando o fetch nem saiu), o Auth usa
 * `code` mais `status` (`0` é falha de rede), o Storage usa `statusCode`.
 */
function readCode(cause: unknown): string {
  if (!cause || typeof cause !== 'object') return APP_CODE;

  const bruto = cause as { code?: unknown; status?: unknown; statusCode?: unknown; name?: unknown };

  if (bruto.name === 'AuthRetryableFetchError') return NETWORK_CODE;

  const code = typeof bruto.code === 'string' ? bruto.code.trim() : '';
  if (code) return code;

  const statusCode = typeof bruto.statusCode === 'string' ? bruto.statusCode.trim() : '';
  if (statusCode) return statusCode;

  if (typeof bruto.status === 'number' && bruto.status > 0) return String(bruto.status);

  // Sem código nenhum: o pedido não chegou a ter resposta.
  return NETWORK_CODE;
}

/**
 * Monta o erro da tela guardando o código de quem o causou.
 *
 * Sem `cause`, o erro é nosso (validação, configuração) e não se repete
 * sozinho.
 */
export function appError(message: string, cause?: unknown): AppError {
  return new AppError(message, cause === undefined ? APP_CODE : readCode(cause), cause);
}

/**
 * Vale tentar de novo? Só quando a causa é momentânea: rede, servidor
 * indisponível ou conflito de concorrência. Permissão negada, violação de
 * regra e função inexistente respondem igual na segunda vez.
 */
export function isTransientError(error: unknown): boolean {
  if (!(error instanceof AppError)) return false;
  if (error.code === NETWORK_CODE) return true;
  if (TRANSIENT_CODES.has(error.code)) return true;

  // 5xx: o servidor recebeu e falhou — diferente de recusar.
  return /^5\d\d$/.test(error.code);
}
