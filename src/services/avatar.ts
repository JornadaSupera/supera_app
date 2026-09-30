import { appError } from '../lib/appError';
import { requireSupabase } from './supabaseClient';

// Foto de perfil do paciente — bucket `avatars` e `accounts.avatar_path`
// (guia do banco §7, entregue em 25/09/2026).
//
// A FOTO É SÓ DO DONO. O bucket é privado e a política compara o primeiro
// segmento do caminho com `auth.uid()`: nem a equipe vê a do paciente, nem o
// paciente vê a do profissional. Não é falta de tela, é decisão registrada na
// migration — por isso este serviço só sabe ler e gravar a foto de QUEM ESTÁ
// LOGADO, e não aceita um id de conta como argumento.
//
// A ORDEM É INVERSA À DOS ANEXOS, e o guia a define assim de propósito
// (§7, bloco "FOTO"): sobe o arquivo primeiro, grava o caminho depois. Nos
// anexos a política do bucket consulta a LINHA já registrada para decidir quem
// escreve; aqui não há linha a consultar — a permissão sai da pasta, que é a
// própria conta. Registrar antes deixaria `avatar_path` apontando para um
// arquivo que pode nunca existir.

/** O que o bucket aceita (`allowed_mime_types` de `storage.buckets`). */
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

/** Teto do bucket: 5 MiB. O app envia muito abaixo disso — ver `prepareAvatar`. */
const MAX_BYTES = 5 * 1024 * 1024;

/** Lado maior da imagem depois do redimensionamento. Avatar é exibido a 56px. */
const MAX_DIMENSION = 512;

const OUTPUT_TYPE = 'image/jpeg';
const OUTPUT_QUALITY = 0.85;

/** Validade do link assinado. Uma hora cobre a sessão na tela com folga. */
const SIGNED_URL_TTL_SECONDS = 3600;

const BUCKET = 'avatars';

export class AvatarError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AvatarError';
  }
}

/** O arquivo escolhido é uma imagem que o bucket aceita, e cabe nele? */
export function validateAvatarFile(file: File): void {
  if (!ALLOWED_TYPES.includes(file.type as (typeof ALLOWED_TYPES)[number])) {
    throw new AvatarError('Escolha uma imagem JPG, PNG ou WebP.');
  }
  if (file.size > MAX_BYTES) {
    throw new AvatarError('A imagem é grande demais. Escolha uma de até 5 MB.');
  }
}

/**
 * Recorta no centro, reduz para 512px e devolve um JPEG.
 *
 * Existe por três motivos, e nenhum é estética: a foto de um celular atual
 * passa dos 5 MiB do bucket; subir 4 MB para exibir 56px gasta o plano de dados
 * do paciente; e o recorte quadrado evita que o `object-cover` do avatar corte
 * a imagem de um jeito diferente a cada tamanho.
 *
 * Falhar aqui não é erro de rede: `createImageBitmap` pode não existir numa
 * WebView antiga, e nesse caso o arquivo original segue como está — a validação
 * acima já garantiu tipo e tamanho aceitáveis.
 */
async function prepareAvatar(file: File): Promise<Blob> {
  if (typeof createImageBitmap !== 'function') return file;

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new AvatarError('Não foi possível ler esta imagem. Escolha outra.');
  }

  try {
    const side = Math.min(bitmap.width, bitmap.height);
    const sx = (bitmap.width - side) / 2;
    const sy = (bitmap.height - side) / 2;
    const target = Math.min(side, MAX_DIMENSION);

    const canvas = document.createElement('canvas');
    canvas.width = target;
    canvas.height = target;

    const context = canvas.getContext('2d');
    if (!context) return file;

    context.drawImage(bitmap, sx, sy, side, side, 0, 0, target, target);

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, OUTPUT_TYPE, OUTPUT_QUALITY);
    });

    return blob ?? file;
  } finally {
    bitmap.close();
  }
}

/** O id da conta logada. Toda operação aqui é sobre a própria pasta. */
async function currentAccountId(): Promise<string> {
  const {
    data: { user },
    error,
  } = await requireSupabase().auth.getUser();

  if (error || !user) throw appError('Sua sessão expirou. Entre novamente.', error);
  return user.id;
}

/**
 * O caminho da foto do próprio perfil, ou `null`.
 *
 * Leitura direta da própria linha de `accounts` (`accounts_select_own`).
 */
async function getMyAvatarPath(): Promise<string | null> {
  const client = requireSupabase();
  const accountId = await currentAccountId();

  const { data, error } = await client
    .from('accounts')
    .select('avatar_path')
    .eq('id', accountId)
    .maybeSingle();

  if (error) throw appError('Não foi possível carregar sua foto de perfil.', error);
  return data?.avatar_path ?? null;
}

