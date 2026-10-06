import type { ReactNode } from 'react';
import { TriangleAlert } from 'lucide-react';
import Button from '../../components/ui/button';
import Skeleton from '../../components/ui/skeleton';
import { useLibraryDiagnoses } from '../../hooks/useResources';
import { useScopeAllowed } from '../../hooks/useCaregiver';

/**
 * A faixa do filtro por CID da biblioteca (requisito "Filtro por CID").
 *
 * O filtro é do banco, em toda leitura: orientação sem CID vai a todos, e a
 * com CID só a quem tem um dos diagnósticos da ficha. Esta faixa diz por quais
 * diagnósticos a lista está recortada — todos, como o banco os usa — e, sem
 * nenhum, que só as orientações gerais aparecem. Nunca fica em silêncio: sem a
 * faixa, a pessoa não saberia se a biblioteca está filtrada ou não.
 *
 * Fora do carregamento da lista de propósito: é informação de apoio, e a lista
 * não espera por ela. As margens são as da lista: 16 px dos lados, 24 px até o
 * cabeçalho.
 */
export default function LibraryFilterNotice() {
  const { data: diagnoses, isLoading, isError, refetch } = useLibraryDiagnoses();
  // Ao acompanhante sem a ficha clínica o banco não usa diagnóstico nenhum:
  // dizer "nenhum registrado" seria falso — ele só não é compartilhado.
  const { allowed: clinicalRecordShared } = useScopeAllowed('clinical_record');

  let content: ReactNode;

  if (isLoading) {
    // A altura da faixa com um diagnóstico numa linha só (73 px): os 16 px de
    // respiro em cima e embaixo, a legenda de 18, o vão de 2 e a linha de 21.
    content = <Skeleton className="h-[73px] rounded-2xl" />;
  } else if (isError || !diagnoses) {
    // O recorte é imposto pelo banco, não por esta faixa — por isso o aviso diz
    // que a lista continua filtrada, em vez de sugerir conteúdo errado.
    content = (
      <div role="status" className="flex items-start gap-3 rounded-2xl bg-muted p-4">
        {/* Centrado na primeira linha de 21 px do `text-body-sm`. */}
        <TriangleAlert
          size={24}
          strokeWidth={2}
          className="-my-[1.5px] shrink-0 text-muted-foreground"
          aria-hidden="true"
        />
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <p className="text-body-sm text-muted-foreground">
            Não foi possível carregar seu diagnóstico agora. A biblioteca continua filtrada pelo seu
            cadastro.
          </p>
          {/* `self-start`: na coluna, o botão manteria a largura toda. */}
          <Button variant="outline" className="self-start" onClick={() => void refetch()}>
            Tentar de novo
          </Button>
        </div>
      </div>
    );
  } else if (diagnoses.length === 0) {
    content = (
      <p role="status" className="rounded-2xl bg-muted p-4 text-body-sm text-muted-foreground">
        {clinicalRecordShared
          ? 'Nenhum diagnóstico registrado na ficha: aparecem as orientações gerais.'
          : 'A ficha clínica não é compartilhada com você: aparecem as orientações gerais.'}
      </p>
    );
  } else {
    // A caixa verde-água clara do guia (`surface-teal`), com o texto em `ink` e
    // o código no verde escuro. Um diagnóstico por linha, o principal primeiro.
    content = (
      <div className="flex flex-col gap-0.5 rounded-2xl bg-secondary p-4">
        <p className="text-caption font-semibold text-primary-deep">
          {diagnoses.length === 1 ? 'Filtrado pelo seu diagnóstico' : 'Filtrado pelos seus diagnósticos'}
        </p>
        <ul role="list" className="flex flex-col gap-0.5">
          {diagnoses.map((diagnosis) => (
            <li key={diagnosis.cid} className="text-body-sm font-medium text-foreground">
              <span className="font-bold text-primary-deep">{diagnosis.cid}</span>
              <span className="ml-1">·</span>
              <span className="ml-1">{diagnosis.description}</span>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return <div className="mx-4 mt-6 flex flex-col gap-4">{content}</div>;
}
