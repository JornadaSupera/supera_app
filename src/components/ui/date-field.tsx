import { useRef, useState, type ChangeEvent, type Ref } from 'react';
import { CalendarDays } from 'lucide-react';
import Input from './input';
import Calendar from './calendar';
import Modal from './modal';
import { applyMask } from '../../utils/maskedInput';
import {
  dateKeyToDisplayDate,
  displayDateToDateKey,
  maskDateInput,
  parseDateOnly,
  toDateKey,
} from '../../utils/date';

export interface DateFieldProps {
  label: string;
  /**
   * `YYYY-MM-DD` quando a data está completa e existe. Enquanto a pessoa
   * digita (ou se a data não existe, como 31/02), o texto como está — o
   * schema recusa o que não for `YYYY-MM-DD`, e o campo não esconde o erro
   * trocando o que foi digitado por vazio.
   */
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  name?: string;
  id?: string;
  error?: string;
  /** Primeiro e último dia escolhíveis, em `YYYY-MM-DD`. */
  minDate?: string;
  maxDate?: string;
  /** Título da folha do calendário. Padrão: o rótulo do campo. */
  pickerTitle?: string;
  /**
   * Ano em que o calendário abre quando ainda não há data. Sem ele abre no
   * mês de hoje; numa data de nascimento isso obrigaria a voltar décadas.
   */
  startYear?: number;
  /** Vai ao `<input>`: é ele que recebe o foco quando o formulário aponta o erro. */
  ref?: Ref<HTMLInputElement>;
}

/**
 * Campo de data em `dd/mm/aaaa` com calendário em português.
 *
 * Tocar no campo (ou no ícone) abre o calendário numa folha — o seletor nativo
 * é traduzido pelo sistema do aparelho e não aceita as cores do app. A data
 * escolhida volta ao campo como `10/10/1999`, e o formulário recebe
 * `YYYY-MM-DD`, o formato que o schema e o banco já esperam.
 *
 * O teclado do celular não abre ao tocar (`inputMode="none"`): quem toca quer o
 * calendário. Com teclado físico o campo continua digitável, com máscara e
 * colagem (`10101999` vira `10/10/1999`); o foco por Tab não abre a folha, só o
 * clique — então quem navega pelo teclado digita e não é interrompido.
 */
export default function DateField({
  label,
  value,
  onChange,
  onBlur,
  name,
  id,
  error,
  minDate,
  maxDate,
  pickerTitle,
  startYear,
  ref,
}: DateFieldProps) {
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const display = dateKeyToDisplayDate(value) || value;
  const selectedKey = displayDateToDateKey(display);
  const selected = selectedKey ? parseDateOnly(selectedKey) : null;

  // A ref de fora (a do formulário) e a de dentro (para devolver o foco ao
  // fechar a folha) apontam para o mesmo `<input>`.
  function setInputRef(node: HTMLInputElement | null) {
    inputRef.current = node;
    if (typeof ref === 'function') ref(node);
    else if (ref) ref.current = node;
  }

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    // A máscara entra no elemento antes de o formulário ler o valor, com o
    // cursor no mesmo dígito (ver `maskedRegister`).
    applyMask(event.target, maskDateInput);
    const masked = event.target.value;
    onChange(displayDateToDateKey(masked) ?? masked);
  }

  function handleBlur() {
    // Abrir a folha tira o foco do campo, mas a pessoa ainda não teve a chance
    // de escolher: validar agora mostraria "informe a data" por cima do
    // calendário que ela acabou de abrir.
    if (!open) onBlur?.();
  }

  function close() {
    setOpen(false);
    inputRef.current?.focus({ preventScroll: true });
  }

  function handleSelect(date: Date) {
    onChange(toDateKey(date));
    close();
    // Escolher é sair do campo: marca como visitado e valida a data escolhida
    // (a idade mínima, por exemplo), sem esperar o próximo toque fora.
    onBlur?.();
  }

  return (
    <>
      <Input
        ref={setInputRef}
        label={label}
        id={id}
        name={name}
        value={display}
        onChange={handleChange}
        onBlur={handleBlur}
        onClick={() => setOpen(true)}
        error={error}
        type="text"
        inputMode="none"
        autoComplete="off"
        placeholder="dd/mm/aaaa"
        maxLength={10}
        aria-haspopup="dialog"
        inputClassName="cursor-pointer"
        rightSlot={
          <button
            type="button"
            aria-label="Abrir calendário"
            aria-haspopup="dialog"
            aria-expanded={open}
            onClick={() => setOpen(true)}
            className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-full border-none bg-transparent text-primary transition-colors duration-150 ease-[ease] hover:bg-muted"
          >
            <CalendarDays size={20} strokeWidth={1.75} aria-hidden="true" />
          </button>
        }
      />

      <Modal open={open} onClose={close} title={pickerTitle ?? label} titleIcon={CalendarDays}>
        <Calendar
          // O indicador de início do iPhone não pode cobrir a última semana.
          className="pb-[var(--safe-bottom)]"
          autoFocus
          selected={selected}
          onSelect={handleSelect}
          defaultMonth={startYear ? new Date(startYear, 0, 1) : undefined}
          startView={selected || !startYear ? 'days' : 'years'}
          minDate={minDate ? parseDateOnly(minDate) : undefined}
          maxDate={maxDate ? parseDateOnly(maxDate) : undefined}
        />
      </Modal>
    </>
  );
}
