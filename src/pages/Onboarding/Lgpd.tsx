import { Controller, useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useNavigate } from 'react-router';
import { ChevronRight, ShieldCheck } from 'lucide-react';
import { z } from 'zod';
import Checkbox from '../../components/ui/checkbox';
import Button from '../../components/ui/button';
import Header from '../../components/ui/header';

const lgpdSchema = z.object({
  aceitaTermos: z
    .boolean()
    .refine((value) => value === true, 'É necessário aceitar os Termos de Uso.'),
  aceitaPrivacidade: z
    .boolean()
    .refine((value) => value === true, 'É necessário aceitar a Política de Privacidade.'),
  aceitaDadosSensiveis: z
    .boolean()
    .refine((value) => value === true, 'É necessário autorizar o tratamento de dados sensíveis.'),
});

type LgpdFormValues = z.infer<typeof lgpdSchema>;

const FORM_ID = 'lgpd-form';

export default function Lgpd() {
  const navigate = useNavigate();

  const { control, handleSubmit } = useForm<LgpdFormValues>({
    resolver: zodResolver(lgpdSchema),
    defaultValues: {
      aceitaTermos: false,
      aceitaPrivacidade: false,
      aceitaDadosSensiveis: false,
    },
  });

  // Os 3 checkboxes habilitam o botão assim que marcados, sem esperar
  // submit — por isso lê os valores ao vivo em vez de `formState.isValid`.
  const [aceitaTermos, aceitaPrivacidade, aceitaDadosSensiveis] = useWatch({
    control,
    name: ['aceitaTermos', 'aceitaPrivacidade', 'aceitaDadosSensiveis'],
  });

  const podeContinuar = Boolean(aceitaTermos && aceitaPrivacidade && aceitaDadosSensiveis);

  const handleVoltar = () => {
    navigate(-1);
  };

  const onSubmit = () => {
    navigate('/login');
  };

  return (
    <div className="flex min-h-[100dvh] flex-col bg-background">
      <Header
        variant="step"
        sticky
        bordered
        blurred
        onBack={handleVoltar}
        meta="Etapa 1 de 4"
        // Header.jsx (ainda não migrado) declara title/subtitle/actions sem
        // valor padrão, então o TS as infere como obrigatórias mesmo não
        // sendo usadas na variante "step" — undefined satisfaz o shape
        // inferido sem alterar o componente legado.
        title={undefined}
        subtitle={undefined}
        actions={undefined}
      />

      <main className="flex-1 px-6 py-5">
        <div className="rounded-xl bg-[color-mix(in_srgb,var(--color-supera-uniao)_10%,transparent)] p-4">
          <ShieldCheck
            size={24}
            strokeWidth={2}
            className="text-[var(--color-supera-uniao)]"
            aria-hidden="true"
          />
          <h1 className="mt-3 text-[20px] font-semibold tracking-[-0.4px] leading-[1.3]">
            Termo de uso &amp; privacidade
          </h1>
          <p className="mt-[6px] text-[14px] leading-[1.6] text-muted-foreground">
            Antes de continuar, precisamos do seu consentimento para tratar seus dados conforme a LGPD.
          </p>
        </div>

        <div className="mt-5 max-h-[256px] overflow-y-auto rounded-lg border border-border bg-card p-4 text-[12px] leading-[1.6] text-muted-foreground [&>p]:mt-3">
          <h2 className="text-[14px] font-semibold text-foreground">Resumo</h2>
          <p>
            O <strong>Jornada Supera</strong> é uma ferramenta complementar ao seu cuidado
            oncológico no Centro de Oncologia de Santa Catarina. As informações que você
            registra aqui ajudam a equipe clínica a te acompanhar entre as consultas.
          </p>
          <p>
            <strong>Dados que coletamos:</strong> CPF, data de nascimento, telefone, e-mail
            (para identificação e contato), além das suas entradas no diário, mensagens no
            chat e respostas a perguntas guiadas.
          </p>
          <p>
            <strong>Finalidade:</strong> registrar e organizar seu acompanhamento, permitir
            comunicação direta com a equipe e produzir estatísticas anonimizadas para
            qualificar o cuidado.
          </p>
          <p>
            <strong>Direitos do titular (você):</strong> acesso, correção, exclusão,
            portabilidade e revogação do consentimento a qualquer momento — pelo próprio
            aplicativo, em Perfil → Privacidade.
          </p>
          <p>
            <strong>Compartilhamento:</strong> apenas com a equipe clínica autorizada do
            Centro de Oncologia. Não vendemos nem cedemos dados a terceiros.
          </p>
          <p>
            <strong>Hospedagem:</strong> servidores no Brasil, com criptografia em trânsito
            (TLS 1.3) e em repouso (AES-256). Trilha de auditoria imutável para todo acesso
            a dados sensíveis.
          </p>
          <p>
            <strong>DPO (encarregado de dados):</strong> dpo@centroconcologia.com.br
          </p>
        </div>

        <form id={FORM_ID} onSubmit={handleSubmit(onSubmit)} className="mt-5 flex flex-col gap-3">
          <Controller
            control={control}
            name="aceitaTermos"
            render={({ field }) => (
              <Checkbox
                id="aceita-termos"
                checked={field.value}
                onChange={field.onChange}
                label={
                  <>
                    Li e concordo com os <strong>Termos de Uso</strong> do Jornada Supera.
                  </>
                }
              />
            )}
          />
          <Controller
            control={control}
            name="aceitaPrivacidade"
            render={({ field }) => (
              <Checkbox
                id="aceita-privacidade"
                checked={field.value}
                onChange={field.onChange}
                label={
                  <>
                    Li e concordo com a <strong>Política de Privacidade</strong>.
                  </>
                }
              />
            )}
          />
          <Controller
            control={control}
            name="aceitaDadosSensiveis"
            render={({ field }) => (
              <Checkbox
                id="aceita-dados-sensiveis"
                checked={field.value}
                onChange={field.onChange}
                label={
                  <>
                    Autorizo o tratamento dos meus <strong>dados sensíveis de saúde</strong> com a
                    finalidade de me acompanhar no tratamento oncológico.
                  </>
                }
              />
            )}
          />
        </form>
      </main>

      <footer className="sticky bottom-0 border-t border-border bg-[color-mix(in_srgb,var(--color-card)_95%,transparent)] px-6 py-4 backdrop-blur-[8px]">
        <Button type="submit" form={FORM_ID} fullWidth iconRight={ChevronRight} disabled={!podeContinuar}>
          Continuar
        </Button>
      </footer>
    </div>
  );
}
