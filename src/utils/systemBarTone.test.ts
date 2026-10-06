import { describe, expect, it } from 'vitest';
import { parseComputedColor, toneOfLayers } from './systemBarTone';

describe('parseComputedColor', () => {
  it('lê rgb, rgba e o color(srgb) do color-mix', () => {
    expect(parseComputedColor('rgb(28, 115, 107)')).toEqual({ r: 28, g: 115, b: 107, a: 1 });
    expect(parseComputedColor('rgba(0, 0, 0, 0.4)')).toEqual({ r: 0, g: 0, b: 0, a: 0.4 });
    expect(parseComputedColor('color(srgb 1 0.5 0 / 0.5)')).toEqual({ r: 255, g: 127.5, b: 0, a: 0.5 });
  });

  it('o que não é cor volta nulo', () => {
    expect(parseComputedColor('none')).toBeNull();
  });
});

describe('toneOfLayers', () => {
  it('as capas verdes da marca levam ícone claro', () => {
    expect(toneOfLayers(['rgb(28, 115, 107)'], 'light')).toBe('dark');
    expect(toneOfLayers(['rgb(28, 140, 130)'], 'light')).toBe('dark');
  });

  it('o fundo do app e o verde claro dos botões levam ícone escuro', () => {
    expect(toneOfLayers(['rgb(241, 249, 247)'], 'dark')).toBe('light');
    expect(toneOfLayers(['rgb(51, 186, 171)'], 'dark')).toBe('light');
  });

  it('pula camadas transparentes e soma o véu à camada de baixo', () => {
    expect(toneOfLayers(['rgba(0, 0, 0, 0)', 'rgb(28, 115, 107)', 'rgb(255, 255, 255)'], 'light')).toBe('dark');
    expect(toneOfLayers(['rgba(0, 0, 0, 0.6)', 'rgb(241, 249, 247)'], 'light')).toBe('dark');
    expect(toneOfLayers(['rgba(0, 0, 0, 0.1)', 'rgb(241, 249, 247)'], 'dark')).toBe('light');
  });

  it('sem nenhuma cor, vale o fundo da página', () => {
    expect(toneOfLayers([], 'dark')).toBe('dark');
    expect(toneOfLayers(['rgba(0, 0, 0, 0)'], 'light')).toBe('light');
  });
});
