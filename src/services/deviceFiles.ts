import { Capacitor } from '@capacitor/core';
import { appError } from '../lib/appError';

// Gravação de um arquivo já baixado no aparelho de quem usa o app.
//
// Na web, o navegador resolve sozinho: âncora com `download` apontando para um
// object URL. No app nativo isso não funciona — a WebView do Capacitor não tem
// pasta de downloads, e o clique simplesmente não faz nada. Lá o arquivo
// precisa ser escrito em disco e entregue a outro app.
//
// A pasta é `Documents`, e não cache: o conteúdo é material educativo que o
// paciente deve poder reler **offline**, inclusive depois de o sistema limpar
// cache. No iOS ela aparece no app Arquivos (ver `UIFileSharingEnabled` e
// `LSSupportsOpeningDocumentsInPlace` no `Info.plist`); no Android é a pasta
// pública de documentos, alcançável por qualquer gerenciador de arquivos.
//
// Nada de dado clínico passa por aqui: o único uso é o anexo publicado pela
// clínica em `content-attachments`, que é conteúdo educativo, não PHI.

type FilesystemModule = typeof import('@capacitor/filesystem');
type ShareModule = typeof import('@capacitor/share');

// Mesmo motivo do SDK do OneSignal (ver `pushNotifications.ts`): fora do
// nativo os dois plugins só ocupariam o pacote da web. O `import()` depois do
// guard de `isNativePlatform()` os deixa fora do chunk inicial do navegador, e
// a promessa guardada garante que cada módulo seja carregado uma única vez.
let filesystemModulePromise: Promise<FilesystemModule> | null = null;
let shareModulePromise: Promise<ShareModule> | null = null;

function loadFilesystem(): Promise<FilesystemModule> {
  if (!filesystemModulePromise) {
    filesystemModulePromise = import('@capacitor/filesystem');
  }
  return filesystemModulePromise;
}

function loadShare(): Promise<ShareModule> {
  if (!shareModulePromise) {
    shareModulePromise = import('@capacitor/share');
  }
  return shareModulePromise;
}

/**
 * O que aconteceu com o arquivo — a tela usa isto para decidir se ainda
 * precisa dizer alguma coisa.
 *
 * `saved` é o caso em que o arquivo está no aparelho mas ninguém o abriu (não
 * há app capaz de receber, ou a pessoa fechou a folha de compartilhamento).
 * Sem esse aviso o toque no botão pareceria não ter feito nada.
 */
export type SaveFileOutcome = 'downloaded' | 'opened' | 'saved';

export interface SaveAndOpenFileInput {
  blob: Blob;
  /** Já sanitizado por `buildDownloadFileName` — vira caminho em disco. */
  fileName: string;
  /** Título da folha de compartilhamento. Só o Android mostra. */
  dialogTitle?: string;
}

/**
 * Converte o corpo baixado em base64.
 *
 * `Filesystem.writeFile` só aceita `Blob` na implementação web; no nativo o
 * conteúdo binário tem que chegar em base64, senão o plugin recusa.
 */
function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onerror = () => reject(appError('Não foi possível ler o arquivo baixado.'));
    reader.onload = () => {
      const resultado = typeof reader.result === 'string' ? reader.result : '';
      // `readAsDataURL` devolve `data:<mime>;base64,<conteúdo>` e o plugin
      // quer só o conteúdo.
      const separador = resultado.indexOf(',');

      if (separador < 0) {
        reject(appError('Não foi possível ler o arquivo baixado.'));
        return;
      }

      resolve(resultado.slice(separador + 1));
    };

    reader.readAsDataURL(blob);
  });
}

/** Caminho da web: âncora invisível com object URL. */
function downloadInBrowser(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Grava o arquivo no aparelho e oferece abri-lo em outro app.
 *
 * @throws {AppError} Quando a gravação falha — sem permissão de armazenamento
 * (Android 10 e anteriores), disco cheio ou conteúdo ilegível. Falha do
 * compartilhamento NÃO lança: o arquivo já está salvo, e o retorno `saved`
 * diz à tela para explicar onde ele foi parar.
 */
export async function saveAndOpenFile({
  blob,
  fileName,
  dialogTitle,
}: SaveAndOpenFileInput): Promise<SaveFileOutcome> {
  if (!Capacitor.isNativePlatform()) {
    downloadInBrowser(blob, fileName);
    return 'downloaded';
  }

  const { Filesystem, Directory } = await loadFilesystem();
  const base64 = await blobToBase64(blob);

  let uri: string;

  try {
    // `recursive` cria a pasta de documentos quando ela ainda não existe —
    // num Android recém-formatado ela pode não existir.
    ({ uri } = await Filesystem.writeFile({
      path: fileName,
      data: base64,
      directory: Directory.Documents,
      recursive: true,
    }));
  } catch {
    // Sem repassar a causa de propósito: o erro do plugin não carrega código,
    // e `appError` classificaria como falha de rede uma recusa que nunca saiu
    // do aparelho — o que faria a nova tentativa automática insistir à toa.
    throw appError('Não foi possível salvar o arquivo no aparelho.');
  }

  try {
    const { Share } = await loadShare();
    const { value: podeCompartilhar } = await Share.canShare();

    if (!podeCompartilhar) return 'saved';

    await Share.share({ title: fileName, files: [uri], dialogTitle });
    return 'opened';
  } catch {
    // A recusa mais comum aqui é a pessoa fechar a folha de compartilhamento
    // (o plugin recusa com "Share canceled" nos dois sistemas) — cancelamento
    // não é erro. E mesmo numa falha real do compartilhamento o arquivo já
    // está gravado, então o que falta é dizer onde ele está, não pedir para
    // tentar de novo.
    return 'saved';
  }
}
