import { useState } from 'react';
import { Bell, Mail, Plus, Search, Eye, EyeOff, Syringe, Inbox, Heart } from 'lucide-react';
import Button from '../components/ui/button';
import Input from '../components/ui/input';
import Card from '../components/ui/card';
import Avatar from '../components/ui/avatar';
import Badge from '../components/ui/badge';
import Tag from '../components/ui/tag';
import Header from '../components/ui/header';
import BottomTab from '../components/ui/bottom-tab';
import EmptyState from '../components/ui/empty-state';
import ErrorState from '../components/ui/error-state';
import Loading from '../components/ui/loading';
import Modal from '../components/ui/modal';
import Logo from '../components/ui/logo';
import Switch from '../components/ui/switch';
import Checkbox from '../components/ui/checkbox';
import IconHeading from '../components/ui/icon-heading';
import PasswordStrengthMeter from '../components/ui/password-strength-meter';
import SymptomSlider from '../components/ui/symptom-slider';
import SelectMenu from '../components/ui/select-menu';
import { useToast } from '../contexts/ToastContext';

const MOODS = [0, 1, 2, 3, 4, 5];
const INFUSIONS = ['waiting', 'prep', 'active', 'done'];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <span className="text-[12px] font-semibold tracking-[0.06em] text-muted-foreground uppercase">
        {title}
      </span>
      {children}
    </section>
  );
}

const rowClass = 'flex flex-wrap items-center gap-3';

/**
 * Vitrine interna dos componentes do design system. Rota `/design-system`, só
 * em desenvolvimento. Durante a migração esta tela mostrava cada componente
 * lado a lado com a versão antiga em CSS Modules; concluída a migração e
 * apagados os antigos, ela voltou a ser uma vitrine simples.
 */
