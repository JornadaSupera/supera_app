import Avatar from '../../components/Avatar';
import styles from './GreetingHeader.module.css';

function getSaudacao() {
  const hora = new Date().getHours();

  if (hora >= 5 && hora <= 11) return 'Bom dia,';
  if (hora >= 12 && hora <= 17) return 'Boa tarde,';
  return 'Boa noite,';
}

function getPrimeiroNome(nome = '') {
  return nome.trim().split(/\s+/)[0] || '';
}

export default function GreetingHeader({ nome, fotoUrl }) {
  const saudacao = getSaudacao();
  const primeiroNome = getPrimeiroNome(nome);

  return (
    <header className={styles.header}>
      <div className={styles.textos}>
        <p className={styles.saudacao}>{saudacao}</p>
        <h1 className={styles.nome}>{primeiroNome} 👋</h1>
      </div>

      <Avatar src={fotoUrl} name={nome} size="lg" />
    </header>
  );
}
