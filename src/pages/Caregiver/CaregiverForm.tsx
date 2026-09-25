import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Navigate, useNavigate } from 'react-router';
import FlowScreen from '../../components/ui/flow-screen';
import Input from '../../components/ui/input';
import Button from '../../components/ui/button';
import Loading from '../../components/ui/loading';
import DeliveryOptions from './DeliveryOptions';
import { handoffFromAccess, handoffFromSmsFailure } from './handoff';
import { describeMutationError } from '../../hooks/useAuth';
import { useGoBackOr } from '../../hooks/useGoBackOr';
import { useCreateCaregiver, useMyCaregiver } from '../../hooks/useCaregiver';
import { useToast } from '../../contexts/ToastContext';
import { getCaregiverErrorCode } from '../../lib/caregiverError';
import { caregiverSchema, type CaregiverFormValues } from '../../schemas/caregiver';
import { useCaregiverHandoffStore } from '../../stores/caregiverHandoffStore';
import { formatPhone } from '../../utils/masks';
import { maskedRegister } from '../../utils/maskedInput';
import { toInternationalPhone } from '../../utils/phone';

const FORM_ID = 'caregiver-form';
const CAREGIVER_PATH = '/perfil/acompanhante';

/**
 * Adicionar acompanhante: nome, celular, e-mail (é o login dele) e como enviar
 * os dados de acesso.
 *
 * O servidor cria a conta com uma senha provisória e o acompanhante é obrigado
 * a trocá-la no primeiro acesso. Nada daqui vai para armazenamento: a senha,
 * quando vem (WhatsApp), segue só em memória para a tela de envio.
 */
export default function CaregiverForm() {
  const navigate = useNavigate();
  const goBack = useGoBackOr(CAREGIVER_PATH);
  const { showToast } = useToast();
  const myCaregiver = useMyCaregiver();
  const create = useCreateCaregiver();
  const setHandoff = useCaregiverHandoffStore((state) => state.setHandoff);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<CaregiverFormValues>({
    resolver: zodResolver(caregiverSchema),
    mode: 'onTouched',
    defaultValues: { fullName: '', phone: '', email: '', delivery: 'whatsapp' },
  });

  // Só cabe um acompanhante por vez: quem já tem um vai gerenciá-lo.
  if (myCaregiver.isPending) return <Loading />;
  if (myCaregiver.data) return <Navigate to={CAREGIVER_PATH} replace />;

  const submit = handleSubmit(async (values) => {
    const base = {
      fullName: values.fullName.trim(),
      email: values.email.trim().toLowerCase(),
      phone: toInternationalPhone(values.phone),
    };

    try {
      const access = await create.mutateAsync({ ...base, delivery: values.delivery });
      setHandoff(handoffFromAccess(base, values.delivery, access));
      navigate('/perfil/acompanhante/enviar', { replace: true });
    } catch (error) {
      // A conta foi criada mas o SMS não saiu: a tela de envio oferece outra
      // senha. Qualquer outro erro fica no aviso abaixo do formulário.
      const failure = handoffFromSmsFailure(base, error);
      if (failure) {
        setHandoff(failure);
        navigate('/perfil/acompanhante/enviar', { replace: true });
      } else if (getCaregiverErrorCode(error) === 'incomplete_response') {
        // A conta pode ter sido criada com a resposta incompleta: a releitura
        // já vai achá-la e tirar o titular deste formulário, e o aviso abaixo
        // sumiria junto. Por isso o aviso sobe para um toast e a tela vai para
        // "Meu acompanhante", onde dá para conferir e gerar outra senha.
        showToast(describeMutationError(error, 'Confira em "Meu acompanhante" se o acesso foi criado.'), { variant: 'error' });
        navigate(CAREGIVER_PATH, { replace: true });
      }
    }
  });

  return (
    <FlowScreen
      title="Adicionar acompanhante"
      subtitle="Vamos criar o acesso com uma senha provisória. No primeiro login, a pessoa é obrigada a trocá-la."
      onBack={goBack}
      footer={
        <>
          <p className="text-center text-[12px]/[1.5] text-muted-foreground">
            A senha provisória vale 72 horas e precisa ser trocada no primeiro acesso.
          </p>
          {create.isError && (
            <p role="alert" className="text-center text-[12px] text-destructive">
              {describeMutationError(create.error, 'Não foi possível criar o acesso. Tente novamente.')}
            </p>
          )}
          <Button type="submit" form={FORM_ID} fullWidth loading={create.isPending}>
            Criar acesso
          </Button>
        </>
      }
    >
      <form
        id={FORM_ID}
        noValidate
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <Input
          label="Nome completo"
          id="caregiver-name"
          autoComplete="off"
          error={errors.fullName?.message}
          {...register('fullName')}
        />
        <Input
          label="Celular"
          id="caregiver-phone"
          type="tel"
          inputMode="tel"
          autoComplete="off"
          placeholder="(49) 99999-9999"
          error={errors.phone?.message}
          {...maskedRegister(register, 'phone', formatPhone)}
        />
        <Input
          label="E-mail"
          id="caregiver-email"
          type="email"
          inputMode="email"
          autoComplete="off"
          autoCapitalize="none"
          helperText="É com este e-mail que a pessoa vai entrar."
          error={errors.email?.message}
          {...register('email')}
        />

        <DeliveryOptions registration={register('delivery')} />
      </form>
    </FlowScreen>
  );
}
