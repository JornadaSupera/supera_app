import { Calendar, CircleAlert, Heart, Pill } from 'lucide-react';
import { ProfileInfoRow, ProfileInfoValue, ProfileSection } from './ProfileRows';
import { formatTreatmentCycles } from '../../utils/treatmentPlan';
import type { Patient } from '../../types';

interface ProfileTreatmentSectionProps {
  patient: Patient;
}

/** Diagnóstico, protocolo (com os ciclos), estadiamento, alergias e reações prévias da ficha. */
export default function ProfileTreatmentSection({ patient }: ProfileTreatmentSectionProps) {
  const cycles = formatTreatmentCycles(patient.currentCycle, patient.cyclesPlanned);

  return (
    <ProfileSection title="Tratamento">
      <div className="flex flex-col gap-2">
        <ProfileInfoRow icon={Heart} label="Diagnóstico">
          <ProfileInfoValue>
            {patient.diagnosis
              ? `${patient.diagnosis.cid} · ${patient.diagnosis.description}`
              : 'Ainda não lançado'}
          </ProfileInfoValue>
        </ProfileInfoRow>
        <ProfileInfoRow icon={Pill} label="Protocolo">
          <ProfileInfoValue>{patient.protocol ?? 'Nenhum plano em andamento'}</ProfileInfoValue>
          {/* Os ciclos do plano, embaixo do protocolo ("Ciclo 3 de 6"), como a
              equipe embaixo do nome no compromisso. Sem plano ou sem ciclos
              lançados, a linha não aparece. */}
          {patient.protocol && cycles && (
            <p className="text-body-sm text-muted-foreground">{cycles}</p>
          )}
        </ProfileInfoRow>
        <ProfileInfoRow icon={Calendar} label="Estadiamento">
          <ProfileInfoValue>{patient.stage ?? 'Não informado'}</ProfileInfoValue>
        </ProfileInfoRow>
        {/* Alergia é ponto de atenção, não alarme: o laranja escuro de texto de
            atenção do guia. O vermelho fica para os sinais de alerta. */}
        <ProfileInfoRow icon={CircleAlert} label="Alergias" iconClassName="text-orange-deep">
          <ProfileInfoValue>
            {patient.allergies.length > 0 ? patient.allergies.join(', ') : 'Nenhuma registrada'}
          </ProfileInfoValue>
        </ProfileInfoRow>
        {/* Bloco agrupado em `surface-alt`, como pede o guia. Os espaços são
            `gap`: o reset de `index.css` zera a margem de `<p>` e `<ul>`. O
            `role="list"` devolve a lista ao VoiceOver do Safari, que a ignora
            quando o marcador nativo some. */}
        {patient.previousReactions.length > 0 && (
          <div className="mt-1 flex flex-col gap-1 rounded-xl bg-muted p-4">
            <p className="text-caption font-medium text-muted-foreground">Reações prévias</p>
            <ul role="list" className="flex flex-col gap-1">
              {patient.previousReactions.map((reaction) => (
                <li
                  key={reaction}
                  className="text-body-sm text-foreground before:mr-2 before:text-primary-deep before:content-['•']"
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
