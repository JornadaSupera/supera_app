import type { ReactNode } from 'react';
import { Eye, Heart, Target, type LucideIcon } from 'lucide-react';
import Card from '../../components/ui/card';
import KnowledgeScreen from '../KnowledgeCenter/KnowledgeScreen';
import { useGoBackOr } from '../../hooks/useGoBackOr';
import { CLINIC_MISSION, CLINIC_MOTTO, CLINIC_VALUES, CLINIC_VISION } from '../../lib/clinicIdentity';

interface AboutCardProps {
  icon: LucideIcon;
  title: string;
  children: ReactNode;
}

/** Cartão branco com o ícone de traço e o título no verde de texto do app. */
function AboutCard({ icon: Icon, title, children }: AboutCardProps) {
  return (
    <Card as="section" elevation="raised" padding="md" className="rounded-[20px]">
      <div className="flex flex-col gap-3">
        <h2 className="flex items-center gap-3 text-[19px]/[1.3] font-bold text-primary-deep">
          <Icon size={24} strokeWidth={2} className="shrink-0" aria-hidden="true" />
          {title}
        </h2>
        {children}
      </div>
    </Card>
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
            className="w-9 shrink-0 text-center text-[40px]/[1.15] font-bold text-primary-deep"
          >
            {value.letter}
          </span>
          <span className="text-[17px] font-semibold text-foreground">{value.label}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * "Sobre a Supera": missão, visão e valores da clínica, com os textos das
 * paredes dela (pacote de design de 03/10/2026). Conteúdo fixo, sem dado de
 * paciente: titular e acompanhante leem. A moldura é a mesma da Central de
 * Conhecimento — capa verde com a padronagem do "S", voltar e o logotipo.
 */
export default function AboutSupera() {
  const goBack = useGoBackOr('/perfil');

  return (
    <KnowledgeScreen
      onBack={goBack}
      cover={
        <div className="flex flex-col gap-1.5 pt-4">
          <h1 className="text-[30px]/[1.08] font-bold tracking-[-0.9px]">Sobre a Supera</h1>
          <p className="text-[15px]/[1.5]">Quem somos e o que nos move.</p>
        </div>
      }
    >
      <AboutCard icon={Target} title="Missão">
        <p className="text-[16px]/[1.55] text-foreground">{CLINIC_MISSION}</p>
      </AboutCard>

      <AboutCard icon={Eye} title="Visão">
        <p className="text-[16px]/[1.55] text-foreground">{CLINIC_VISION}</p>
      </AboutCard>

      <AboutCard icon={Heart} title="Valores">
        <ValuesAcrostic />
      </AboutCard>

      {/* A frase final sobre o vidro com bambus das divisórias da clínica. */}
      <blockquote className="bamboo-glass overflow-hidden rounded-[20px] border border-border px-5 py-7">
        <p className="text-[22px]/[1.35] text-primary-deep">
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
