import { type ClassValue, clsx } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

/**
 * O `tailwind-merge` só conhece os nomes padrão do Tailwind. Sem a lista, ele
 * lê `text-body` como COR de texto e, num `cn('text-body', 'text-primary-deep')`,
 * descarta o tamanho. Os nomes vêm da escala de letra e dos tokens do
 * `index.css`.
 */
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      text: ['hero', 'title', 'section', 'card-title', 'body', 'body-sm', 'label', 'caption'],
      shadow: ['card'],
      radius: ['control', 'callout'],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
