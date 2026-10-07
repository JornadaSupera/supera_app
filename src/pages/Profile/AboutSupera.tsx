import type { ReactNode } from 'react';
import { Eye, Heart, Target, type LucideIcon } from 'lucide-react';
import flowerBranch from '@/assets/design/flower-branch.webp';
import Card from '../../components/ui/card';
import { cn } from '../../lib/utils';
import KnowledgeScreen from '../KnowledgeCenter/KnowledgeScreen';
import { useGoBackOr } from '../../hooks/useGoBackOr';
import { CLINIC_MISSION, CLINIC_MOTTO, CLINIC_VALUES, CLINIC_VISION } from '../../lib/clinicIdentity';

interface AboutCardProps {
  icon: LucideIcon;
  title: string;
  /** Pintura de fundo, atrás do texto (posição absoluta, `-z-10`). */
  decoration?: ReactNode;
  children: ReactNode;
}

/**
 * Cartão branco com o ícone de traço e o título no verde de texto do app. O
 * `raised` é o card de destaque do guia: 20px de canto e a sombra única. O
 * título é o de cartão (`text-card-title`, 17/22, em negrito), o mesmo dos
 * cartões da Central de Conhecimento — o `text-section` é o da faixa.
 *
 * Com `decoration`, o cartão vira um contexto próprio (`isolate`): a pintura
 * (`-z-10`) fica acima do branco do cartão e abaixo do texto, e a borda dele
 * (`overflow-hidden`, do `Card`) a corta.
 */
function AboutCard({ icon: Icon, title, decoration, children }: AboutCardProps) {
  return (
    <Card as="section" elevation="raised" padding="md" className={cn(decoration && 'isolate')}>
      {decoration}
      <div className="flex flex-col gap-3">
        <h2 className="flex items-center gap-3 text-card-title font-bold text-primary-deep">
          <Icon size={24} strokeWidth={2} className="shrink-0" aria-hidden="true" />
          {title}
        </h2>
        {children}
      </div>
    </Card>
  );
}

/**
 * O ramo em flor do pacote da clínica no fundo dos valores (teste pedido em
 * 07/10, no lugar do buquê): no pé do cartão, de ponta a ponta, subindo da
 * esquerda para a direita, com o acróstico por cima. Um pouco mais claro, para
 * o texto continuar legível. Decorativo (`alt` vazio). As medidas partem da
 * área de conteúdo do `Card`: os `-left-4`/`-bottom-4` e os 2 rem a mais de
 * largura chegam às bordas do cartão, por cima dos 16 px de respiro.
 * `max-w-none!` vence o reset global de `img` (fora de camada).
 */
function ValuesBranch() {
  return (
    <img
      src={flowerBranch}
      alt=""
      width={1300}
      height={600}
      className="pointer-events-none absolute -bottom-4 -left-4 -z-10 h-auto w-[calc(100%_+_2rem)] max-w-none! opacity-90 select-none"
    />
  );
}

/**
 * Os valores em acróstico, NA VERTICAL: uma letra grande por linha, alinhadas
 * numa coluna, para a palavra SUPERA ser lida de cima para baixo, com o valor
 * ao lado. O leitor de tela lê só os valores — a letra solta antes de cada um
 * seria ruído.
 */
function ValuesAcrostic() {
  return (
    <ul role="list" className="flex flex-col gap-1.5">
      {CLINIC_VALUES.map((value) => (
        <li key={value.letter} className="flex items-center gap-5">
          <span
            aria-hidden="true"
            className="w-9 shrink-0 text-center text-[36px]/[1.15] font-bold text-primary-deep"
          >
            {value.letter}
          </span>
          <span className="text-body font-semibold text-foreground">{value.label}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * "Sobre a Supera": missão, visão e valores da clínica, com os textos das
 * paredes dela (pacote de design de 03/10/2026). Conteúdo fixo, sem dado de
 * paciente: titular e acompanhante leem. A moldura é a mesma da Central de
 * Conhecimento — capa verde, voltar e o logotipo —, com a pintura `agua-verde`
 * do pacote da clínica no fundo da capa (07/10), no lugar da padronagem do "S":
 * o guia a indica como fundo de cabeçalho, e esta é a página da identidade da
 * clínica.
 */
export default function AboutSupera() {
  const goBack = useGoBackOr('/perfil');

  return (
    <KnowledgeScreen
      onBack={goBack}
      coverArt="water"
      cover={
        // O título da capa do guia ("CabecalhoMarca"): `text-hero` (24/30) em
        // negrito, um ponto abaixo do guia. Do título à frase, o vão da capa da
        // Central de Conhecimento, que usa a mesma moldura.
        <div className="flex flex-col gap-3 pt-4">
          <h1 className="text-hero font-bold">Sobre a Supera</h1>
          <p className="text-body-sm">Quem somos e o que nos move.</p>
        </div>
      }
    >
      <AboutCard icon={Target} title="Missão">
        <p className="text-body text-foreground">{CLINIC_MISSION}</p>
      </AboutCard>

      <AboutCard icon={Eye} title="Visão">
        <p className="text-body text-foreground">{CLINIC_VISION}</p>
      </AboutCard>

      <AboutCard icon={Heart} title="Valores" decoration={<ValuesBranch />}>
        <ValuesAcrostic />
      </AboutCard>

      {/* A frase final sobre o vidro com bambus das divisórias da clínica, no
          `text-title` (20/26). Do lado, o respiro de 16 px dos cartões acima,
          com o texto alinhado ao deles; em cima e embaixo, 24 px. */}
      <blockquote className="bamboo-glass overflow-hidden rounded-2xl border border-border px-4 py-6">
        <p className="text-title text-primary-deep">
          {CLINIC_MOTTO.map((part) =>
            part.strong ? (
              <strong key={part.text} className="font-bold">
                {part.text}
              </strong>
            ) : (
              part.text
            )
          )}
        </p>
      </blockquote>
    </KnowledgeScreen>
  );
}
