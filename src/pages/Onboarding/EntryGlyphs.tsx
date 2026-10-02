import { cn } from '@/lib/utils';
import type { GlyphProps } from './OnboardingGlyphs';

/*
 * Os desenhos do medalhão nas telas de entrada fora do carrossel: login e
 * cadastro (a pessoa), recuperação de senha (a chave, o envelope), a
 * confirmação do celular e a versão nova nas lojas. Seguem as regras dos do onboarding
 * (`OnboardingGlyphs.tsx`): caixa de 100, cor por `currentColor`, traços com
 * `pathLength="100"` para o `animate-draw`, movimento lento e, com movimento
 * reduzido, o desenho inteiro e parado. Decorativos: quem usa põe
 * `aria-hidden`.
 */

/** O traço que se desenha uma vez, da ponta ao fim. */
const DRAW = 'animate-draw [stroke-dasharray:100] motion-reduce:animate-none';

/** O que surge depois do desenho (o selo, o balão). */
const POP_LATE =
  'animate-pop [transform-box:fill-box] [transform-origin:center] [animation-delay:0.9s] motion-reduce:animate-none';

/** Anel que nasce do selo e some, devagar. Parado, dobraria a borda do selo. */
const PULSE = 'animate-node-pulse [transform-box:fill-box] [transform-origin:center] motion-reduce:hidden';

interface BadgeProps {
  cx: number;
  cy: number;
  mark: 'plus' | 'check' | 'download';
}

/** O traço de cada marca do selo, a partir do centro dele. */
function badgeMarkPath({ cx, cy, mark }: BadgeProps): string {
  switch (mark) {
    case 'plus':
      return `M${cx} ${cy - 5.5}V${cy + 5.5}M${cx - 5.5} ${cy}H${cx + 5.5}`;
    case 'check':
      return `M${cx - 6} ${cy + 0.5}L${cx - 1.8} ${cy + 4.7}L${cx + 6} ${cy - 3.5}`;
    case 'download':
      return `M${cx} ${cy - 6}V${cy + 5}M${cx - 5} ${cy}L${cx} ${cy + 5}L${cx + 5} ${cy}`;
  }
}

/**
 * O selo redondo no canto do desenho, com o "+", o "certo" ou a seta de
 * baixar. A borda na cor do cartão o separa do desenho que ele cobre.
 */
