import { useRef, useState, type CSSProperties } from 'react';
import { Camera, Trash2 } from 'lucide-react';
import Avatar from '../../components/ui/avatar';
import ConfirmDialog from '../../components/ui/confirm-dialog';
import { useMyAvatar, useRemoveMyAvatar, useUpdateMyAvatar } from '../../hooks/useAvatar';
import { describeMutationError } from '../../hooks/useAuth';
import { useToast } from '../../contexts/ToastContext';

/** O que o bucket `avatars` aceita. O mesmo filtro está no serviço. */
const ACCEPTED_TYPES = 'image/jpeg,image/png,image/webp';

/** Cor do anel, misturada a partir do primário — não há classe estática para ela. */
const RING_STYLE = {
  '--avatar-ring-color': 'color-mix(in srgb, var(--color-primary) 20%, transparent)',
} as CSSProperties;

interface ProfilePhotoProps {
  /** Nome de quem está logado, para as iniciais do fallback. */
  name: string;
  /**
   * A sessão é do titular? Só ele troca a própria foto.
   *
   * O acompanhante tem a foto DELE, não a do tutelado — e o banco nem entrega a
   * do tutelado (o bucket é privado por pasta de conta). Mostrar aqui um botão
   * de trocar foto na tela do tutelado prometeria algo que não existe.
   */
  canEdit: boolean;
  /**
   * Mostrar a foto da conta logada?
   *
   * `false` na sessão do acompanhante: a tela é a ficha do tutelado, e a foto
   * assinada é a da conta de quem está logado — o bucket é privado por pasta de
   * conta, e não existe a foto do tutelado para ele. Desenhá-la aqui a poria
   * logo acima do nome de outra pessoa.
   */
  showPhoto?: boolean;
}

/**
 * A foto de perfil: mostra a atual (ou as iniciais) e, para o titular, deixa
 * trocá-la e removê-la.
 *
 * A imagem é recortada e reduzida no aparelho antes de subir (`services/avatar`)
 * — o bucket aceita 5 MiB e a foto de um celular atual passa disso. `<input
 * type="file">` nativo, como o anexo do chat: no celular ele já abre a câmera
 * ou a galeria, e não há plugin novo a aprovar.
 */
export default function ProfilePhoto({ name, canEdit, showPhoto = true }: ProfilePhotoProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const { showToast } = useToast();
  const [confirmingRemoval, setConfirmingRemoval] = useState(false);

  const { data: avatarUrl } = useMyAvatar();
  const photoUrl = showPhoto ? avatarUrl : null;
  const update = useUpdateMyAvatar();
  const remove = useRemoveMyAvatar();

  const busy = update.isPending || remove.isPending;

  async function handlePick(file: File | undefined) {
    if (!file) return;

    try {
      await update.mutateAsync(file);
      showToast('Foto atualizada.', { variant: 'success' });
    } catch (error) {
      showToast(describeMutationError(error, 'Não foi possível atualizar sua foto.'), { variant: 'error' });
    }
  }

  async function handleRemove() {
    try {
      await remove.mutateAsync();
      showToast('Foto removida.', { variant: 'success' });
    } catch (error) {
      showToast(describeMutationError(error, 'Não foi possível remover sua foto.'), { variant: 'error' });
    } finally {
      setConfirmingRemoval(false);
    }
  }

  const avatar = (
    <Avatar src={photoUrl ?? undefined} name={name} alt="" size="xl" ring className="mb-2" style={RING_STYLE} />
  );

  if (!canEdit) return avatar;

  return (
    <>
      <div className="relative mb-2">
        {/* A foto e o botão são o mesmo alvo: tocar na foto abre a escolha. */}
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          aria-label={photoUrl ? 'Trocar foto de perfil' : 'Adicionar foto de perfil'}
          className="relative cursor-pointer rounded-full border-none bg-transparent p-0 disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-ring)]"
        >
          <Avatar src={photoUrl ?? undefined} name={name} alt="" size="xl" ring style={RING_STYLE} />
          <span
            aria-hidden="true"
            className="absolute -right-1 -bottom-1 inline-flex h-7 w-7 items-center justify-center rounded-full border-2 border-card bg-primary text-primary-foreground"
          >
            <Camera size={13} strokeWidth={2.25} />
          </span>
        </button>

        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED_TYPES}
          className="sr-only"
          onChange={(event) => {
            const file = event.target.files?.[0];
            // Zera o campo para escolher o MESMO arquivo de novo disparar o
            // evento (depois de uma falha, por exemplo).
            event.target.value = '';
            void handlePick(file);
          }}
        />
      </div>

      {busy && (
        <p role="status" className="text-[12px] text-muted-foreground">
          {update.isPending ? 'Enviando sua foto…' : 'Removendo sua foto…'}
        </p>
      )}

      {photoUrl && !busy && (
        <button
          type="button"
          onClick={() => setConfirmingRemoval(true)}
          className="inline-flex min-h-[44px] cursor-pointer items-center gap-1.5 border-none bg-transparent p-0 text-[12px] text-muted-foreground hover:underline"
        >
          <Trash2 size={13} strokeWidth={2} aria-hidden="true" />
          Remover foto
        </button>
      )}

      <ConfirmDialog
        open={confirmingRemoval}
        title="Remover sua foto?"
        description="Seu perfil volta a mostrar as suas iniciais. Você pode adicionar outra foto quando quiser."
        confirmLabel="Remover foto"
        destructive
        titleIcon={Trash2}
        loading={remove.isPending}
        onConfirm={() => void handleRemove()}
        onCancel={() => setConfirmingRemoval(false)}
      />
    </>
  );
}
