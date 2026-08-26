import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import {
  Shield,
  ChevronRight,
  Users,
  CircleQuestionMark,
  LogOut,
  Star,
  FingerprintPattern,
  Bell,
  Moon,
  Heart,
  Pill,
  Calendar,
  CircleAlert,
  Phone,
  Mail,
  Settings,
} from 'lucide-react';
import Avatar from '../../components/Avatar';
import Card from '../../components/Card';
import Switch from '../../components/Switch';
import Button from '../../components/Button';
import Loading from '../../components/Loading';
import BottomTab from '../../components/BottomTab';
import { getPatient, atualizarPreferencia, getCuidador } from '../../services/mockApi';
import { logout } from '../../services/session';
import { clearPushUser } from '../../services/pushNotifications';
import styles from './ProfileHub.module.css';

function mascararCPF(cpf) {
  const digitos = cpf.replace(/\D/g, '');
  return `•••.•••.${digitos.slice(6, 9)}-${digitos.slice(9)}`;
}

function calcularIdade(dataNascimento) {
  const hoje = new Date();
  let idade = hoje.getFullYear() - dataNascimento.getFullYear();
  const aindaNaoFezAniversario =
    hoje.getMonth() < dataNascimento.getMonth() ||
    (hoje.getMonth() === dataNascimento.getMonth() && hoje.getDate() < dataNascimento.getDate());
  if (aindaNaoFezAniversario) idade -= 1;
  return idade;
}

