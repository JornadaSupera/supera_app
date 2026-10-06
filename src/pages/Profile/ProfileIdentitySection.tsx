import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import BrandCover from '../../components/ui/brand-cover';
import Logo from '../../components/ui/logo';
import { maskCpf } from '../../utils/contact';
import { ageInYears, parseDateOnly } from '../../utils/date';
import { formatCPF } from '../../utils/masks';
import ProfilePhoto from './ProfilePhoto';
import type { Patient } from '../../types';

interface ProfileIdentitySectionProps {
  patient: Patient;
  isCaregiver: boolean;
}

/**
 * O alto do Perfil, no mesmo molde do alto da Início (pedido de 05/10: "usar
 * menos espaço, como a tela de início"): a capa verde com a padronagem do "S",
 * o logotipo na linha de cima — com a foto pequena à direita —, a linha curta
 * e o nome. Abaixo do nome, a idade e o CPF (mascarado até o titular pedir).
 * Faz as vezes do cabeçalho da aba, por isso a linha curta mora aqui. O texto
 * é branco, como em toda capa da marca.
 */
export default function ProfileIdentitySection({ patient, isCaregiver }: ProfileIdentitySectionProps) {
  const [isCpfRevealed, setIsCpfRevealed] = useState(false);

  // Na sessão do acompanhante o banco não entrega nascimento nem CPF
  // (`get_my_ward()` projeta só id, nome, fase e situação), então a linha
  // simplesmente não aparece — em vez de mostrar "NaN anos".
  const ageLabel = patient.birthDate
    ? `${ageInYears(patient.birthDate)} anos · nasc. ${parseDateOnly(patient.birthDate).toLocaleDateString('pt-BR')}`
    : null;

  return (
    // A faixa da barra de status vem logo acima (`ProfileHub`): a padronagem
    // continua a dela. As margens e o logotipo são os da Início
    // (`GreetingHeader`). `--color-ring` branco: o laranja do foco sobre o
    // verde da capa não passa nos 3:1. Vale para a foto, o remover e o CPF.
    <BrandCover
      shape="header"
      className="flex shrink-0 flex-col gap-6 px-4 pt-6 pb-8 [--brand-pattern-shift:var(--safe-top)] [--color-ring:var(--color-on-brand-cover)]"
    >
      {/* A linha tem a altura do logotipo (34 px, como na Início), e a foto de
          48 px passa 7 px para cima e para baixo dela (`-my-[7px]`), centrada
          nele. Antes a foto esticava a linha: o logotipo descia 7 px e o
          texto, 10, e tudo pulava ao trocar de aba entre a Início e o Perfil. */}
      <div className="flex items-center justify-between gap-4">
        <Logo size="sm" tone="inverse" className="w-[144px]" />

        {/* Esta tela mostra a ficha de QUEM ESTÁ SENDO ACOMPANHADO. A foto,
            porém, é do dono da conta logada — o bucket é privado por pasta de
            conta, e o acompanhante não tem como ver a do tutelado. Desenhá-la
            aqui a poria ao lado do nome de outra pessoa. Na sessão do
            acompanhante ficam as iniciais do tutelado, e a foto da conta dele
            fica no cartão "Meu vínculo", logo abaixo. */}
        <div className="-my-[7px] flex shrink-0 items-center gap-3">
          <ProfilePhoto name={patient.name} canEdit={!isCaregiver} showPhoto={!isCaregiver} surface="cover" />
        </div>
      </div>

      <div className="flex flex-col gap-0.5">
        {/* Na sessão do acompanhante a ficha é de OUTRA pessoa: chamá-la de
            "Meu perfil" dizia que aquele cadastro era dele. */}
        <p className="text-label">{isCaregiver ? 'Quem você acompanha' : 'Meu perfil'}</p>
        <h1 className="text-hero font-bold break-words">{patient.name}</h1>

        {(ageLabel || patient.cpf) && (
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-caption font-medium">
            {ageLabel && <span>{ageLabel}</span>}

            {/* O CPF é do titular e só ele o vê. O acompanhante não recebe o
                valor do banco, então não há o que mascarar nem o que revelar.
                A linha fica baixa para não esticar a capa; o `after` leva a
                área de toque a 48px (18 + 15 + 15). */}
            {patient.cpf && (
              <button
                type="button"
                onClick={() => setIsCpfRevealed((current) => !current)}
                aria-pressed={isCpfRevealed}
                aria-label={isCpfRevealed ? 'Ocultar CPF' : 'Mostrar CPF'}
                className="relative inline-flex min-h-[18px] cursor-pointer items-center gap-1.5 rounded-sm border-none bg-transparent p-0 text-[var(--color-on-brand-cover)] after:absolute after:-inset-x-1 after:-inset-y-[15px]"
              >
                {/* O banco guarda só os dígitos: revelado, o CPF sai com a
                    pontuação de sempre, como o mascarado. */}
                <span>CPF {isCpfRevealed ? formatCPF(patient.cpf) : maskCpf(patient.cpf)}</span>
                {isCpfRevealed ? (
                  <EyeOff size={16} strokeWidth={2} aria-hidden="true" />
                ) : (
                  <Eye size={16} strokeWidth={2} aria-hidden="true" />
                )}
              </button>
            )}
          </div>
        )}
      </div>
    </BrandCover>
  );
}
