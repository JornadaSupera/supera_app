import { useEffect, useId } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { PencilLine } from 'lucide-react';
import { cn } from '@/lib/utils';
import Modal from '../../components/ui/modal';
import Button from '../../components/ui/button';
import Tag from '../../components/ui/tag';
import Textarea from '../../components/ui/textarea';
import { rectificationRequestSchema, type RectificationRequestFormValues } from '../../schemas/dataSubject';
import {
  RECTIFICATION_DESCRIPTION_MAX_LENGTH,
  RECTIFICATION_FIELDS,
  RECTIFICATION_FIELD_LABELS,
  buildRectificationNote,
} from '../../utils/dataSubject';

const FORM_ID = 'rectification-request-form';

const EMPTY_FORM: RectificationRequestFormValues = { fields: [], description: '' };

interface RectificationRequestSheetProps {
  open: boolean;
  /** O pedido está indo ao banco: o botão espera e não aceita outro toque. */
  loading: boolean;
  /** Recebe o texto pronto para o painel: os dados marcados e o que a pessoa escreveu. */
  onSubmit: (note: string) => void;
  onClose: () => void;
}

/**
 * Pedido de correção com o que corrigir: a pessoa marca quais dados estão
 * errados e conta como devem ficar, e o texto chega ao painel junto com o
 * pedido. Só abre quando o banco já guarda esse texto (item [34]); antes
 * disso, o Perfil segue com a confirmação simples.
 */
export default function RectificationRequestSheet({ open, loading, onSubmit, onClose }: RectificationRequestSheetProps) {
  const fieldsLabelId = useId();
  const fieldsErrorId = useId();
  const descriptionId = useId();
  const counterId = useId();
  const descriptionErrorId = useId();

  const {
    control,
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors },
  } = useForm<RectificationRequestFormValues>({
    resolver: zodResolver(rectificationRequestSchema),
    defaultValues: EMPTY_FORM,
  });

  // Cada abertura começa do zero: o texto pode trazer dado pessoal (o celular
  // certo, o CPF) e não deve reaparecer para quem abrir a folha depois.
  useEffect(() => {
    if (open) reset(EMPTY_FORM);
  }, [open, reset]);

  const description = watch('description') ?? '';

  function submit(values: RectificationRequestFormValues) {
    if (loading) return;
    onSubmit(buildRectificationNote(values.fields, values.description));
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Pedir correção"
      titleIcon={PencilLine}
      footer={
        <Button type="submit" form={FORM_ID} variant="primary" fullWidth loading={loading} disabled={loading}>
          Enviar pedido
        </Button>
      }
    >
      {/* Os espaços são `gap`: o reset de `index.css` zera a margem de `<p>`.
          Entre os blocos, os 24 px do guia. */}
      <form id={FORM_ID} className="flex flex-col gap-6" onSubmit={handleSubmit(submit)} noValidate>
        <p className="text-body-sm text-muted-foreground">
          Diga o que está errado e como deve ficar. A equipe do Centro analisa e corrige o seu cadastro.
        </p>

        <div
          role="group"
          aria-labelledby={fieldsLabelId}
          aria-describedby={errors.fields ? fieldsErrorId : undefined}
          className="flex flex-col gap-3"
        >
          <span id={fieldsLabelId} className="text-label font-semibold text-foreground">
            Quais dados estão errados?
          </span>
          <Controller
            control={control}
            name="fields"
            render={({ field }) => (
              // O chip do guia tem 40px, e a faixa de toque dele, 4px acima e
              // abaixo (48px no total). O vão de 8px entre as linhas, o dos
              // grupos de chips no guia, deixa as faixas encostadas, sem se
              // sobrepor.
              <div className="flex flex-wrap gap-2">
                {RECTIFICATION_FIELDS.map((item) => {
                  const selected = field.value.includes(item);
                  return (
                    <Tag
                      key={item}
                      selected={selected}
                      onClick={() =>
                        field.onChange(
                          selected ? field.value.filter((value) => value !== item) : [...field.value, item]
                        )
                      }
                    >
                      {RECTIFICATION_FIELD_LABELS[item]}
                    </Tag>
                  );
                })}
              </div>
            )}
          />
          {errors.fields && (
            <span id={fieldsErrorId} role="alert" className="text-caption font-medium text-destructive">
              {errors.fields.message}
            </span>
          )}
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor={descriptionId} className="text-label font-semibold text-foreground">
            Conte o que precisa ser corrigido
          </label>
          <Textarea
            id={descriptionId}
            className={cn('mt-1 min-h-[120px]', errors.description && 'border-destructive')}
            maxLength={RECTIFICATION_DESCRIPTION_MAX_LENGTH}
            placeholder="Ex.: meu celular mudou para (49) 9 9999-9999."
            aria-describedby={errors.description ? `${counterId} ${descriptionErrorId}` : counterId}
            aria-invalid={errors.description ? true : undefined}
            {...register('description')}
          />
          <span id={counterId} className="self-end text-caption font-medium text-muted-foreground">
            {description.length}/{RECTIFICATION_DESCRIPTION_MAX_LENGTH}
          </span>
          {errors.description && (
            <span id={descriptionErrorId} role="alert" className="text-caption font-medium text-destructive">
              {errors.description.message}
            </span>
          )}
        </div>
      </form>
    </Modal>
  );
}
