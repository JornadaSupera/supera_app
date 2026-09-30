import { Calendar, CircleAlert, Heart, Pill } from 'lucide-react';
import { ProfileInfoRow, ProfileInfoValue, ProfileSection } from './ProfileRows';
import type { Patient } from '../../types';

interface ProfileTreatmentSectionProps {
  patient: Patient;
}

/** Diagnóstico, protocolo, estadiamento, alergias e reações prévias da ficha. */
export default function ProfileTreatmentSection({ patient }: ProfileTreatmentSectionProps) {
  return (
    <ProfileSection title="TRATAMENTO">
      <div className="flex flex-col gap-2">
        <ProfileInfoRow icon={Heart} label="DIAGNÓSTICO">
          <ProfileInfoValue>
            {patient.diagnosis
              ? `${patient.diagnosis.cid} · ${patient.diagnosis.description}`
              : 'Ainda não lançado'}
          </ProfileInfoValue>
        </ProfileInfoRow>
        <ProfileInfoRow icon={Pill} label="PROTOCOLO">
          <ProfileInfoValue>{patient.protocol ?? 'Nenhum plano em andamento'}</ProfileInfoValue>
        </ProfileInfoRow>
        <ProfileInfoRow icon={Calendar} label="ESTADIAMENTO">
          <ProfileInfoValue>{patient.stage ?? 'Não informado'}</ProfileInfoValue>
        </ProfileInfoRow>
        <ProfileInfoRow icon={CircleAlert} label="ALERGIAS" iconClassName="text-destructive">
          <ProfileInfoValue>
            {patient.allergies.length > 0 ? patient.allergies.join(', ') : 'Nenhuma registrada'}
          </ProfileInfoValue>
        </ProfileInfoRow>
        {patient.previousReactions.length > 0 && (
          <div className="mt-1 rounded-xl border border-border bg-[color-mix(in_srgb,var(--color-muted)_30%,transparent)] p-3">
            <p className="text-[10px] font-medium tracking-[0.05em] text-muted-foreground uppercase">
              REAÇÕES PRÉVIAS
            </p>
            <ul className="mt-1 flex flex-col gap-[4px]">
              {patient.previousReactions.map((reaction) => (
                <li
                  key={reaction}
                  className="text-[12px] leading-[1.4] text-foreground before:content-['·_']"
                >
                  {reaction}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </ProfileSection>
  );
}
