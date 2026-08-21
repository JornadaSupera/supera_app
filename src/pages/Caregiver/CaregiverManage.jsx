import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { UserPlus, Smartphone, Mail, Check, Lock, ShieldCheck, History } from 'lucide-react';
import Header from '../../components/Header';
import Avatar from '../../components/Avatar';
import Card from '../../components/Card';
import Badge from '../../components/Badge';
import Button from '../../components/Button';
import Modal from '../../components/Modal';
import EmptyState from '../../components/EmptyState';
import Loading from '../../components/Loading';
import { useToast } from '../../contexts/ToastContext';
import { getCuidador, removerCuidador } from '../../services/mockApi';
import { cx } from '../../utils/classNames';
import InviteCaregiverModal from './InviteCaregiverModal';
import styles from './CaregiverManage.module.css';

const EVENTO_LABEL = {
  vinculo_ativo: 'Vínculo ativo',
  convite_aceito: 'Convite aceito',
  revogado: 'Vínculo revogado',
};

export default function CaregiverManage() {
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
        meta={cuidadorAtual ? 'Cuidador vinculado' : 'Cuidador'}
      />

      <main className={styles.content}>
        <div className={styles.titleBlock}>
          {cuidadorAtual ? (
            <h1 className={styles.title}>Gerenciar cuidador</h1>
          ) : (
            <>
              <h1 className={styles.title}>Cuidador</h1>
              <p className={styles.subtitle}>
                Convide alguém de confiança para acompanhar sua jornada.
              </p>
            </>
          )}
        </div>

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
              <Avatar name={cuidadorAtual.nome} size="lg" className={styles.resumoAvatar} />
              <div className={styles.resumoInfo}>
                <p className={styles.resumoNome}>{cuidadorAtual.nome}</p>
                <p className={styles.resumoParentesco}>{cuidadorAtual.parentesco}</p>
                <Badge tone="secondary" size="sm" className={styles.resumoBadge}>
                  <ShieldCheck size={12} strokeWidth={2} aria-hidden="true" />
                  Acompanhante
                </Badge>
                <p className={styles.resumoContato}>
                  {cuidadorAtual.meio === 'sms' ? (
                    <Smartphone size={14} strokeWidth={2} aria-hidden="true" />
                  ) : (
                    <Mail size={14} strokeWidth={2} aria-hidden="true" />
                  )}
                  <span>
                    Login próprio ·{' '}
                    <span className={styles.resumoContatoValor}>{cuidadorAtual.contato}</span>{' '}
                    (confirmado por {cuidadorAtual.meio === 'sms' ? 'SMS' : 'e-mail'})
                  </span>
                </p>
              </div>
            </Card>

            <Card variant="default" padding="md" className={styles.acessoCard}>
              <h2 className={styles.sectionTitle}>Acesso do acompanhante</h2>

              <p className={styles.permissoesPodeTitle}>O acompanhante pode</p>
              <ul className={styles.permissoesList}>
                {dadosCuidador.permissoesPode.map((item) => (
                  <li key={item} className={styles.permissoesItem}>
                    <Check size={14} strokeWidth={2.5} className={styles.iconePode} aria-hidden="true" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>

              <p className={styles.permissoesNaoPodeTitle}>O acompanhante não pode</p>
              <ul className={styles.permissoesList}>
                {dadosCuidador.permissoesNaoPode.map((item) => (
                  <li key={item} className={cx(styles.permissoesItem, styles.permissoesItemMuted)}>
                    <Lock size={14} strokeWidth={2} className={styles.iconeNaoPode} aria-hidden="true" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>

              <div className={styles.avisoBox}>
                <ShieldCheck size={14} strokeWidth={2.25} className={styles.avisoIcone} aria-hidden="true" />
                <p className={styles.avisoTexto}>
                  O cuidador entra com <strong>o login dele</strong> (confirmado por{' '}
                  {cuidadorAtual.meio === 'sms' ? 'SMS' : 'e-mail'}) — nunca com a sua senha. Remover o
                  vínculo revoga o acesso na hora; <strong>sua senha continua a mesma</strong>. As ações
                  dele ficam na auditoria identificadas como &ldquo;cuidador de você&rdquo;.
                </p>
              </div>
            </Card>

            <div className={styles.acoes}>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setModalAberto(true)}
              >
                Trocar cuidador
              </Button>
              <Button
                variant="destructive"
                size="sm"
                className={styles.removerBotao}
                onClick={() => setConfirmandoRemocao(true)}
              >
                Remover cuidador
              </Button>
            </div>
            <p className={styles.removerLegenda}>
              Remover revoga o acesso imediatamente — você não precisa trocar de senha.
            </p>
          </>
        )}

        {dadosCuidador.historico.length > 0 && (
          <section className={styles.section}>
            <h2 className={styles.historicoTitle}>
              <History size={14} strokeWidth={2} aria-hidden="true" />
              Histórico de vínculos
            </h2>
            <ol className={styles.historicoList}>
              {dadosCuidador.historico.map((item) => {
                const nomeExibido =
                  item.evento === 'revogado'
                    ? `${item.nome} (${item.parentesco.toLowerCase()})`
                    : item.nome;
                return (
                  <li
                    key={item.id}
                    className={cx(styles.historicoItem, styles[`historico-${item.evento}`])}
                  >
                    <p className={styles.historicoEvento}>{EVENTO_LABEL[item.evento]}</p>
                    <p className={styles.historicoDetalhe}>
                      {nomeExibido} · {item.dataLabel}
                    </p>
                  </li>
                );
              })}
            </ol>
            <p className={styles.historicoLegenda}>
              Cada vínculo, revogação e ação do cuidador fica registrado na auditoria (LGPD),
              identificado como &ldquo;cuidador de você&rdquo;.
            </p>
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

      <InviteCaregiverModal
        open={modalAberto}
        onClose={() => setModalAberto(false)}
        onSucesso={handleConviteEnviado}
      />
    </div>
  );
}
