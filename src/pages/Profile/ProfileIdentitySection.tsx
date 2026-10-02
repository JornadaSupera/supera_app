import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import BrandCover from '../../components/ui/brand-cover';
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
 * O alto do Perfil: a capa verde da Supera com a padronagem do "S", como na
 * Início e no Chat, com a foto, o nome, o CPF (mascarado até o titular pedir)
 * e a idade. Faz as vezes do cabeçalho da aba, por isso o sobretítulo mora
 * aqui. O texto é branco, como em toda capa da marca.
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
    <BrandCover
      shape="header"
      patternScale={0.3}
      className="flex flex-col items-center gap-2 px-6 pt-4 pb-7 text-center"
    >
      {/* Na sessão do acompanhante a ficha é de OUTRA pessoa: chamá-la de
          "MEU PERFIL" dizia que aquele cadastro era dele. */}
      <p className="text-[12px] font-semibold tracking-[0.08em] uppercase">
        {isCaregiver ? 'Quem você acompanha' : 'Meu perfil'}
      </p>

      {/* Esta tela mostra a ficha de QUEM ESTÁ SENDO ACOMPANHADO. A foto,
          porém, é do dono da conta logada — o bucket é privado por pasta de
          conta, e o acompanhante não tem como ver a do tutelado. Desenhá-la
          aqui a poria logo acima do nome de outra pessoa. Na sessão do
          acompanhante ficam as iniciais do tutelado, e a foto da conta dele
          fica no cartão "Meu vínculo", logo abaixo. */}
      <ProfilePhoto name={patient.name} canEdit={!isCaregiver} showPhoto={!isCaregiver} surface="cover" />

      <h1 className="text-[22px]/[1.2] font-bold tracking-[-0.5px]">{patient.name}</h1>

      {/* O CPF é do titular e só ele o vê. O acompanhante não recebe o
          valor do banco, então não há o que mascarar nem o que revelar. A
          pílula de vidro é a mesma do horário da equipe na capa do Chat; o
          `after` leva a área de toque a 44px. */}
      {patient.cpf && (
        <button
          type="button"
          onClick={() => setIsCpfRevealed((current) => !current)}
          aria-pressed={isCpfRevealed}
          aria-label={isCpfRevealed ? 'Ocultar CPF' : 'Mostrar CPF'}
          className="glass-brand relative inline-flex min-h-[32px] cursor-pointer items-center gap-2 rounded-full border-none px-3.5 py-1.5 text-[13px] text-[var(--color-on-brand-cover)] after:absolute after:inset-x-0 after:-inset-y-[6px]"
        >
          {/* O banco guarda só os dígitos: revelado, o CPF sai com a pontuação
              de sempre, como o mascarado. */}
          <span>CPF {isCpfRevealed ? formatCPF(patient.cpf) : maskCpf(patient.cpf)}</span>
          {isCpfRevealed ? (
            <EyeOff size={14} strokeWidth={2} aria-hidden="true" />
          ) : (
            <Eye size={14} strokeWidth={2} aria-hidden="true" />
          )}
        </button>
      )}

      {ageLabel && <p className="text-[13px]">{ageLabel}</p>}
    </BrandCover>
  );
}
