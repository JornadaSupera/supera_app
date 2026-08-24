export const PERMISSOES_PODE = [
  'Ver a agenda e receber os lembretes',
  'Ver as orientações enviadas pela equipe',
  'Acompanhar e conversar no chat com a equipe',
  'Ver e ajudar a registrar o diário',
];

export const PERMISSOES_NAO_PODE = [
  'Ver conteúdo sigiloso (ex.: sessões de psicologia)',
  'Revogar a LGPD, exportar ou excluir a sua conta',
  'Trocar a sua senha ou gerenciar o próprio vínculo',
];

const caregiverState = {
  atual: null,
  historico: [
    {
      id: 'h1',
      evento: 'revogado',
      nome: 'Lucas Mendes',
      parentesco: 'Filho',
      diasAPartirDeHoje: -200,
      hora: '18:40',
    },
  ],
};

export default caregiverState;
