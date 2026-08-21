import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { UserPlus, Smartphone, Mail, Check, X } from 'lucide-react';
import Header from '../../components/Header';
import Avatar from '../../components/Avatar';
import Card from '../../components/Card';
import Button from '../../components/Button';
import Modal from '../../components/Modal';
import EmptyState from '../../components/EmptyState';
import Loading from '../../components/Loading';
import { useToast } from '../../contexts/ToastContext';
import { getCuidador, removerCuidador } from '../../services/mockApi';
import { cx } from '../../utils/classNames';
import ConvidarCuidadorModal from './ConvidarCuidadorModal';
import styles from './CuidadorGerenciar.module.css';

const EVENTO_LABEL = {
  vinculo_ativo: 'Vínculo ativo',
  convite_aceito: 'Convite aceito',
  revogado: 'Vínculo revogado',
};

export default function CuidadorGerenciar() {
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [dadosCuidador, setDadosCuidador] = useState(null);
  const [modalAberto, setModalAberto] = useState(false);
  const [confirmandoRemocao, setConfirmandoRemocao] = useState(false);
  const [removendo, setRemovendo] = useState(false);

  useEffect(() => {
    carregarCuidador();
  }, []);

  async function carregarCuidador() {
    const resultado = await getCuidador();
    setDadosCuidador(resultado);
  }

  async function handleConviteEnviado() {
    setModalAberto(false);
    await carregarCuidador();
    showToast('Cuidador vinculado com sucesso!', { variant: 'success' });
  }

  async function handleConfirmarRemocao() {
    setRemovendo(true);
    try {
      await removerCuidador();
      setDadosCuidador((atual) => ({ ...atual, atual: null }));
      setConfirmandoRemocao(false);
      setModalAberto(false);
      showToast('Vínculo removido. O acesso foi revogado.', { variant: 'success' });
      await carregarCuidador();
    } finally {
      setRemovendo(false);
    }
  }

  if (!dadosCuidador) return <Loading />;

  const cuidadorAtual = dadosCuidador.atual;

  return (
    <div className={styles.page}>
      <Header
        variant="step"
        sticky
        bordered
        blurred
        onBack={() => navigate('/perfil')}
        meta="Cuidador"
      />

      <main className={styles.content}>
        <h1 className={styles.title}>Cuidador</h1>
        <p className={styles.subtitle}>
          Convide alguém de confiança para acompanhar sua jornada.
        </p>

        {!cuidadorAtual ? (
          <EmptyState
            icon={UserPlus}
            title="Nenhum cuidador vinculado"
            description="Convide um familiar ou acompanhante para ajudar no seu cuidado — ele terá login próprio, sem acesso à sua senha."
            actionLabel="Convidar cuidador"
            onAction={() => setModalAberto(true)}
          />
        ) : (
          <>
            <Card variant="default" padding="md" className={styles.resumoCard}>
              <Avatar name={cuidadorAtual.nome} size="lg" />
              <div className={styles.resumoInfo}>
                <p className={styles.resumoNome}>{cuidadorAtual.nome}</p>
                <p className={styles.resumoParentesco}>{cuidadorAtual.parentesco}</p>
                <p className={styles.resumoContato}>
                  {cuidadorAtual.meio === 'sms' ? (
                    <Smartphone size={14} strokeWidth={2} aria-hidden="true" />
                  ) : (
                    <Mail size={14} strokeWidth={2} aria-hidden="true" />
                  )}
                  <span>
                    Login próprio · {cuidadorAtual.contato} (confirmado por{' '}
                    {cuidadorAtual.meio === 'sms' ? 'SMS' : 'e-mail'})
                  </span>
                </p>
              </div>
            </Card>

            <section className={styles.section}>
              <h2 className={styles.sectionTitle}>Acesso do acompanhante</h2>

              <div className={cx(styles.permissoesBlock, styles.permissoesBlockPode)}>
                <p className={styles.permissoesPodeTitle}>O que pode</p>
                <ul className={styles.permissoesList}>
                  {dadosCuidador.permissoesPode.map((item) => (
                    <li key={item} className={styles.permissoesItem}>
                      <Check size={14} strokeWidth={2.5} className={styles.iconePode} aria-hidden="true" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className={cx(styles.permissoesBlock, styles.permissoesBlockNaoPode)}>
                <p className={styles.permissoesNaoPodeTitle}>O que não pode</p>
                <ul className={styles.permissoesList}>
                  {dadosCuidador.permissoesNaoPode.map((item) => (
                    <li key={item} className={styles.permissoesItem}>
                      <X size={14} strokeWidth={2.5} className={styles.iconeNaoPode} aria-hidden="true" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <p className={styles.avisoTexto}>
                O cuidador entra com o login dele, nunca com a sua senha. Remover o vínculo revoga o
                acesso na hora — sua senha continua a mesma. Todas as ações dele ficam registradas na
                auditoria como &ldquo;cuidador de você&rdquo;.
              </p>
            </section>

            <div className={styles.acoes}>
              <Button variant="outline" onClick={() => setModalAberto(true)}>
                Trocar cuidador
              </Button>
              <Button variant="destructive" onClick={() => setConfirmandoRemocao(true)}>
                Remover cuidador
              </Button>
            </div>
          </>
        )}

        {dadosCuidador.historico.length > 0 && (
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Histórico de vínculos</h2>
            <ul className={styles.historicoList}>
              {dadosCuidador.historico.map((item) => (
                <li
                  key={item.id}
                  className={cx(styles.historicoItem, styles[`historico-${item.evento}`])}
                >
                  <p className={styles.historicoEvento}>{EVENTO_LABEL[item.evento]}</p>
                  <p className={styles.historicoDetalhe}>
                    {item.nome} · {item.parentesco} · {item.dataLabel}
                  </p>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>

      <Modal
        open={confirmandoRemocao}
        onClose={() => setConfirmandoRemocao(false)}
        title="Remover cuidador?"
        footer={
          <>
            <Button
              variant="outline"
              className={styles.confirmacaoBotao}
              onClick={() => setConfirmandoRemocao(false)}
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              className={styles.confirmacaoBotao}
              loading={removendo}
              onClick={handleConfirmarRemocao}
            >
              Remover
            </Button>
          </>
        }
      >
        <p className={styles.confirmacaoTexto}>
          Isso revoga o acesso de {cuidadorAtual?.nome} imediatamente. Você não precisa trocar de
          senha.
        </p>
      </Modal>

      <ConvidarCuidadorModal
        open={modalAberto}
        onClose={() => setModalAberto(false)}
        onSucesso={handleConviteEnviado}
      />
    </div>
  );
}
