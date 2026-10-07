import FlowScreen from '../../components/ui/flow-screen';
import Button from '../../components/ui/button';
import EntryHero from '../Onboarding/EntryHero';

interface PhoneInUseScreenProps {
  /** Celular já mascarado: o bastante para a pessoa notar um número errado. */
  phoneLabel: string;
  /** Volta ao formulário de dados, onde a pessoa informa outro número. */
  onUseOtherNumber: () => void;
  onBack?: () => void;
}

/**
 * O celular já está confirmado em outra conta do app, e o Auth recusou o envio
 * do código (`phone_exists`) antes de chegar ao SMS. Sem esta tela a pessoa lia
 * "Enviamos um código", esperava um SMS que nunca vem e achava que o defeito
 * era do envio.
 *
 * Cada pessoa tem o seu número, então a saída é uma só: usar outro. Não diz
 * nada da outra conta.
 */
export default function PhoneInUseScreen({ phoneLabel, onUseOtherNumber, onBack }: PhoneInUseScreenProps) {
  return (
    <FlowScreen
      tone="brand"
      title="Este celular já está em outra conta"
      subtitle={`Por isso não enviamos o código para ${phoneLabel}. Use outro número para continuar.`}
      hero={<EntryHero variant="sms" />}
      onBack={onBack}
      footer={
        <Button variant="brand" size="xl" fullWidth onClick={onUseOtherNumber}>
          Usar outro número
        </Button>
      }
    />
  );
}