export default function DesignSystemShowcase() {
  const { showToast } = useToast();
  const [modalOpen, setModalOpen] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [selectedTag, setSelectedTag] = useState('oncologia');
  const [selectedMetric, setSelectedMetric] = useState('nausea');
  const [switchOn, setSwitchOn] = useState(true);
  const [checked, setChecked] = useState(false);
  const [senha, setSenha] = useState('Supera@2026');
  const [intensidade, setIntensidade] = useState(3);

  return (
    <div className="flex min-h-screen flex-col">
      <Header title="Design System" subtitle="Jornada Supera — vitrine interna" bordered />

      <div className="flex flex-1 flex-col gap-8 px-4 pb-8">
        <Section title="Logo">
          <div className={rowClass}>
            <Logo size="sm" />
            <Logo size="md" />
            <Logo size="lg" />
          </div>
        </Section>

        <Section title="Button">
          <div className={rowClass}>
            <Button variant="primary">Primário</Button>
            <Button variant="secondary">Secundário</Button>
            <Button variant="outline">Contorno</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="destructive">Destrutivo</Button>
          </div>
          <div className={rowClass}>
            <Button size="sm">Pequeno</Button>
            <Button size="md">Médio</Button>
            <Button size="lg">Grande</Button>
            <Button loading>Carregando</Button>
            <Button disabled>Desabilitado</Button>
          </div>
          <div className={rowClass}>
            <Button iconLeft={Plus}>Novo registro</Button>
            <Button iconLeft={Bell} variant="outline">
              Lembretes
            </Button>
            <Button iconLeft={Search} variant="ghost" />
            <Button pill variant="secondary">
              Pill
            </Button>
          </div>
        </Section>

        <Section title="Input">
          <div className="flex max-w-[360px] flex-col gap-3">
            <Input label="Nome completo" placeholder="Como podemos te chamar?" />
            <Input
              label="Telefone"
              helperText="Usamos esse número para lembretes de consulta."
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
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                />
              }
            />
            <Input label="CPF" error="Verifique o número informado." placeholder="000.000.000-00" />
            <Input label="Campo desabilitado" disabled placeholder="Indisponível" />
          </div>
        </Section>

        <Section title="Card">
          <div className={rowClass}>
            <Card className="w-[220px]">
              <strong>Card padrão</strong>
              <p>Conteúdo em destaque neutro.</p>
            </Card>
            <Card variant="primary" decorated className="w-[220px]">
              <strong>Primário decorado</strong>
            </Card>
            <Card variant="outline" className="w-[220px]">
              <strong>Contorno</strong>
            </Card>
            <Card flat className="w-[220px]">
              <strong>Flat (sem sombra)</strong>
            </Card>
          </div>
        </Section>

        <Section title="Avatar">
          <div className={rowClass}>
            <Avatar name="Rafael Mendes" size="sm" />
            <Avatar name="Rafael Mendes" size="md" />
            <Avatar name="Rafael Mendes" size="lg" />
            <Avatar name="Rafael Mendes" size="xl" ring />
          </div>
        </Section>

        <Section title="Badge">
          <div className={rowClass}>
            {MOODS.map((mood) => (
              <Badge key={mood} tone={`mood-${mood}`} withDot>
                Grau {mood}
              </Badge>
            ))}
          </div>
          <div className={rowClass}>
            {INFUSIONS.map((status) => (
              <Badge key={status} tone={`infusion-${status}`} variant="solid">
                {status}
              </Badge>
            ))}
          </div>
        </Section>

        <Section title="Tag">
          <div className={rowClass}>
            {['oncologia', 'nutrição', 'psicologia', 'enfermagem'].map((item) => (
              <Tag key={item} selected={selectedTag === item} onClick={() => setSelectedTag(item)}>
                {item}
              </Tag>
            ))}
            <Tag>não clicável</Tag>
          </div>
        </Section>

        <Section title="Select Menu">
          <div className={rowClass}>
            <SelectMenu
              value={selectedMetric}
              onChange={setSelectedMetric}
              options={[
                { value: 'nausea', label: 'Náusea' },
                { value: 'vomiting', label: 'Vômito' },
                { value: 'pain', label: 'Dor' },
                { value: 'fatigue', label: 'Fadiga' },
              ]}
              aria-label="Sintoma exibido no gráfico (exemplo)"
            />
          </div>
        </Section>

        <Section title="Switch e Checkbox">
          <div className="flex max-w-[360px] flex-col gap-3">
            <Switch id="ds-switch" checked={switchOn} onChange={setSwitchOn} label="Lembretes 24h" />
            <Checkbox
              id="ds-check"
              checked={checked}
              onChange={setChecked}
              label="Li e aceito os termos de uso."
            />
          </div>
        </Section>

        <Section title="PasswordStrengthMeter">
          <div className="flex max-w-[360px] flex-col gap-2">
            <Input
              label="Senha"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              placeholder="Digite para ver a força"
            />
            <PasswordStrengthMeter password={senha} />
          </div>
        </Section>

        <Section title="SymptomSlider">
          <div className="max-w-[360px]">
            <SymptomSlider
              nome="Náusea"
              descricao="Enjoo ou vontade de vomitar"
              value={intensidade}
              onChange={setIntensidade}
            />
          </div>
        </Section>

        <Section title="IconHeading">
          <IconHeading
            icon={Heart}
            title="Como você está hoje?"
            description="Registre seus sintomas para acompanhar a evolução."
          />
        </Section>

        <Section title="Loading">
          <Loading inline label="Sincronizando diário…" />
        </Section>

        <Section title="EmptyState e ErrorState">
          <EmptyState
            icon={Inbox}
            title="Nenhum registro ainda"
            description="Seus registros do diário aparecem aqui."
            actionLabel="Novo registro"
            onAction={() => showToast('Ação de exemplo.', { variant: 'info' })}
          />
          <ErrorState onRetry={() => showToast('Tentando novamente…', { variant: 'info' })} />
        </Section>

        <Section title="Modal e Toast">
          <div className={rowClass}>
            <Button onClick={() => setModalOpen(true)}>Abrir modal</Button>
            <Button variant="outline" onClick={() => showToast('Registro salvo.', { variant: 'success' })}>
              Toast sucesso
            </Button>
            <Button variant="outline" onClick={() => showToast('Não foi possível salvar.', { variant: 'error' })}>
              Toast erro
            </Button>
          </div>
          <Modal
            open={modalOpen}
            onClose={() => setModalOpen(false)}
            title="Confirmar infusão"
            titleIcon={Syringe}
            footer={
              <>
                <Button variant="outline" fullWidth onClick={() => setModalOpen(false)}>
                  Cancelar
                </Button>
                <Button fullWidth onClick={() => setModalOpen(false)}>
                  Confirmar
                </Button>
              </>
            }
          >
            <p>Exemplo de conteúdo do modal.</p>
          </Modal>
        </Section>
      </div>

      <BottomTab />
    </div>
  );
}
