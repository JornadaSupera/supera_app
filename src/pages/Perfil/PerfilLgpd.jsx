import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldCheck } from 'lucide-react';
import Header from '../../components/Header';
import Card from '../../components/Card';
import Button from '../../components/Button';
import { solicitarExportacaoDados, solicitarExclusaoConta } from '../../services/mockApi';
import { useToast } from '../../contexts/ToastContext';
import styles from './PerfilLgpd.module.css';

export default function PerfilLgpd() {
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [exportando, setExportando] = useState(false);
  const [excluindo, setExcluindo] = useState(false);

  async function handleExportar() {
    setExportando(true);
    try {
      await solicitarExportacaoDados();
      showToast('Solicitação enviada! Você vai receber seus dados por e-mail em breve.', {
        variant: 'success',
      });
    } finally {
      setExportando(false);
    }
  }

  async function handleExcluir() {
    setExcluindo(true);
    try {
      await solicitarExclusaoConta();
      showToast('Solicitação recebida. Nossa equipe vai entrar em contato para confirmar.', {
        variant: 'info',
      });
    } finally {
      setExcluindo(false);
    }
  }

  function handleLerTermos() {
    showToast('Documento completo não está disponível nesta demonstração.', {
      variant: 'info',
    });
  }

  return (
    <div className={styles.page}>
      <Header
        variant="step"
        sticky
        bordered
        blurred
        onBack={() => navigate('/perfil')}
        meta="Privacidade e dados"
      />

      <main className={styles.content}>
        <h1 className={styles.title}>LGPD</h1>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Seus consentimentos</h2>
          <p className={styles.sectionText}>
            Aceitos em 12/04/2026 no primeiro acesso. Você pode revogar a qualquer momento — isso
            interrompe o acompanhamento pelo app.
          </p>
          <ul className={styles.consentList}>
            <li className={styles.consentItem}>Termo de consentimento informado</li>
            <li className={styles.consentItem}>Política de privacidade (v1.7)</li>
            <li className={styles.consentItem}>Tratamento de dados sensíveis de saúde</li>
          </ul>
          <button type="button" className={styles.linkButton} onClick={handleLerTermos}>
            Ler os termos na íntegra
          </button>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Seus direitos</h2>

          <Card variant="default" padding="md" className={styles.rightCard}>
            <h3 className={styles.cardTitle}>Exportar meus dados</h3>
            <p className={styles.cardText}>
              Receba uma cópia completa em PDF no e-mail cadastrado.
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={handleExportar}
              loading={exportando}
              disabled={exportando}
            >
              Solicitar exportação
            </Button>
          </Card>

          <Card variant="default" padding="md" className={styles.rightCard}>
            <h3 className={styles.cardTitleDestructive}>Excluir minha conta</h3>
            <p className={styles.cardText}>
              Remove seu acesso e anonimiza seus dados conforme a LGPD.
            </p>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleExcluir}
              loading={excluindo}
              disabled={excluindo}
            >
              Solicitar exclusão de conta
            </Button>
          </Card>
        </section>

        <section className={styles.dpoSection}>
          <div className={styles.dpoIconWrapper}>
            <ShieldCheck size={16} strokeWidth={2} aria-hidden="true" />
          </div>
          <div>
            <p className={styles.dpoText}>
              Dúvidas sobre o tratamento dos seus dados? Fale com nosso DPO.
            </p>
            <a href="mailto:dpo@centrooncologiasc.com.br" className={styles.dpoLink}>
              dpo@centrooncologiasc.com.br
            </a>
          </div>
        </section>
      </main>
    </div>
  );
}