export default function ProfileHub() {
  const navigate = useNavigate();

  const [carregando, setCarregando] = useState(true);
  const [paciente, setPaciente] = useState(null);
  const [preferencias, setPreferencias] = useState(null);
  const [cuidador, setCuidador] = useState(null);

  useEffect(() => {
    let ativo = true;

    async function carregar() {
      setCarregando(true);
      const [data, cuidadorData] = await Promise.all([getPatient(), getCuidador()]);
      if (!ativo) return;
      setPaciente(data);
      setPreferencias(data.preferencias);
      setCuidador(cuidadorData);
      setCarregando(false);
    }

    carregar();

    return () => {
      ativo = false;
    };
  }, []);

  function handleTogglePreferencia(chave, novoValor) {
    setPreferencias((atual) => ({ ...atual, [chave]: novoValor }));
    atualizarPreferencia(chave, novoValor);
  }

  function handleToggleTema(novoValor) {
    if (novoValor) {
      document.documentElement.setAttribute('data-theme', 'dark');
    } else {
      document.documentElement.removeAttribute('data-theme');
    }
    localStorage.setItem('supera_tema', novoValor ? 'dark' : 'light');
    setPreferencias((atual) => ({ ...atual, temaEscuro: novoValor }));
    atualizarPreferencia('temaEscuro', novoValor);
  }

  async function handleSair() {
    await logout();
    clearPushUser();
    navigate('/login');
  }

  if (carregando) {
    return <Loading />;
  }

  const [ano, mes, dia] = paciente.dataNascimento.split('-').map(Number);
  const dataNascimento = new Date(ano, mes - 1, dia);
  const idade = calcularIdade(dataNascimento);
  const dataNascimentoLabel = dataNascimento.toLocaleDateString('pt-BR');

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <p className={styles.eyebrow}>MEU PERFIL</p>
        <h1 className={styles.title}>{paciente.nome.split(' ')[0]}</h1>
      </header>

      <main className={styles.content}>
        <section className={styles.resumo}>
          <Avatar
            name={paciente.nome}
            size="xl"
            ring
            style={{
              '--avatar-ring-color': 'color-mix(in srgb, var(--color-primary) 20%, transparent)',
            }}
          />
          <p className={styles.nomeCompleto}>{paciente.nome}</p>
          <p className={styles.metaLinha}>CPF {mascararCPF(paciente.cpf)}</p>
          <p className={styles.metaLinha}>
            {idade} anos · nasc. {dataNascimentoLabel}
          </p>
        </section>

        <section>
          <h2 className={styles.sectionHeading}>TRATAMENTO</h2>
          <div className={styles.infoCardList}>
            <div className={styles.infoCard}>
              <Heart size={16} strokeWidth={2} className={styles.infoCardIcon} aria-hidden="true" />
              <div className={styles.infoCardBody}>
                <p className={styles.infoLabel}>DIAGNÓSTICO</p>
                <p className={styles.infoValor}>
                  {paciente.diagnostico.cid} · {paciente.diagnostico.descricao}
                </p>
              </div>
            </div>
            <div className={styles.infoCard}>
              <Pill size={16} strokeWidth={2} className={styles.infoCardIcon} aria-hidden="true" />
              <div className={styles.infoCardBody}>
                <p className={styles.infoLabel}>PROTOCOLO</p>
                <p className={styles.infoValor}>{paciente.protocolo}</p>
              </div>
            </div>
            <div className={styles.infoCard}>
              <Calendar size={16} strokeWidth={2} className={styles.infoCardIcon} aria-hidden="true" />
              <div className={styles.infoCardBody}>
                <p className={styles.infoLabel}>ESTADIAMENTO</p>
                <p className={styles.infoValor}>{paciente.estadiamento}</p>
              </div>
            </div>
            <div className={styles.infoCard}>
              <CircleAlert
                size={16}
                strokeWidth={2}
                className={`${styles.infoCardIcon} ${styles.infoCardIconDestructive}`}
                aria-hidden="true"
              />
              <div className={styles.infoCardBody}>
                <p className={styles.infoLabel}>ALERGIAS</p>
                <p className={styles.infoValor}>{paciente.alergias.join(', ')}</p>
              </div>
            </div>
            <div className={styles.reacoesBox}>
              <p className={styles.infoLabel}>REAÇÕES PRÉVIAS</p>
              <ul className={styles.reacoesList}>
                {paciente.reacoesPrevias.map((reacao) => (
                  <li key={reacao} className={styles.reacaoItem}>
                    {reacao}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        <section>
          <h2 className={styles.sectionHeading}>CONTATO</h2>
          <div className={styles.infoCardList}>
            <div className={styles.infoCard}>
              <Phone size={16} strokeWidth={2} className={styles.infoCardIcon} aria-hidden="true" />
              <div className={styles.infoCardBody}>
                <p className={styles.infoLabel}>TELEFONE</p>
                <p className={styles.infoValor}>{paciente.celular}</p>
              </div>
            </div>
            <div className={styles.infoCard}>
              <Mail size={16} strokeWidth={2} className={styles.infoCardIcon} aria-hidden="true" />
              <div className={styles.infoCardBody}>
                <p className={styles.infoLabel}>E-MAIL</p>
                <p className={styles.infoValor}>{paciente.email}</p>
              </div>
            </div>
          </div>
        </section>

        <section>
          <h2 className={styles.sectionHeading}>CUIDADOR</h2>
          {cuidador?.atual ? (
            <Link to="/cuidador" className={styles.linkCard}>
              <Avatar name={cuidador.atual.nome} size="md" />
              <span className={styles.linkCardTexto}>
                {cuidador.atual.nome}
                <span className={styles.cuidadorParentescoInline}>{cuidador.atual.parentesco}</span>
              </span>
              <ChevronRight size={18} strokeWidth={2} className={styles.chevron} aria-hidden="true" />
            </Link>
          ) : (
            <Card variant="default" padding="md" flat className={styles.cuidadorCard}>
              <span className={styles.cuidadorIconBox}>
                <Users size={18} strokeWidth={2} aria-hidden="true" />
              </span>
              <p className={styles.cuidadorTitulo}>Nenhum cuidador vinculado ainda</p>
              <p className={styles.cuidadorDescricao}>
                Convide alguém de confiança para acompanhar sua agenda, orientações, chat e diário.
              </p>
              <Link to="/cuidador" className={styles.cuidadorLink}>
                Convidar cuidador
                <ChevronRight size={14} strokeWidth={2} aria-hidden="true" />
              </Link>
            </Card>
          )}
        </section>

        <section>
          <h2 className={styles.sectionHeading}>PREFERÊNCIAS</h2>
          <div className={styles.switchList}>
              <Switch
                id="biometria"
                checked={preferencias.biometria}
                onChange={(v) => handleTogglePreferencia('biometria', v)}
                label={
                  <span className={styles.switchLabel}>
                    <FingerprintPattern
                      size={16}
                      strokeWidth={2}
                      className={styles.switchIcon}
                      aria-hidden="true"
                    />
                    Desbloquear com biometria (Face / Touch ID)
                  </span>
                }
                className={styles.switchRow}
              />
              <Switch
                id="lembretes24h"
                checked={preferencias.lembretes24h}
                onChange={(v) => handleTogglePreferencia('lembretes24h', v)}
                label={
                  <span className={styles.switchLabel}>
                    <Bell size={16} strokeWidth={2} className={styles.switchIcon} aria-hidden="true" />
                    Lembretes 24h antes
                  </span>
                }
                className={styles.switchRow}
              />
              <Switch
                id="lembretes2h"
                checked={preferencias.lembretes2h}
                onChange={(v) => handleTogglePreferencia('lembretes2h', v)}
                label={
                  <span className={styles.switchLabel}>
                    <Bell size={16} strokeWidth={2} className={styles.switchIcon} aria-hidden="true" />
                    Lembretes 2h antes
                  </span>
                }
                className={styles.switchRow}
              />
              <Switch
                id="novidadesBiblioteca"
                checked={preferencias.novidadesBiblioteca}
                onChange={(v) => handleTogglePreferencia('novidadesBiblioteca', v)}
                label={
                  <span className={styles.switchLabel}>
                    <Bell size={16} strokeWidth={2} className={styles.switchIcon} aria-hidden="true" />
                    Novidades da biblioteca
                  </span>
                }
                className={styles.switchRow}
              />
              <Switch
                id="temaEscuro"
                checked={preferencias.temaEscuro}
                onChange={handleToggleTema}
                label={
                  <span className={styles.switchLabel}>
                    <Moon size={16} strokeWidth={2} className={styles.switchIcon} aria-hidden="true" />
                    Modo escuro
                  </span>
                }
                className={styles.switchRow}
              />
          </div>
        </section>

        <section>
          <h2 className={styles.sectionHeading}>PRIVACIDADE E DADOS (LGPD)</h2>
          <Link to="/perfil/lgpd" className={styles.linkCard}>
            <Shield size={16} strokeWidth={2} className={styles.rowIcon} aria-hidden="true" />
            <span className={styles.rowLabel}>Termos de uso e política de privacidade</span>
            <ChevronRight size={16} strokeWidth={2} className={styles.chevron} aria-hidden="true" />
          </Link>
          <Link to="/perfil/lgpd" className={styles.linkCard}>
            <CircleQuestionMark size={16} strokeWidth={2} className={styles.rowIcon} aria-hidden="true" />
            <span className={styles.rowLabel}>Solicitar exportação dos meus dados</span>
            <ChevronRight size={16} strokeWidth={2} className={styles.chevron} aria-hidden="true" />
          </Link>
          <Link to="/perfil/lgpd" className={styles.linkCard}>
            <LogOut
              size={16}
              strokeWidth={2}
              className={`${styles.rowIcon} ${styles.rowIconDestructive}`}
              aria-hidden="true"
            />
            <span className={`${styles.rowLabel} ${styles.rowLabelDestructive}`}>
              Solicitar exclusão de conta
            </span>
            <ChevronRight size={16} strokeWidth={2} className={styles.chevron} aria-hidden="true" />
          </Link>
        </section>

        <section>
          <h2 className={styles.sectionHeading}>SOBRE</h2>
          <Link to="/chat" className={styles.linkCard}>
            <CircleQuestionMark size={16} strokeWidth={2} className={styles.rowIcon} aria-hidden="true" />
            <span className={styles.rowLabel}>Ajuda e suporte</span>
            <ChevronRight size={16} strokeWidth={2} className={styles.chevron} aria-hidden="true" />
          </Link>
          <Link to="/nps" className={styles.linkCard}>
            <Star size={16} strokeWidth={2} className={styles.rowIcon} aria-hidden="true" />
            <span className={styles.rowLabel}>Avaliar o atendimento</span>
            <ChevronRight size={16} strokeWidth={2} className={styles.chevron} aria-hidden="true" />
          </Link>
          <div className={styles.versionRow}>
            <Settings size={16} strokeWidth={2} className={styles.rowIcon} aria-hidden="true" />
            <span className={styles.rowLabel}>Versão do app: 1.0.0</span>
          </div>
        </section>

        <Button variant="outline" fullWidth onClick={handleSair}>
          Sair
        </Button>
      </main>

      <BottomTab />
    </div>
  );
}
