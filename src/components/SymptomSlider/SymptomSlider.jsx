import { getMoodInfo } from '../../utils/mood';
import { cx } from '../../utils/classNames';
import styles from './SymptomSlider.module.css';

const INTENSIDADE_SINTOMA_LABELS = ['Não senti', 'Mal noto', 'Leve', 'Moderado', 'Forte', 'Insuportável'];

export default function SymptomSlider({ nome, descricao, value = 0, onChange, className = '' }) {
  const ativo = value > 0;
  const mood = getMoodInfo(value);
  const label = INTENSIDADE_SINTOMA_LABELS[value];
  const percent = (value / 5) * 100;

  return (
    <div
      className={cx(styles.slider, ativo && styles.active, className)}
      style={{ '--slider-color': mood.colorVar, '--slider-percent': `${percent}%` }}
    >
      <div className={styles.header}>
        <div>
          <p className={styles.nome}>{nome}</p>
          {descricao && <p className={styles.descricao}>{descricao}</p>}
        </div>
        <span className={styles.value} style={ativo ? { color: mood.colorVar } : undefined}>
          {label}
        </span>
      </div>

      <input
        type="range"
        min={0}
        max={5}
        step={1}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className={styles.range}
        aria-label={`Intensidade de ${nome}: ${label}`}
      />

      <div className={styles.ticks} aria-hidden="true">
        <span>0</span>
        <span>1</span>
        <span>2</span>
        <span>3</span>
        <span>4</span>
        <span>5</span>
      </div>
    </div>
  );
}
