/**
 * Verificação do celular por SMS no cadastro.
 *
 * Desligada por padrão. A tela e as chamadas já existem; o que falta está do
 * lado do banco e do provedor de SMS (envio do código e a função que liga a
 * conta à ficha). Quando isso estiver no ar, basta `VITE_PHONE_VERIFICATION=true`
 * no `.env` do build — sem mexer no código.
 *
 * Desligada, depois de criar a conta a pessoa digita o código de ativação que
 * a recepção gera no painel; quem ainda não o tem fica na tela de espera e
 * digita depois, em `/confirmar-cadastro`.
 */
export const PHONE_VERIFICATION_ENABLED = import.meta.env.VITE_PHONE_VERIFICATION === 'true';
