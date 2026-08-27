import Avatar from '../../components/ui/avatar';

function getGreeting() {
  const hour = new Date().getHours();

  if (hour >= 5 && hour <= 11) return 'Bom dia,';
  if (hour >= 12 && hour <= 17) return 'Boa tarde,';
  return 'Boa noite,';
}

function getFirstName(name = '') {
  return name.trim().split(/\s+/)[0] || '';
}

interface GreetingHeaderProps {
  nome: string;
  /** Sem fonte hoje — `Patient` não tem campo de foto (ver Home.tsx). */
  fotoUrl?: string;
}

export default function GreetingHeader({ nome, fotoUrl }: GreetingHeaderProps) {
  const greeting = getGreeting();
  const firstName = getFirstName(nome);

  return (
    <header className="flex items-center justify-between px-6 pt-6 pb-4">
      <div className="flex flex-col">
        <p className="text-[14px] text-muted-foreground">{greeting}</p>
        <h1 className="text-[24px]/[32px] font-semibold tracking-[-0.6px] text-foreground">
          {firstName} 👋
        </h1>
      </div>

      {/* Avatar ainda não foi migrado (continua em components/Avatar). Ele só
          expõe tamanhos fixos (sm/md/lg/xl) e a cor do anel via custom
          property com fallback — nenhum dos dois cobre este caso (44px, anel
          na cor primária). `style` é repassado ao nó raiz via `{...rest}` do
          próprio Avatar, então segue sendo o único jeito de sobrescrever por
          fora até ele ser migrado. */}
      <Avatar
        src={fotoUrl}
        name={nome}
        size="lg"
        ring
        style={{
          width: 44,
          height: 44,
          boxShadow: '0 0 0 2px color-mix(in srgb, var(--color-primary) 20%, transparent)',
        }}
      />
    </header>
  );
}
