import Avatar from '../../components/ui/avatar';
import BrandCover from '../../components/ui/brand-cover';
import Logo from '../../components/ui/logo';

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

/**
 * O alto da Início: a capa verde da Supera, com a padronagem do "S", o
 * logotipo em branco, o avatar e a saudação. Os cartões da tela começam sobre
 * a borda de baixo da capa (ver `Home`).
 */
export default function GreetingHeader({ nome, fotoUrl }: GreetingHeaderProps) {
  const greeting = getGreeting();
  const firstName = getFirstName(nome);

  return (
    <BrandCover shape="header" patternScale={0.3} className="flex flex-col gap-6 px-6 pt-4 pb-16">
      <div className="flex items-center justify-between gap-4">
        <Logo size="sm" tone="inverse" className="w-[104px]" />

        {/* Avatar ainda não foi migrado (continua em components/Avatar). Ele só
            expõe tamanhos fixos (sm/md/lg/xl) e a cor do anel via custom
            property com fallback — nenhum dos dois cobre este caso (44px, anel
            claro sobre a capa verde). `style` é repassado ao nó raiz via
            `{...rest}` do próprio Avatar, então segue sendo o único jeito de
            sobrescrever por fora até ele ser migrado. */}
        <Avatar
          src={fotoUrl}
          name={nome}
          size="lg"
          ring
          style={{
            width: 44,
            height: 44,
            boxShadow: '0 0 0 3px color-mix(in srgb, var(--color-on-brand-cover) 35%, transparent)',
          }}
        />
      </div>

      <div className="flex flex-col gap-0.5">
        <p className="text-[15px]">{greeting}</p>
        <h1 className="text-[30px]/[1.1] font-bold tracking-[-0.9px]">{firstName} 👋</h1>
      </div>
    </BrandCover>
  );
}
