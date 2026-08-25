import { useState } from 'react';
import {
  Bell,
  Calendar,
  Mail,
  Plus,
  Search,
  Eye,
  EyeOff,
  Syringe,
  Inbox,
} from 'lucide-react';
import Button from '../components/Button';
import ButtonNovo from '../components/ui/button';
import Input from '../components/Input';
import InputNovo from '../components/ui/input';
import Card from '../components/Card';
import Avatar from '../components/Avatar';
import Badge from '../components/Badge';
import Tag from '../components/Tag';
import Header from '../components/Header';
import BottomTab from '../components/BottomTab';
import EmptyState from '../components/EmptyState';
import Loading from '../components/Loading';
import Modal from '../components/Modal';
import Logo from '../components/Logo';
import { useToast } from '../contexts/ToastContext';
import styles from './DesignSystemShowcase.module.css';

const MOODS = [0, 1, 2, 3, 4, 5];
const INFUSIONS = ['waiting', 'prep', 'active', 'done'];

export default function DesignSystemShowcase() {
  const { showToast } = useToast();
  const [modalOpen, setModalOpen] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [selectedTag, setSelectedTag] = useState('oncologia');

  return (
    <div className={styles.page}>
      <Header
        title="Design System"
        subtitle="Jornada Supera — vitrine interna de componentes"
        bordered
      />

      <div className={styles.content}>
        <section className={styles.section}>
          <span className={styles.sectionTitle}>Logo</span>
          <div className={styles.row}>
            <Logo size="sm" />
            <Logo size="md" />
            <Logo size="lg" />
          </div>
        </section>

        <section className={styles.section}>
          <span className={styles.sectionTitle}>Button (antigo)</span>
          <div className={styles.row}>
            <Button variant="primary">Primário</Button>
            <Button variant="secondary">Secundário</Button>
            <Button variant="outline">Contorno</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="destructive">Destrutivo</Button>
          </div>
          <div className={styles.row}>
            <Button size="sm">Pequeno</Button>
            <Button size="md">Médio</Button>
            <Button size="lg">Grande</Button>
            <Button loading>Carregando</Button>
            <Button disabled>Desabilitado</Button>
          </div>
          <div className={styles.row}>
            <Button iconLeft={Plus}>Novo registro</Button>
            <Button iconLeft={Bell} variant="outline">
              Lembretes
            </Button>
            <Button iconLeft={Search} variant="ghost" />
            <Button pill variant="secondary">
              Pill
            </Button>
          </div>
          <div className={styles.row}>
            <Button fullWidth size="lg">
              Botão de largura total
            </Button>
          </div>
        </section>

        <section className={styles.section}>
          <span className={styles.sectionTitle}>Button (novo — shadcn)</span>
          <div className={styles.row}>
            <ButtonNovo variant="primary">Primário</ButtonNovo>
            <ButtonNovo variant="secondary">Secundário</ButtonNovo>
            <ButtonNovo variant="outline">Contorno</ButtonNovo>
            <ButtonNovo variant="ghost">Ghost</ButtonNovo>
            <ButtonNovo variant="destructive">Destrutivo</ButtonNovo>
          </div>
          <div className={styles.row}>
            <ButtonNovo size="sm">Pequeno</ButtonNovo>
            <ButtonNovo size="md">Médio</ButtonNovo>
            <ButtonNovo size="lg">Grande</ButtonNovo>
            <ButtonNovo loading>Carregando</ButtonNovo>
            <ButtonNovo disabled>Desabilitado</ButtonNovo>
          </div>
          <div className={styles.row}>
            <ButtonNovo iconLeft={Plus}>Novo registro</ButtonNovo>
            <ButtonNovo iconLeft={Bell} variant="outline">
              Lembretes
            </ButtonNovo>
            <ButtonNovo iconLeft={Search} variant="ghost" />
            <ButtonNovo pill variant="secondary">
              Pill
            </ButtonNovo>
          </div>
          <div className={styles.row}>
            <ButtonNovo fullWidth size="lg">
              Botão de largura total
            </ButtonNovo>
          </div>
        </section>

        <section className={styles.section}>
          <span className={styles.sectionTitle}>Input (antigo)</span>
          <div className={styles.column} style={{ maxWidth: 360 }}>
            <Input label="Nome completo" placeholder="Como podemos te chamar?" />
            <Input
              label="Telefone"
              helperText="Vamos usar esse número para lembretes de consulta."
              placeholder="(00) 00000-0000"
            />
            <Input label="E-mail" type="email" iconLeft={Mail} placeholder="voce@email.com" />
            <Input
              label="Senha"
              type={showPassword ? 'text' : 'password'}
              placeholder="••••••••"
              rightSlot={
                <Button
                  variant="ghost"
                  size="sm"
                  iconLeft={showPassword ? EyeOff : Eye}
                  onClick={() => setShowPassword((value) => !value)}
                  aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                />
              }
            />
            <Input label="CPF" error="Verifique o número informado." placeholder="000.000.000-00" />
            <Input label="Campo desabilitado" disabled placeholder="Indisponível" />
          </div>
        </section>

        <section className={styles.section}>
          <span className={styles.sectionTitle}>Input (novo — shadcn)</span>
          <div className={styles.column} style={{ maxWidth: 360 }}>
            <InputNovo label="Nome completo" placeholder="Como podemos te chamar?" />
            <InputNovo
              label="Telefone"
              helperText="Vamos usar esse número para lembretes de consulta."
              placeholder="(00) 00000-0000"
            />
            <InputNovo label="E-mail" type="email" iconLeft={Mail} placeholder="voce@email.com" />
            <InputNovo
              label="Senha"
              type={showPassword ? 'text' : 'password'}
              placeholder="••••••••"
              rightSlot={
                <ButtonNovo
                  variant="ghost"
                  size="sm"
                  iconLeft={showPassword ? EyeOff : Eye}
                  onClick={() => setShowPassword((value) => !value)}
                  aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                />
              }
            />
            <InputNovo label="CPF" error="Verifique o número informado." placeholder="000.000.000-00" />
            <InputNovo label="Campo desabilitado" disabled placeholder="Indisponível" />
          </div>
        </section>

        <section className={styles.section}>
          <span className={styles.sectionTitle}>Card</span>
          <div className={styles.row}>
            <Card style={{ width: 220 }}>
              <strong>Card padrão</strong>
              <p>Conteúdo em destaque neutro, usado na maioria das telas.</p>
            </Card>
            <Card variant="primary" decorated style={{ width: 220 }}>
              <div className={styles.row}>
                <Syringe size={14} strokeWidth={2.5} />
                <small>PRÓXIMO COMPROMISSO</small>
              </div>
              <strong>Quimioterapia — Ciclo 4</strong>
              <p>Amanhã · 08:30</p>
            </Card>
            <Card variant="outline" style={{ width: 220 }}>
              <strong>Card contorno</strong>
              <p>Usado para itens secundários em listas.</p>
            </Card>
          </div>
        </section>

        <section className={styles.section}>
          <span className={styles.sectionTitle}>Avatar</span>
          <div className={styles.row}>
            <Avatar size="sm" name="Rafael Mendes" />
            <Avatar size="md" name="Patrícia Lima" />
            <Avatar size="lg" name="Camila Souza" />
            <Avatar size="xl" name="Helena Costa" />
          </div>
          <div className={styles.avatarStack}>
            <Avatar size="md" name="Helena Costa" />
            <Avatar size="md" name="Patrícia Lima" />
            <Avatar size="md" name="Bruno Alves" />
            <Avatar size="md" name="Larissa Rocha" />
          </div>
        </section>

        <section className={styles.section}>
          <span className={styles.sectionTitle}>Badge — escala de sintoma (0–5)</span>
          <div className={styles.row}>
            {MOODS.map((mood) => (
              <Badge key={mood} tone={`mood-${mood}`} withDot>
                Grau {mood}
              </Badge>
            ))}
          </div>
          <span className={styles.sectionTitle}>Badge — status de agenda</span>
          <div className={styles.row}>
            {INFUSIONS.map((status) => (
              <Badge key={status} tone={`infusion-${status}`} variant="solid">
                {status}
              </Badge>
            ))}
          </div>
        </section>

        <section className={styles.section}>
          <span className={styles.sectionTitle}>Tag (filtros)</span>
          <div className={styles.row}>
            {['oncologia', 'nutrição', 'psicologia', 'enfermagem'].map((item) => (
              <Tag
                key={item}
                selected={selectedTag === item}
                onClick={() => setSelectedTag(item)}
              >
                {item}
              </Tag>
            ))}
          </div>
        </section>

        <section className={styles.section}>
          <span className={styles.sectionTitle}>Loading</span>
          <Loading inline label="Sincronizando diário…" />
        </section>

        <section className={styles.section}>
          <span className={styles.sectionTitle}>Empty state</span>
          <Card padding="none">
            <EmptyState
              icon={Inbox}
              title="Nenhum registro ainda"
              description="Quando você registrar como está se sentindo, o histórico aparece aqui."
              actionLabel="Fazer primeiro registro"
              onAction={() => showToast('Ação de exemplo do EmptyState', { variant: 'info' })}
            />
          </Card>
        </section>

        <section className={styles.section}>
          <span className={styles.sectionTitle}>Modal</span>
          <div className={styles.row}>
            <Button onClick={() => setModalOpen(true)}>Abrir modal</Button>
          </div>
          <Modal
            open={modalOpen}
            onClose={() => setModalOpen(false)}
            title="Cancelar compromisso?"
            footer={
              <>
                <Button variant="outline" fullWidth onClick={() => setModalOpen(false)}>
                  Voltar
                </Button>
                <Button variant="destructive" fullWidth onClick={() => setModalOpen(false)}>
                  Confirmar
                </Button>
              </>
            }
          >
            <p>Essa ação avisa sua equipe de cuidado. Você pode reagendar depois pela Agenda.</p>
          </Modal>
        </section>

        <section className={styles.section}>
          <span className={styles.sectionTitle}>Toast</span>
          <div className={styles.row}>
            <Button variant="outline" onClick={() => showToast('Registro salvo com sucesso.', { variant: 'success' })}>
              Sucesso
            </Button>
            <Button variant="outline" onClick={() => showToast('Não foi possível enviar. Tente novamente.', { variant: 'error' })}>
              Erro
            </Button>
            <Button variant="outline" onClick={() => showToast('Nova orientação disponível.', { variant: 'info' })}>
              Info
            </Button>
            <Button variant="outline" onClick={() => showToast('Lembrete: tomar medicação em 2h.')}>
              Padrão
            </Button>
          </div>
        </section>

        <section className={styles.section}>
          <span className={styles.sectionTitle}>Header com voltar e ações</span>
          <Card padding="none">
            <Header
              title="Agenda"
              subtitle="Seus próximos compromissos"
              onBack={() => showToast('Voltar pressionado')}
              actions={
                <Button variant="ghost" iconLeft={Calendar} aria-label="Ver calendário" />
              }
            />
          </Card>
        </section>
      </div>

      <BottomTab />
    </div>
  );
}
