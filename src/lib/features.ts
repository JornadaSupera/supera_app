// As páginas do app nas lojas. Fixas aqui, e não no `.env` (02/10): são
// públicas e iguais em todo ambiente. O `.env` fica fora do git e só vale na
// máquina que gera o pacote — esquecido no Mac, o iPhone ficava sem a tela de
// versão nova, sem erro nenhum.

/**
 * O Apple ID do app, o número no fim do endereço da App Store. É com ele que
 * a tela de versão nova abre a página do app no iPhone.
 */
export const APP_STORE_ID = '6810874024';

/** Onde baixar o app. Os dois entram na mensagem enviada ao acompanhante. */
export const APP_STORE_URL = `https://apps.apple.com/br/app/jornada-supera/id${APP_STORE_ID}`;
export const PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=br.com.oncologiasc.jornadasupera';
