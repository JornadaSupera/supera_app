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
}

/**
 * O alto da Início, como o cabeçalho de marca do guia ("CabecalhoMarca"): a
 * capa verde da Supera, com a padronagem do "S", o logotipo em branco, a
 * saudação e a pergunta da tela. Altura contida, para não empurrar o
 * conteúdo: os cartões começam logo abaixo da capa (ver `Home`).
 *
 * O recorte é o da forma `header` da `BrandCover`, comum às capas do app
 * (Chat, Perfil, Central): com o canto do folheto, e não os dois cantos de
 * 20 px do guia.
 */
export default function GreetingHeader({ nome }: GreetingHeaderProps) {
  const greeting = getGreeting();
  const firstName = getFirstName(nome);

  return (
    // A faixa da barra de status vem logo acima (`Home`): a padronagem continua
    // a dela. `shrink-0`: a capa é filha da coluna flexível que rola e corta o
    // que sobra (`overflow-hidden`), então sem ele seria espremida.
    <BrandCover
      shape="header"
      className="flex shrink-0 flex-col gap-6 px-4 pt-6 pb-8 [--brand-pattern-shift:var(--safe-top)]"
    >
      {/* 34 px de altura, como no guia: a largura sai da proporção do arquivo. */}
      <Logo size="sm" tone="inverse" className="w-[144px]" />

      <div className="flex flex-col gap-0.5">
        {/* Sem nome (sessão ainda sem `full_name`), a saudação fica sem a vírgula. */}
        <p className="text-label">
          {firstName ? `${greeting} ${firstName}` : greeting.slice(0, -1)}
        </p>
        <h1 className="text-hero font-bold">Como você está hoje?</h1>
      </div>
    </BrandCover>
  );
}
