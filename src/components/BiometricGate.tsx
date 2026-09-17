import { useEffect, useRef, useState, type ReactNode } from 'react';
import { LockKeyhole } from 'lucide-react';
import Button from './ui/button';
import Logo from './ui/logo';
import { authenticateWithBiometric, isBiometricAvailable } from '../services/biometric';
import { hasStoredSession } from '../services/mockApi';
import { useDevicePreferencesStore } from '../stores/devicePreferencesStore';
import { useSessionStore } from '../stores/sessionStore';

// Tranca biométrica de abertura do app.
//
// POR QUE ISTO É UM PORTÃO, E NÃO UM BOTÃO NA TELA DE LOGIN. O botão que
// existia lá nunca aparecia: com sessão guardada, a Splash resolve a identidade
// e manda direto para a Home — a tela de login não chega a ser vista. Ou seja, a
// biometria só era oferecida exatamente quando não fazia falta (sem sessão, não
// há o que destravar) e nunca quando fazia (sessão guardada). É por isso que
// reabrir o app não pedia nada.
//
// Aplicativo de banco faz o inverso, e é esse o comportamento esperado aqui: ao
// abrir, nada do conteúdo aparece antes da confirmação. Por isso o portão
// embrulha as rotas inteiras, e não uma tela — dado clínico não pode piscar na
// frente de quem pegou o celular destravado.
//
// A tranca só arma quando as três coisas são verdade: existe sessão no cofre,
// o aparelho tem biometria, e a pessoa ligou o atalho no Perfil. Faltando
// qualquer uma, o portão é transparente e o app abre como sempre abriu.

type EstadoDaTranca = 'verificando' | 'destravado' | 'travado';

export default function BiometricGate({ children }: { children: ReactNode }) {
  const [estado, setEstado] = useState<EstadoDaTranca>('verificando');
  const [tentando, setTentando] = useState(false);
  const biometriaAtiva = useDevicePreferencesStore((state) => state.biometriaAtiva);
  const signOut = useSessionStore((state) => state.signOut);

  // Guarda de "já estou pedindo", em ref e não em estado: `setTentando` só
  // vale no próximo render, e o StrictMode dispara o efeito duas vezes no mesmo
  // tick — com estado, as duas chamadas veriam `false` e o Face ID apareceria
  // duas vezes seguidas. Ref muda na hora.
  const pedindo = useRef(false);

  useEffect(() => {
    // Sem guarda de "já avaliei": no StrictMode o efeito roda, o cleanup zera o
    // `ativo` e o efeito roda de novo. Uma guarda de execução única deixava a
    // segunda rodada sair cedo e a primeira descartar o próprio resultado pelo
    // `ativo` — resultado: `setEstado` nunca acontecia e o app ficava preso na
    // tela de abertura. As duas leituras aqui são baratas e sem efeito
    // colateral, então repetir não custa nada.
    let ativo = true;

    void (async () => {
      // Ordem deliberada: a preferência é a checagem mais barata e a mais
      // provável de dispensar as outras duas.
      if (!biometriaAtiva) {
        if (ativo) setEstado('destravado');
        return;
      }

      // `hasStoredSession` lê o cofre, sem rede. Sem sessão guardada não há o
      // que proteger — quem chegar assim cai no login normalmente.
      const [temSessao, temBiometria] = await Promise.all([
        hasStoredSession(),
        isBiometricAvailable(),
      ]);

      if (!ativo) return;
      setEstado(temSessao && temBiometria ? 'travado' : 'destravado');
    })();

    return () => {
      ativo = false;
    };
  }, [biometriaAtiva]);

  const desbloquear = async () => {
    if (pedindo.current) return;

    pedindo.current = true;
    setTentando(true);
    const confirmou = await authenticateWithBiometric();
    pedindo.current = false;
    setTentando(false);

    if (confirmou) setEstado('destravado');
    // Recusa ou cancelamento não muda o estado: a tela segue trancada, com o
    // botão de tentar de novo e a saída pela senha. Não insistimos sozinhos —
    // repetir o pedido sem a pessoa mandar é o caminho para travar o aparelho
    // por excesso de tentativas.
  };

  // Pede a confirmação assim que a tranca arma, para a pessoa não precisar
  // tocar em nada na abertura — é o que um app de banco faz.
  useEffect(() => {
    if (estado === 'travado') {
      void desbloquear();
    }
    // Só na transição para 'travado'. `desbloquear` se protege sozinho pelo ref,
    // então repetição do StrictMode não vira dois pedidos.
  }, [estado]);

  const usarSenha = async () => {
    // Encerra a sessão antes de liberar a tela: sem isso, destravar pela senha
    // seria destravar sem senha nenhuma — bastava tocar no botão e o app
    // abriria com a sessão guardada intacta.
    await signOut();
    setEstado('destravado');
  };

  if (estado === 'destravado') {
    return <>{children}</>;
  }

  // 'verificando' e 'travado' mostram a mesma moldura: a leitura do cofre é
  // rápida, e piscar duas telas diferentes na abertura fica pior do que manter
  // a marca parada enquanto se decide.
  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-6 bg-background px-6 py-8">
      <Logo size="lg" />

      {estado === 'travado' && (
        <>
          <div className="flex flex-col items-center gap-3 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-[color-mix(in_srgb,var(--color-primary)_15%,transparent)] text-primary">
              <LockKeyhole size={22} strokeWidth={2} aria-hidden="true" />
            </span>
            <p className="text-[16px] font-semibold text-foreground">App bloqueado</p>
            <p className="max-w-[280px] text-[13px]/[1.5] text-muted-foreground">
              Confirme sua identidade para continuar de onde parou.
            </p>
          </div>

          <div className="flex w-full max-w-[320px] flex-col gap-2">
            <Button fullWidth loading={tentando} onClick={desbloquear}>
              Desbloquear
            </Button>
            <Button fullWidth variant="ghost" onClick={usarSenha}>
              Entrar com e-mail e senha
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
