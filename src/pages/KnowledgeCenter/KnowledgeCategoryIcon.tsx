import IconTile, { type IconTileProps } from '../../components/ui/icon-tile';
import { getKnowledgeCategoryAppearance } from '../../utils/knowledgeCenter';

export interface KnowledgeCategoryIconProps extends Omit<IconTileProps, 'icon'> {
  categoryId: string;
}

/** A pastilha com o ícone do tema da Central de Conhecimento. */
export default function KnowledgeCategoryIcon({ categoryId, ...rest }: KnowledgeCategoryIconProps) {
  return <IconTile icon={getKnowledgeCategoryAppearance(categoryId).icon} {...rest} />;
}
