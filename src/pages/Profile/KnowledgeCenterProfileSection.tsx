import { BookOpenText } from 'lucide-react';
import NavigationRow from '../../components/ui/navigation-row';
import { KNOWLEDGE_CENTER_PATH } from '../../utils/knowledgeCenter';

/**
 * A porta de entrada da Central de Conhecimento no Perfil, numa seção própria
 * logo depois do tratamento — é sobre ele que o conteúdo fala.
 *
 * Titular e acompanhante veem: é conteúdo educativo, sem dado de paciente, e
 * quem cuida precisa das mesmas orientações (manusear o remédio, sinais de
 * alerta).
 */
export default function KnowledgeCenterProfileSection() {
  return (
    <section>
      <h2 className="mb-3 text-[12px] font-semibold tracking-[0.05em] text-muted-foreground uppercase">
        CONTEÚDO EDUCATIVO
      </h2>
      <NavigationRow
        to={KNOWLEDGE_CENTER_PATH}
        icon={BookOpenText}
        title="Central de Conhecimento"
        description="Dúvidas sobre o tratamento, em perguntas e respostas por tema."
      />
    </section>
  );
}
