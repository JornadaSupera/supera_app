import styles from './Spinner.module.css';

const SIZES = { sm: 14, md: 20, lg: 28 };

export default function Spinner({ size = 'md', className = '' }) {
  const px = typeof size === 'number' ? size : SIZES[size] || SIZES.md;
  return (
    <span
      className={`${styles.spinner} ${className}`}
      style={{ width: px, height: px }}
      role="status"
      aria-label="Carregando"
    />
  );
}
