import styles from './PasswordStrengthMeter.module.css';

const SCORE_COLORS = {
  1: 'var(--color-destructive)',
  2: 'var(--color-mood-3)',
  3: 'var(--color-mood-1)',
  4: 'var(--color-primary)',
};

function calcularForcaSenha(password) {
  if (password.length === 0) return 0;
  if (password.length < 8) return 1;

  let score = 1;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score += 1;
  if (/\d/.test(password)) score += 1;
  if (/[^A-Za-z0-9]/.test(password)) score += 1;

  return score;
}

export default function PasswordStrengthMeter({ password = '' }) {
  const score = calcularForcaSenha(password);
  const fillColor = SCORE_COLORS[score];

  return (
    <div className={styles.strengthMeter} aria-hidden="true">
      {[0, 1, 2, 3].map((index) => (
        <span
          key={index}
          className={styles.strengthBar}
          style={index < score ? { backgroundColor: fillColor } : undefined}
        />
      ))}
    </div>
  );
}
