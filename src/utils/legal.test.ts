import { describe, expect, it } from 'vitest';
import { isAddressOnlyBody } from './legal';

describe('isAddressOnlyBody', () => {
  it('reconhece o corpo que é só o endereço da página, como o painel publica hoje', () => {
    expect(isAddressOnlyBody('https://jornada-supera-painel.web.app/termos')).toBe(true);
    expect(isAddressOnlyBody('  https://jornada-supera-painel.web.app/privacidade\n')).toBe(true);
  });

  it('deixa passar o texto de verdade, mesmo com um link no meio', () => {
    expect(isAddressOnlyBody('Termos de Uso\nLeia em https://exemplo.com.')).toBe(false);
    expect(isAddressOnlyBody('Ao usar o app, você concorda com estes termos.')).toBe(false);
  });
});
