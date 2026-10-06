import { useRef, useState, type CSSProperties } from 'react';
import { Camera, Loader2, Trash2 } from 'lucide-react';
import { cva } from 'class-variance-authority';
import { cn } from '@/lib/utils';
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

/**
 * Onde a foto está: num cartão branco (o "Meu vínculo" do acompanhante) ou
 * sobre a capa verde do Perfil. Na capa ela é pequena, na linha do logotipo
 * (como o alto da Início): o anel e o botão da câmera ficam claros, e remover
 * e enviar viram só ícone ao lado dela — o primário sumiria no verde, e o
 * texto não cabe na linha.
 */
type PhotoSurface = 'card' | 'cover';

const avatarVariants = cva('', {
  variants: {
    surface: {
      card: '',
      cover:
        'h-12 w-12 text-body shadow-[0_0_0_2px_color-mix(in_srgb,var(--color-on-brand-cover)_40%,transparent)]',
    },
  },
});

const photoSpacingVariants = cva('', {
  variants: { surface: { card: 'mb-2', cover: '' } },
});

const cameraBadgeVariants = cva(
  'absolute -right-1 -bottom-1 inline-flex items-center justify-center rounded-full border-2',
  {
    variants: {
      surface: {
        card: 'h-7 w-7 border-card bg-primary text-primary-foreground',
        cover:
          'h-6 w-6 border-[var(--color-brand-cover)] bg-[var(--color-on-brand-cover)] text-[var(--color-brand-cover)]',
      },
    },
  }
);

const photoTextVariants = cva('text-caption font-medium', {
  variants: {
    surface: { card: 'text-muted-foreground', cover: 'text-[var(--color-on-brand-cover)]' },
  },
});

const removeButtonVariants = cva('inline-flex cursor-pointer items-center border-none p-0', {
  variants: {
    surface: {
      // No cartão, o link do guia: o verde escuro de texto e o rótulo do botão
      // pequeno (`text-label` em seminegrito), com 48 px de toque. O cinza
      // de apoio fazia a ação parecer só uma legenda.
      card: 'min-h-12 gap-2 bg-transparent text-label font-semibold text-primary-deep hover:underline',
      // Na capa, um círculo de 40px no tom de baixo da capa, com o anel claro
      // por dentro, como o "voltar" da Central; o `after` leva o toque a 48px
      // (40 + 4 + 4). Cabe em 320px: logotipo de 144 + 16 + foto de 48 + 12
      // + 40 = 260, abaixo dos 288 da linha.
      cover:
        'relative size-10 justify-center rounded-full bg-[var(--color-brand-cover-deep)] text-[var(--color-on-brand-cover)] ring-1 ring-[color-mix(in_srgb,var(--color-on-brand-cover)_22%,transparent)] ring-inset after:absolute after:-inset-1',
    },
  },
});

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
  /** Cartão branco (padrão) ou a capa verde do Perfil. */
  surface?: PhotoSurface;
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
export default function ProfilePhoto({ name, canEdit, showPhoto = true, surface = 'card' }: ProfilePhotoProps) {
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

  // No cartão, o anel vem do `ring` do Avatar (cor do primário); na capa, da
  // própria classe da variante, claro.
  const isCard = surface === 'card';
  const statusText = update.isPending ? 'Enviando sua foto…' : 'Removendo sua foto…';
  const photo = (
    <Avatar
      src={photoUrl ?? undefined}
      name={name}
      alt=""
      size="xl"
      ring={isCard}
      className={avatarVariants({ surface })}
      style={isCard ? RING_STYLE : undefined}
    />
  );

  if (!canEdit) return <span className={cn('inline-flex', photoSpacingVariants({ surface }))}>{photo}</span>;

  return (
    <>
      <div className={cn('relative', photoSpacingVariants({ surface }))}>
        {/* A foto e o botão são o mesmo alvo: tocar na foto abre a escolha. */}
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          aria-label={photoUrl ? 'Trocar foto de perfil' : 'Adicionar foto de perfil'}
          className="relative cursor-pointer rounded-full border-none bg-transparent p-0 disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-ring)]"
        >
          {photo}
          <span aria-hidden="true" className={cameraBadgeVariants({ surface })}>
            <Camera size={isCard ? 13 : 12} strokeWidth={2.25} />
          </span>
        </button>

        {/* Fora do foco e do leitor de tela: quem abre o seletor é o botão da
            foto, que já tem nome ("Adicionar foto de perfil"). Sem isto o campo
            escondido era uma segunda parada de foco, sem nome nenhum. */}
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED_TYPES}
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(event) => {
            const file = event.target.files?.[0];
            // Zera o campo para escolher o MESMO arquivo de novo disparar o
            // evento (depois de uma falha, por exemplo).
            event.target.value = '';
            void handlePick(file);
          }}
        />
      </div>

      {/* Na capa, ao lado da foto, só o ícone: o texto vai para o leitor de
          tela e para o nome do botão. */}
      {busy && (
        <p role="status" className={cn('inline-flex items-center', photoTextVariants({ surface }))}>
          {isCard ? (
            statusText
          ) : (
            <>
              <Loader2 size={20} strokeWidth={2} className="animate-spin" aria-hidden="true" />
              <span className="sr-only">{statusText}</span>
            </>
          )}
        </p>
      )}

      {photoUrl && !busy && (
        <button
          type="button"
          onClick={() => setConfirmingRemoval(true)}
          className={removeButtonVariants({ surface })}
        >
          {/* 20 px, o ícone do botão pequeno; na capa, só o ícone, com os 24 px
              do guia para ícone solto. */}
          <Trash2 size={isCard ? 20 : 24} strokeWidth={2} aria-hidden="true" />
          <span className={cn(!isCard && 'sr-only')}>Remover foto</span>
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
