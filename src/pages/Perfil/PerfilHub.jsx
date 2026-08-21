import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Shield, ChevronRight, Users } from 'lucide-react';
import Avatar from '../../components/Avatar';
import Card from '../../components/Card';
import Switch from '../../components/Switch';
import Button from '../../components/Button';
import Loading from '../../components/Loading';
import BottomTab from '../../components/BottomTab';
import { getPatient, atualizarPreferencia, getCuidador } from '../../services/mockApi';
import styles from './PerfilHub.module.css';

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

export default function PerfilHub() {
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

  function handleSair() {
    localStorage.removeItem('supera_onboarded');
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
              '--avatar-ring-color': 'color-mix(in srgb, var(--color-primary) 25%, transparent)',
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
          <Card variant="default" padding="md">
            <dl className={styles.infoList}>
              <div className={styles.infoItem}>
                <dt className={styles.infoLabel}>DIAGNÓSTICO</dt>
                <dd className={styles.infoValor}>
                  {paciente.diagnostico.cid} · {paciente.diagnostico.descricao}
                </dd>
              </div>
              <div className={styles.infoItem}>
                <dt className={styles.infoLabel}>PROTOCOLO</dt>
                <dd className={styles.infoValor}>{paciente.protocolo}</dd>
              </div>
              <div className={styles.infoItem}>
                <dt className={styles.infoLabel}>ESTADIAMENTO</dt>
                <dd className={styles.infoValor}>{paciente.estadiamento}</dd>
              </div>
              <div className={styles.infoItem}>
                <dt className={styles.infoLabel}>ALERGIAS</dt>
                <dd className={styles.infoValor}>{paciente.alergias.join(', ')}</dd>
              </div>
              <div className={styles.infoItem}>
                <dt className={styles.infoLabel}>REAÇÕES PRÉVIAS</dt>
                <dd className={styles.infoValor}>
                  <ul className={styles.reacoesList}>
                    {paciente.reacoesPrevias.map((reacao) => (
                      <li key={reacao} className={styles.reacaoItem}>
                        {reacao}
                      </li>
                    ))}
                  </ul>
                </dd>
              </div>
            </dl>
          </Card>
        </section>

        <section>
          <h2 className={styles.sectionHeading}>CONTATO</h2>
          <Card variant="default" padding="md">
            <dl className={styles.infoList}>
              <div className={styles.infoItem}>
                <dt className={styles.infoLabel}>TELEFONE</dt>
                <dd className={styles.infoValor}>{paciente.celular}</dd>
              </div>
              <div className={styles.infoItem}>
                <dt className={styles.infoLabel}>E-MAIL</dt>
                <dd className={styles.infoValor}>{paciente.email}</dd>
              </div>
            </dl>
          </Card>
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
              <ChevronRight size={18} strokeWidth={2} aria-hidden="true" />
            </Link>
          ) : (
            <Card variant="default" padding="md" className={styles.cuidadorCard}>
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
          <Card variant="default" padding="md">
            <div className={styles.switchList}>
              <Switch
                id="biometria"
                checked={preferencias.biometria}
                onChange={(v) => handleTogglePreferencia('biometria', v)}
                label="Desbloquear com biometria (Face / Touch ID)"
              />
              <Switch
                id="lembretes24h"
                checked={preferencias.lembretes24h}
                onChange={(v) => handleTogglePreferencia('lembretes24h', v)}
                label="Lembretes 24h antes"
              />
              <Switch
                id="lembretes2h"
                checked={preferencias.lembretes2h}
                onChange={(v) => handleTogglePreferencia('lembretes2h', v)}
                label="Lembretes 2h antes"
              />
              <Switch
                id="novidadesBiblioteca"
                checked={preferencias.novidadesBiblioteca}
                onChange={(v) => handleTogglePreferencia('novidadesBiblioteca', v)}
                label="Novidades da biblioteca"
              />
              <Switch
                id="temaEscuro"
                checked={preferencias.temaEscuro}
                onChange={handleToggleTema}
                label="Modo escuro"
              />
            </div>
          </Card>
        </section>

        <section>
          <h2 className={styles.sectionHeading}>PRIVACIDADE E DADOS</h2>
          <Link to="/perfil/lgpd" className={styles.linkCard}>
            <span className={styles.linkCardIcon}>
              <Shield size={18} strokeWidth={2} aria-hidden="true" />
            </span>
            <span className={styles.linkCardTexto}>Privacidade e dados (LGPD)</span>
            <ChevronRight size={18} strokeWidth={2} aria-hidden="true" />
          </Link>
        </section>

        <section>
          <h2 className={styles.sectionHeading}>SOBRE</h2>
          <Link to="/chat" className={styles.linkCard}>
            <span className={styles.linkCardTexto}>Ajuda e suporte</span>
            <ChevronRight size={18} strokeWidth={2} aria-hidden="true" />
          </Link>
          <Link to="/nps" className={styles.linkCard}>
            <span className={styles.linkCardTexto}>Avaliar o atendimento</span>
            <ChevronRight size={18} strokeWidth={2} aria-hidden="true" />
          </Link>
          <p className={styles.versaoApp}>Versão do app: 1.0.0</p>
        </section>

        <Button variant="outline" fullWidth onClick={handleSair}>
          Sair
        </Button>
      </main>

      <BottomTab />
    </div>
  );
}
