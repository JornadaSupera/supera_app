// Tipos dos direitos do titular — `data_subject_requests` e `export_my_data`
// (guia do banco §5.19, entregue em 25/09/2026).
//
// Até então o app só ABRIA o pedido e nunca mais o mencionava. O ciclo agora é
// fechado pelo banco, e o titular lê os próprios pedidos direto — inclusive o
// motivo da recusa, que o art. 18 §4 da LGPD existe para lhe entregar.

/** `data_subject_request_type` no banco. */
export type DataSubjectRequestType =
  | 'access'
  | 'rectification'
  | 'portability'
  | 'consent_revocation'
  | 'deletion';

/**
 * `data_subject_request_status` no banco. O ciclo é fechado e o banco recusa
 * qualquer transição fora dele:
 *
 * `requested → under_review → granted → executed`, com `refused` como saída de
 * `requested` e de `under_review`.
 */
export type DataSubjectRequestStatus = 'requested' | 'under_review' | 'granted' | 'executed' | 'refused';

/** Um pedido do titular, como ele mesmo o lê (`data_subject_requests_select_own`). */
export interface DataSubjectRequest {
  id: string;
  type: DataSubjectRequestType;
  status: DataSubjectRequestStatus;
  /** O motivo que a clínica precisa dar ao recusar. `null` nos demais estados. */
  decisionNote: string | null;
  /** ISO 8601. O prazo legal conta daqui — o banco não tem coluna de prazo. */
  createdAt: string;
  /** ISO 8601. Quando a clínica deferiu ou recusou. A janela de 15 dias conta daqui. */
  decidedAt: string | null;
  /** ISO 8601. Quando o pedido foi cumprido. */
  executedAt: string | null;
}

/**
 * O pacote de dados do titular, como `export_my_data` o devolve.
 *
 * O conteúdo é montado na hora, sob a RLS de quem chama — é o que o app já
 * mostra, nem mais nem menos. Não há link: nada fica guardado em lugar nenhum.
 * O app o trata como opaco e o entrega como arquivo `.json`.
 */
export interface DataSubjectExport {
  format: string;
  format_version: number;
  [key: string]: unknown;
}
