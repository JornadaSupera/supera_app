// Qual cor de ícone a barra do sistema (relógio, bateria; botões de navegação
// no Android) precisa para aparecer sobre o que está atrás dela: ícone claro
// sobre fundo escuro (a capa verde) e escuro sobre fundo claro.

/** O tom do fundo atrás da barra. */
export type SystemBarTone = 'dark' | 'light';

interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

/**
 * Lê uma cor como o navegador a devolve no estilo computado: `rgb()`,
 * `rgba()` ou `color(srgb …)` — este último é como o Chrome escreve o
 * resultado de um `color-mix()`. Canais de 0 a 255 e alfa de 0 a 1; `null`
 * para o que não for cor (`none`, `transparent` em formato desconhecido).
 */
export function parseComputedColor(value: string): Rgba | null {
  const rgb = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+%?))?\s*\)$/i.exec(value.trim());
  if (rgb) {
    return { r: Number(rgb[1]), g: Number(rgb[2]), b: Number(rgb[3]), a: parseAlpha(rgb[4]) };
  }

  const srgb = /^color\(\s*srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+%?))?\s*\)$/i.exec(value.trim());
  if (srgb) {
    return {
      r: Number(srgb[1]) * 255,
      g: Number(srgb[2]) * 255,
      b: Number(srgb[3]) * 255,
      a: parseAlpha(srgb[4]),
    };
  }

  return null;
}

function parseAlpha(value: string | undefined): number {
  if (value === undefined) return 1;
  return value.endsWith('%') ? Number(value.slice(0, -1)) / 100 : Number(value);
}

/** Luminância relativa (WCAG) de uma cor opaca: 0 é preto, 1 é branco. */
function relativeLuminance({ r, g, b }: Rgba): number {
  const channel = (value: number) => {
    const c = value / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/**
 * Abaixo dela, o fundo é "escuro" e leva ícone claro. Um pouco acima do ponto
 * em que branco e preto empatam em contraste (0,179): assim os dois verdes da
 * marca que levam texto branco — o da capa (#1C736B) e o "profundo" da
 * abertura (#1C8C82) — ficam com o relógio branco, como o logotipo sobre eles,
 * e o verde claro dos botões (#33BAAB), que leva texto escuro, com o escuro.
 */
const DARK_BACKGROUND_LUMINANCE = 0.25;

/**
 * O tom do que se vê atrás da barra, a partir das cores de fundo das camadas
 * naquele ponto, da de cima para a de baixo. Camadas translúcidas (um véu de
 * folha aberta) se somam à de baixo; a primeira opaca encerra a conta. Sem
 * nenhuma cor, vale `fallback` (o fundo da página).
 */
export function toneOfLayers(layerColors: readonly string[], fallback: SystemBarTone): SystemBarTone {
  const layers: Rgba[] = [];

  for (const value of layerColors) {
    const color = parseComputedColor(value);
    if (!color || color.a === 0) continue;
    layers.push(color);
    if (color.a >= 1) break;
  }

  if (layers.length === 0) return fallback;

  const base = layers.at(-1) as Rgba;
  let composed: Rgba =
    base.a >= 1 ? base : fallback === 'dark' ? { r: 0, g: 0, b: 0, a: 1 } : { r: 255, g: 255, b: 255, a: 1 };
  if (base.a < 1) composed = blend(base, composed);

  for (let index = layers.length - 2; index >= 0; index--) {
    composed = blend(layers[index], composed);
  }

  return relativeLuminance(composed) < DARK_BACKGROUND_LUMINANCE ? 'dark' : 'light';
}

/** Uma camada translúcida por cima de uma opaca. */
function blend(top: Rgba, bottom: Rgba): Rgba {
  return {
    r: top.r * top.a + bottom.r * (1 - top.a),
    g: top.g * top.a + bottom.g * (1 - top.a),
    b: top.b * top.a + bottom.b * (1 - top.a),
    a: 1,
  };
}
