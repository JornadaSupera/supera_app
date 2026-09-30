-- Toda chave estrangeira passa a ter indice que a cubra.
-- Design e racional: supera-docs/ADRs/ADR-028 — Leituras e resumos do painel.md
-- Item 6.13 da lista consolidada (app #23), metade "indices".
--
-- A LISTA DIZIA "AS 37 FKs USADAS EM JOIN DE RLS", E A MAIORIA NAO E. O advisor
-- de desempenho (rodado em 25/09/2026 sobre o banco local, com as Fases 1 a 6)
-- acusa 38 FKs sem indice, e quase todas sao colunas de AUTORIA (`recorded_by`,
-- `created_by`, `decided_by`, `revoked_by…`) ou de vocabulario, que nenhuma
-- politica nem tela filtra. A unica que uma consulta nova atravessa ja ganhou
-- indice onde a consulta nasceu (patient_content_states.content_item_id, em
-- create_panel_summaries).
--
-- ENTRAM TODAS MESMO ASSIM, e o motivo nao e o join: e a ELIMINACAO. A FK sem
-- indice custa quando a linha REFERENCIADA muda ou sai — o Postgres procura os
-- filhos por varredura sequencial, tabela por tabela. Hoje nada se apaga
-- (DELETE revogado, FKs RESTRICT), mas a ADR-005 nomeia o hard delete como
-- mecanismo e a LGPD exige eliminacao ao termino do contrato: apagar uma conta
-- verificaria `messages.author_account_id`, `appointments.created_by_…`,
-- `notifications.type_id`… e, sem indice, cada verificacao varreria a tabela
-- inteira dentro da transacao que apaga. O custo aparece uma vez, no pior
-- momento, e em tabela cheia. 38 indices pequenos agora custam menos.
--
-- PARCIAL onde a coluna e quase sempre NULA (quem revogou, quem decidiu, quem
-- confirmou): a verificacao da FK procura `coluna = valor`, que implica NOT
-- NULL, e o planejador usa o parcial. O indice fica do tamanho das linhas que
-- de fato referenciam.
--
-- A OUTRA METADE DO 6.13 — CONSOLIDAR AS POLITICAS PERMISSIVAS MULTIPLAS — NAO
-- ENTRA, e esta medido. O Postgres ja junta as politicas permissivas de um
-- papel num OR unico antes de planejar: com duas politicas ou com uma que
-- faz o OR a mao, o plano e o mesmo (BitmapOr sobre os dois indices, as mesmas
-- InitPlans), e o tempo tambem. Juntar as 39 reescreveria a RLS de 27 tabelas
-- sem ganho mensuravel e apagaria a leitura por perfil que a ADR-003 organiza
-- (uma politica por perfil, com o nome dele). ADR-028 §5.

-- ---- autoria e decisao (contas) ----------------------------------------------
CREATE INDEX idx_appointments_created_by        ON public.appointments (created_by_account_id);
CREATE INDEX idx_appointments_confirmed_by      ON public.appointments (confirmed_by_account_id)
  WHERE confirmed_by_account_id IS NOT NULL;
CREATE INDEX idx_caregiver_invitations_invited_by  ON public.caregiver_invitations (invited_by_account);
CREATE INDEX idx_caregiver_invitations_accepted_by ON public.caregiver_invitations (accepted_by_account)
  WHERE accepted_by_account IS NOT NULL;
CREATE INDEX idx_clinic_settings_updated_by     ON public.clinic_settings (updated_by)
  WHERE updated_by IS NOT NULL;
CREATE INDEX idx_content_items_authored_by      ON public.content_items (authored_by);
CREATE INDEX idx_content_version_reviews_reviewer ON public.content_version_reviews (reviewer_account_id);
CREATE INDEX idx_content_versions_created_by    ON public.content_versions (created_by);
CREATE INDEX idx_conversation_read_marks_account ON public.conversation_read_marks (account_id);
CREATE INDEX idx_conversations_opened_by        ON public.conversations (opened_by);
CREATE INDEX idx_data_subject_requests_decided_by ON public.data_subject_requests (decided_by)
  WHERE decided_by IS NOT NULL;
CREATE INDEX idx_external_refs_confirmed_by     ON public.external_refs (confirmed_by)
  WHERE confirmed_by IS NOT NULL;
-- NULO na mensagem de sistema (resposta fora do horario), por isso parcial.
CREATE INDEX idx_messages_author_account        ON public.messages (author_account_id)
  WHERE author_account_id IS NOT NULL;
CREATE INDEX idx_operational_parameters_updated_by ON public.operational_parameters (updated_by)
  WHERE updated_by IS NOT NULL;
CREATE INDEX idx_patient_caregivers_revoked_by  ON public.patient_caregivers (revoked_by_account)
  WHERE revoked_by_account IS NOT NULL;
CREATE INDEX idx_patient_clinical_history_recorded_by ON public.patient_clinical_history (recorded_by);
CREATE INDEX idx_patient_diagnoses_recorded_by  ON public.patient_diagnoses (recorded_by)
  WHERE recorded_by IS NOT NULL;
CREATE INDEX idx_patient_invitations_invited_by ON public.patient_invitations (invited_by_account);
CREATE INDEX idx_professional_permissions_granted_by ON public.professional_permissions (granted_by_account);
CREATE INDEX idx_professional_permissions_revoked_by ON public.professional_permissions (revoked_by_account)
  WHERE revoked_by_account IS NOT NULL;
CREATE INDEX idx_security_settings_updated_by   ON public.security_settings (updated_by)
  WHERE updated_by IS NOT NULL;
CREATE INDEX idx_specialty_notes_authored_by    ON public.specialty_notes (authored_by);
CREATE INDEX idx_treatment_plans_recorded_by    ON public.treatment_plans (recorded_by)
  WHERE recorded_by IS NOT NULL;

-- ---- profissionais --------------------------------------------------------
CREATE INDEX idx_conversations_resolved_by      ON public.conversations (resolved_by_professional_id)
  WHERE resolved_by_professional_id IS NOT NULL;
CREATE INDEX idx_messages_author_professional   ON public.messages (author_professional_id)
  WHERE author_professional_id IS NOT NULL;
CREATE INDEX idx_specialty_flags_raised_by      ON private.specialty_flags (raised_by_professional_id);

-- ---- vocabulario e especialidade --------------------------------------------
CREATE INDEX idx_appointment_status_reasons_status ON public.appointment_status_reasons (status_id);
CREATE INDEX idx_appointments_origin_specialty  ON public.appointments (origin_specialty_id)
  WHERE origin_specialty_id IS NOT NULL;
CREATE INDEX idx_appointments_status_reason_fk  ON public.appointments (status_reason_id)
  WHERE status_reason_id IS NOT NULL;
CREATE INDEX idx_content_categories_specialty   ON public.content_categories (specialty_id);
CREATE INDEX idx_conversation_assignments_specialty ON public.conversation_assignments (specialty_id);
CREATE INDEX idx_conversation_subjects_specialty ON public.conversation_subjects (specialty_id)
  WHERE specialty_id IS NOT NULL;
CREATE INDEX idx_conversations_subject          ON public.conversations (subject_id);
CREATE INDEX idx_notification_preferences_type  ON public.notification_preferences (type_id, is_silenceable);
CREATE INDEX idx_notifications_type_id          ON public.notifications (type_id);
CREATE INDEX idx_nps_surveys_milestone_fk       ON public.nps_surveys (milestone_id, milestone_axis);
CREATE INDEX idx_specialty_flags_origin_specialty ON private.specialty_flags (origin_specialty_id);
