import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { maskCpf } from '../../utils/contact';
import { ageInYears, parseDateOnly } from '../../utils/date';
import ProfilePhoto from './ProfilePhoto';
import type { Patient } from '../../types';

interface ProfileIdentitySectionProps {
  patient: Patient;
  isCaregiver: boolean;
}

/** Topo do Perfil: foto, nome, CPF (mascarado até o titular pedir) e idade. */
export default function ProfileIdentitySection({ patient, isCaregiver }: ProfileIdentitySectionProps) {
  const [isCpfRevealed, setIsCpfRevealed] = useState(false);

  // Na sessão do acompanhante o banco não entrega nascimento nem CPF
  // (`get_my_ward()` projeta só id, nome, fase e situação), então a linha
  // simplesmente não aparece — em vez de mostrar "NaN anos".
  const ageLabel = patient.birthDate
    ? `${ageInYears(patient.birthDate)} anos · nasc. ${parseDateOnly(patient.birthDate).toLocaleDateString('pt-BR')}`
    : null;

  return (
    <section className="flex flex-col items-center gap-[4px] text-center">
      {/* Esta tela mostra a ficha de QUEM ESTÁ SENDO ACOMPANHADO. A foto,
          porém, é do dono da conta logada — o bucket é privado por pasta de
          conta, e o acompanhante não tem como ver a do tutelado. Desenhá-la
          aqui a poria logo acima do nome de outra pessoa. Na sessão do
          acompanhante ficam as iniciais do tutelado, e a foto da conta dele
          fica no cartão "Meu vínculo", logo abaixo. */}
      <ProfilePhoto name={patient.name} canEdit={!isCaregiver} showPhoto={!isCaregiver} />
      <p className="text-[18px] font-semibold text-foreground">{patient.name}</p>
      {/* O CPF é do titular e só ele o vê. O acompanhante não recebe o
          valor do banco, então não há o que mascarar nem o que revelar. */}
      {patient.cpf && (
        <button
          type="button"
          onClick={() => setIsCpfRevealed((current) => !current)}
          aria-pressed={isCpfRevealed}
          aria-label={isCpfRevealed ? 'Ocultar CPF' : 'Mostrar CPF'}
          className="flex min-h-[24px] cursor-pointer items-center gap-1.5 border-none bg-transparent p-0 text-[12px] text-muted-foreground"
        >
          CPF {isCpfRevealed ? patient.cpf : maskCpf(patient.cpf)}
          {isCpfRevealed ? (
            <EyeOff size={12} strokeWidth={2} aria-hidden="true" />
          ) : (
            <Eye size={12} strokeWidth={2} aria-hidden="true" />
          )}
        </button>
      )}
      {ageLabel && <p className="text-[12px] text-muted-foreground">{ageLabel}</p>}
    </section>
  );
}
