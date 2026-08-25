import { useState } from 'react';
import { useNavigate } from 'react-router';
import { ChevronRight, ShieldCheck } from 'lucide-react';
import Checkbox from '../../components/Checkbox';
import Button from '../../components/Button';
import Header from '../../components/Header';
import styles from './Lgpd.module.css';

export default function Lgpd() {
  const navigate = useNavigate();

  const [aceitaTermos, setAceitaTermos] = useState(false);
  const [aceitaPrivacidade, setAceitaPrivacidade] = useState(false);
  const [aceitaDadosSensiveis, setAceitaDadosSensiveis] = useState(false);

  const podeContinuar = aceitaTermos && aceitaPrivacidade && aceitaDadosSensiveis;

  const handleVoltar = () => {
    navigate(-1);
  };

  const handleContinuar = () => {
    navigate('/cadastro');
  };

  return (
    <div className={styles.page}>
      <Header variant="step" sticky bordered blurred onBack={handleVoltar} meta="Etapa 1 de 4" />

      <main className={styles.content}>
        <div className={styles.noticeCard}>
          <ShieldCheck size={24} strokeWidth={2} className={styles.noticeIcon} aria-hidden="true" />
          <h1 className={styles.noticeTitle}>Termo de uso &amp; privacidade</h1>
          <p className={styles.noticeDescription}>
            Antes de continuar, precisamos do seu consentimento para tratar seus dados conforme a LGPD.
          </p>
        </div>

        <div className={styles.summaryBox}>
          <h2 className={styles.summaryTitle}>Resumo</h2>
          <p>
            O <strong>Jornada Supera</strong> é uma ferramenta complementar ao seu cuidado
            oncológico no Centro de Oncologia de Santa Catarina. As informações que você
            registra aqui ajudam a equipe clínica a te acompanhar entre as consultas.
          </p>
          <p>
            <strong>Dados que coletamos:</strong> CPF, data de nascimento, telefone, e-mail
            (para identificação e contato), além das suas entradas no diário, mensagens no
            chat e respostas a perguntas guiadas.
          </p>
          <p>
            <strong>Finalidade:</strong> registrar e organizar seu acompanhamento, permitir
            comunicação direta com a equipe e produzir estatísticas anonimizadas para
            qualificar o cuidado.
          </p>
          <p>
            <strong>Direitos do titular (você):</strong> acesso, correção, exclusão,
            portabilidade e revogação do consentimento a qualquer momento — pelo próprio
            aplicativo, em Perfil → Privacidade.
          </p>
          <p>
            <strong>Compartilhamento:</strong> apenas com a equipe clínica autorizada do
            Centro de Oncologia. Não vendemos nem cedemos dados a terceiros.
          </p>
          <p>
            <strong>Hospedagem:</strong> servidores no Brasil, com criptografia em trânsito
            (TLS 1.3) e em repouso (AES-256). Trilha de auditoria imutável para todo acesso
            a dados sensíveis.
          </p>
          <p>
            <strong>DPO (encarregado de dados):</strong> dpo@centroconcologia.com.br
          </p>
        </div>

        <div className={styles.checkboxList}>
          <Checkbox
            id="aceita-termos"
            checked={aceitaTermos}
            onChange={setAceitaTermos}
            label={
              <>
                Li e concordo com os <strong>Termos de Uso</strong> do Jornada Supera.
              </>
            }
          />
          <Checkbox
            id="aceita-privacidade"
            checked={aceitaPrivacidade}
            onChange={setAceitaPrivacidade}
            label={
              <>
                Li e concordo com a <strong>Política de Privacidade</strong>.
              </>
            }
          />
          <Checkbox
            id="aceita-dados-sensiveis"
            checked={aceitaDadosSensiveis}
            onChange={setAceitaDadosSensiveis}
            label={
              <>
                Autorizo o tratamento dos meus <strong>dados sensíveis de saúde</strong> com
                a finalidade de me acompanhar no tratamento oncológico.
              </>
            }
          />
        </div>
      </main>

      <footer className={styles.footer}>
        <Button
          fullWidth
          iconRight={ChevronRight}
          disabled={!podeContinuar}
          onClick={handleContinuar}
        >
          Continuar
        </Button>
      </footer>
    </div>
  );
}