function Badge({ cx, cy, mark }: BadgeProps) {
  const markPath = badgeMarkPath({ cx, cy, mark });

  return (
    <g className={POP_LATE}>
      <circle cx={cx} cy={cy} r={13} stroke="currentColor" strokeWidth={1.6} className={PULSE} />
      <circle cx={cx} cy={cy} r={13} fill="currentColor" stroke="var(--color-card)" strokeWidth={3.5} />
      <path
        d={markPath}
        stroke="var(--color-selected-foreground)"
        strokeWidth={3.2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </g>
  );
}

// ---------------------------------------------------------------------------
// Recuperar a senha: uma chave, com um brilho que acende devagar perto do
// anel — o acesso que volta.
// ---------------------------------------------------------------------------

const KEY_BOW = 'M30 33A17 17 0 1 1 30 67A17 17 0 1 1 30 33Z';
const KEY_HOLE = 'M30 44.5A5.5 5.5 0 1 1 30 55.5A5.5 5.5 0 1 1 30 44.5Z';
const KEY_BLADE = 'M47 50H88M75 50V61M84 50V58';
const KEY_SPARKLE =
  'M17 31C17.8 36.4 18.6 37.2 24 38C18.6 38.8 17.8 39.6 17 45C16.2 39.6 15.4 38.8 10 38C15.4 37.2 16.2 36.4 17 31Z';

export function KeyGlyph({ className }: GlyphProps) {
  return (
    <svg viewBox="0 0 100 100" fill="none" className={cn('overflow-visible', className)}>
      {/* Deitada em diagonal, como a chave do ícone de senha; o `translate`
          devolve ao meio do medalhão o conjunto que a rotação desloca. */}
      <g transform="translate(1 -3) rotate(-35 50 50)">
        <path d={KEY_BOW} fill="currentColor" fillOpacity={0.13} />
        <path d={KEY_BOW} pathLength={100} stroke="currentColor" strokeWidth={3.2} className={DRAW} />
        <path
          d={KEY_HOLE}
          pathLength={100}
          stroke="currentColor"
          strokeWidth={2.6}
          className={cn(DRAW, '[animation-delay:0.2s]')}
        />
        <path
          d={KEY_BLADE}
          pathLength={100}
          stroke="currentColor"
          strokeWidth={4.4}
          strokeLinecap="round"
          strokeLinejoin="round"
          className={cn(DRAW, '[animation-delay:0.35s]')}
        />
      </g>
      {/* O brilho só existe em movimento: parado, seria uma estrela solta. */}
      <path
        d={KEY_SPARKLE}
        fill="currentColor"
        className="animate-sparkle opacity-0 [transform-box:fill-box] [transform-origin:center] motion-reduce:animate-none"
      />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Link enviado ou e-mail a confirmar: um envelope, e o "certo" que surge nele.
// ---------------------------------------------------------------------------

const ENVELOPE =
  'M24 30H76A6 6 0 0 1 82 36V66A6 6 0 0 1 76 72H24A6 6 0 0 1 18 66V36A6 6 0 0 1 24 30Z';
const ENVELOPE_FLAP = 'M21 34L50 55L79 34';

export function MailGlyph({ className }: GlyphProps) {
  return (
    <svg viewBox="0 0 100 100" fill="none" className={cn('overflow-visible', className)}>
      {/* Envelope e selo juntos ficam no meio do medalhão. */}
      <g transform="translate(-2.5 -6.5)">
        <path d={ENVELOPE} fill="currentColor" fillOpacity={0.13} />
        <path
          d={ENVELOPE}
          pathLength={100}
          stroke="currentColor"
          strokeWidth={3}
          strokeLinejoin="round"
          className={DRAW}
        />
        <path
          d={ENVELOPE_FLAP}
          pathLength={100}
          stroke="currentColor"
          strokeWidth={3}
          strokeLinecap="round"
          strokeLinejoin="round"
          className={cn(DRAW, '[animation-delay:0.35s]')}
        />
        <Badge cx={74} cy={70} mark="check" />
      </g>
    </svg>
  );
}

// ---------------------------------------------------------------------------
// A pessoa, com o "+" de quem chega (login e criar conta — no login, escolha
// de 30/09) ou o "certo" dos dados conferidos (confirmar o cadastro).
// ---------------------------------------------------------------------------

const PERSON_HEAD = 'M46 21A12 12 0 1 1 46 45A12 12 0 1 1 46 21Z';
const PERSON_BODY = 'M22 77C22 61 33 53 46 53C59 53 70 61 70 77Z';

function PersonGlyph({ className, mark }: GlyphProps & { mark: BadgeProps['mark'] }) {
  return (
    <svg viewBox="0 0 100 100" fill="none" className={cn('overflow-visible', className)}>
      {/* Pessoa e selo juntos ficam no meio do medalhão. */}
      <g transform="translate(-3 -2)">
        <path d={PERSON_HEAD} fill="currentColor" fillOpacity={0.13} />
        <path d={PERSON_HEAD} pathLength={100} stroke="currentColor" strokeWidth={3} className={DRAW} />
        <path d={PERSON_BODY} fill="currentColor" fillOpacity={0.13} />
        <path
          d={PERSON_BODY}
          pathLength={100}
          stroke="currentColor"
          strokeWidth={3}
          strokeLinejoin="round"
          className={cn(DRAW, '[animation-delay:0.25s]')}
        />
        <Badge cx={72} cy={71} mark={mark} />
      </g>
    </svg>
  );
}

export function SignupGlyph({ className }: GlyphProps) {
  return <PersonGlyph className={className} mark="plus" />;
}

export function IdentityGlyph({ className }: GlyphProps) {
  return <PersonGlyph className={className} mark="check" />;
}

// ---------------------------------------------------------------------------
// Confirmar o celular: o aparelho e o balão da mensagem com o código chegando.
// ---------------------------------------------------------------------------

const PHONE =
  'M34 14H56A7 7 0 0 1 63 21V79A7 7 0 0 1 56 86H34A7 7 0 0 1 27 79V21A7 7 0 0 1 34 14Z';
const PHONE_DETAILS = 'M41 21H49M40 79H50';
const BUBBLE =
  'M60 38H76A10 10 0 0 1 86 48V52A10 10 0 0 1 76 62H63L55 69L56 61.2A10 10 0 0 1 50 52V48A10 10 0 0 1 60 38Z';
const TYPING_DOTS = [
  { cx: 60, delay: '0s' },
  { cx: 68, delay: '0.18s' },
  { cx: 76, delay: '0.36s' },
];

export function SmsGlyph({ className }: GlyphProps) {
  return (
    <svg viewBox="0 0 100 100" fill="none" className={cn('overflow-visible', className)}>
      {/* Aparelho e balão juntos ficam no meio do medalhão. */}
      <g transform="translate(-6.5 0)">
        <path d={PHONE} fill="currentColor" fillOpacity={0.13} />
        <path
          d={PHONE}
          pathLength={100}
          stroke="currentColor"
          strokeWidth={3}
          strokeLinejoin="round"
          className={DRAW}
        />
        <path
          d={PHONE_DETAILS}
          pathLength={100}
          stroke="currentColor"
          strokeWidth={2.6}
          strokeLinecap="round"
          className={cn(DRAW, '[animation-delay:0.5s]')}
        />
        {/* O balão cobre a borda do aparelho: fundo do cartão por baixo. */}
        <g className={POP_LATE}>
          <path d={BUBBLE} fill="var(--color-card)" />
          <path
            d={BUBBLE}
            fill="currentColor"
            fillOpacity={0.16}
            stroke="currentColor"
            strokeWidth={3}
            strokeLinejoin="round"
          />
          {TYPING_DOTS.map((dot) => (
            <circle
              key={dot.cx}
              cx={dot.cx}
              cy={50}
              r={2.6}
              fill="currentColor"
              className="animate-typing [transform-box:fill-box] [transform-origin:center] motion-reduce:animate-none"
              style={{ animationDelay: dot.delay }}
            />
          ))}
        </g>
      </g>
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Versão nova nas lojas: o aparelho, a barra da atualização se enchendo na
// tela dele e o selo com a seta de baixar.
// ---------------------------------------------------------------------------

const UPDATE_PROGRESS = 'M35 47H55';

export function UpdateGlyph({ className }: GlyphProps) {
  return (
    <svg viewBox="0 0 100 100" fill="none" className={cn('overflow-visible', className)}>
      {/* Aparelho e selo juntos ficam no meio do medalhão. */}
      <g transform="translate(-1.5 0)">
        <path d={PHONE} fill="currentColor" fillOpacity={0.13} />
        <path
          d={PHONE}
          pathLength={100}
          stroke="currentColor"
          strokeWidth={3}
          strokeLinejoin="round"
          className={DRAW}
        />
        <path
          d={PHONE_DETAILS}
          pathLength={100}
          stroke="currentColor"
          strokeWidth={2.6}
          strokeLinecap="round"
          className={cn(DRAW, '[animation-delay:0.5s]')}
        />
        {/* O trilho fica parado; a barra se desenha por cima dele, devagar. */}
        <path
          d={UPDATE_PROGRESS}
          stroke="currentColor"
          strokeOpacity={0.25}
          strokeWidth={4.4}
          strokeLinecap="round"
        />
        <path
          d={UPDATE_PROGRESS}
          pathLength={100}
          stroke="currentColor"
          strokeWidth={4.4}
          strokeLinecap="round"
          className={cn(DRAW, '[animation-delay:0.6s] [animation-duration:1.8s]')}
        />
        <Badge cx={63} cy={70} mark="download" />
      </g>
    </svg>
  );
}
