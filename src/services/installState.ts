import { Capacitor } from '@capacitor/core';
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import { KeychainAccess, SecureStorage } from '@aparajita/capacitor-secure-storage';

// Instalação limpa: apagar o app apaga o acesso.
//
// No iOS, o Keychain SOBREVIVE à exclusão do app. Sem o cuidado daqui, quem
// apagasse e reinstalasse o app voltaria já logado — direto para a Início,
// sem onboarding e sem login —, porque a sessão continuaria no cofre. No
// Android, desinstalar leva o cofre junto (a chave do Keystore some), e o
// manifesto desliga o backup (`allowBackup="false"` e
// `data_extraction_rules.xml`) para nada voltar numa reinstalação.

/**
 * A marca desta instalação. Mora na pasta do app que NÃO entra em backup
 * (`Library/NoCloud` no iOS; no Android, a pasta de arquivos do app, também
 * fora de backup pelo manifesto). Some quando o app é apagado — e é essa
 * ausência que denuncia uma instalação nova. Restaurar um backup num iPhone
 * novo também não a traz, então o cofre migrado é esvaziado do mesmo jeito.
 */
const INSTALL_MARKER = 'install-marker';

let preparation: Promise<void> | null = null;

async function hasInstallMarker(): Promise<boolean> {
  try {
    await Filesystem.stat({ path: INSTALL_MARKER, directory: Directory.LibraryNoCloud });
    return true;
  } catch {
    return false;
  }
}

async function runPreparation(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;

  // O que for gravado daqui em diante fica só neste aparelho: o token não
  // migra num backup criptografado para outro iPhone. Falhar aqui não é
  // grave — a marca de instalação, fora do backup, já esvazia o cofre num
  // aparelho restaurado. No Android a chamada não faz nada.
  await SecureStorage.setDefaultKeychainAccess(KeychainAccess.whenUnlockedThisDeviceOnly).catch(
    () => undefined
  );

  if (await hasInstallMarker()) return;

  // Esvazia ANTES de marcar: se a limpeza falhar, a próxima abertura tenta de
  // novo, em vez de dar por limpa uma instalação que ainda guarda a sessão.
  await SecureStorage.clear();
  await Filesystem.writeFile({
    path: INSTALL_MARKER,
    directory: Directory.LibraryNoCloud,
    data: new Date().toISOString(),
    encoding: Encoding.UTF8,
    recursive: true,
  });
}

/**
 * Deixa o cofre pronto antes da primeira leitura: numa instalação nova,
 * esvazia o que tiver sobrado de uma instalação anterior (sessão, verificador
 * do PKCE) e grava a marca. Na Web não há instalação nem Keychain — nada a
 * fazer.
 *
 * Uma vez por abertura: quem chamar de novo recebe a mesma promessa. Se a
 * limpeza falhar, a promessa rejeita e o cofre fica indisponível nesta
 * abertura — ler devolve "sem sessão" (ver `secureStorage.ts`), que é o estado
 * seguro.
 *
 * Efeito conhecido: na primeira abertura depois da atualização que trouxe esta
 * marca, quem já estava logado precisa entrar de novo, uma vez — sem a marca,
 * o app não tem como distinguir "atualizou" de "apagou e reinstalou".
 */
export function prepareSecureStorage(): Promise<void> {
  if (!preparation) preparation = runPreparation();
  return preparation;
}
