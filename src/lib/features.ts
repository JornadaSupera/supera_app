/**
 * Verificação do celular por SMS no cadastro.
 *
 * Desligada por padrão. A tela e as chamadas já existem; o que falta está do
 * lado do banco e do provedor de SMS (envio do código e a função que liga a
 * conta à ficha). Quando isso estiver no ar, basta `VITE_PHONE_VERIFICATION=true`
 * no `.env` do build — sem mexer no código.
 *
 * Desligada, o cadastro termina na criação da conta e a pessoa aguarda a
 * clínica concluir o cadastro de paciente pelo painel.
 */
export const PHONE_VERIFICATION_ENABLED = import.meta.env.VITE_PHONE_VERIFICATION === 'true';