/**
 * Um link temporário para a própria foto, ou `null` quando não há foto.
 *
 * O bucket é privado: não existe URL pública, e só o dono consegue assinar.
 * Um caminho que aponte para arquivo inexistente (a gravação do passo 2 rodou e
 * o arquivo foi removido por fora) devolve `null` em vez de derrubar a tela —
 * perfil sem foto é estado normal.
 */
export async function getMyAvatarUrl(): Promise<string | null> {
  const path = await getMyAvatarPath();
  if (!path) return null;

  const { data, error } = await requireSupabase()
    .storage.from(BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);

  if (error) return null;
  return data?.signedUrl ?? null;
}

/**
 * Troca a foto de perfil.
 *
 * 1. sobe o arquivo na pasta da própria conta;
 * 2. grava o caminho em `accounts.avatar_path` (o único campo da coluna que o
 *    `GRANT UPDATE (avatar_path)` libera — nem `is_active` nem `email` entram);
 * 3. apaga o arquivo anterior, se havia.
 *
 * O passo 3 é o último de propósito: se ele falhar, sobra um arquivo sem
 * referência na pasta do próprio dono — desperdício, não vazamento. Apagar
 * antes deixaria `avatar_path` apontando para o nada caso o passo 2 falhasse.
 *
 * Nome novo a cada troca, em vez de `upsert` sobre um nome fixo: o link
 * assinado e o cache do navegador apontam para o caminho, e reescrever o mesmo
 * arquivo faria o paciente continuar vendo a foto antiga.
 */
export async function updateMyAvatar(file: File): Promise<string> {
  validateAvatarFile(file);

  const client = requireSupabase();
  const accountId = await currentAccountId();
  const previousPath = await getMyAvatarPath();

  const image = await prepareAvatar(file);
  // O tipo REAL do que vai subir. `prepareAvatar` devolve um JPEG quando
  // consegue redimensionar e o arquivo ORIGINAL quando não consegue (WebView
  // sem `createImageBitmap`, canvas indisponível) — e aí ele pode ser PNG ou
  // WebP. Declarar `image/jpeg` sempre gravaria PNG com o tipo errado: o
  // bucket aceita os três, mas o arquivo sairia mentindo sobre si mesmo para
  // quem o baixasse.
  const contentType = ALLOWED_TYPES.includes(image.type as (typeof ALLOWED_TYPES)[number])
    ? image.type
    : OUTPUT_TYPE;
  const extension = contentType === 'image/png' ? 'png' : contentType === 'image/webp' ? 'webp' : 'jpg';

  // `<account_id>/<arquivo>`: é o que a política do bucket e o CHECK
  // `ck_accounts_avatar_path_own_folder` exigem. Sem `..` e bem abaixo dos 200
  // caracteres do CHECK.
  const path = `${accountId}/${crypto.randomUUID()}.${extension}`;

  const upload = await client.storage.from(BUCKET).upload(path, image, {
    contentType,
    upsert: false,
  });

  if (upload.error) throw appError('Não foi possível enviar sua foto. Tente de novo.', upload.error);

  const { error: updateError } = await client
    .from('accounts')
    .update({ avatar_path: path })
    .eq('id', accountId);

  if (updateError) {
    // O arquivo subiu e o caminho não foi gravado: some com ele, para não
    // deixar lixo órfão na pasta.
    await client.storage.from(BUCKET).remove([path]);
    throw appError('Não foi possível salvar sua foto. Tente de novo.', updateError);
  }

  if (previousPath && previousPath !== path) {
    await client.storage.from(BUCKET).remove([previousPath]);
  }

  const { data } = await client.storage.from(BUCKET).createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
  return data?.signedUrl ?? '';
}

/**
 * Remove a foto de perfil.
 *
 * Aqui a ordem é a das remoções do projeto: **o arquivo primeiro, o registro
 * depois**. Se a limpeza da coluna falhar, `avatar_path` fica apontando para um
 * arquivo que não existe — e `getMyAvatarUrl` já trata isso como "sem foto".
 */
export async function removeMyAvatar(): Promise<void> {
  const client = requireSupabase();
  const accountId = await currentAccountId();
  const path = await getMyAvatarPath();

  if (path) {
    const { error } = await client.storage.from(BUCKET).remove([path]);
    if (error) throw appError('Não foi possível remover sua foto. Tente de novo.', error);
  }

  const { error } = await client.from('accounts').update({ avatar_path: null }).eq('id', accountId);
  if (error) throw appError('Não foi possível remover sua foto. Tente de novo.', error);
}
