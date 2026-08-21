const patient = {
  id: 'rafael-mendes',
  nome: 'Rafael Mendes',
  cpf: '111.444.777-35',
  dataNascimento: '1985-04-12',
  celular: '(48) 98812-4477',
  email: 'rafael.mendes@email.com',
  senha: 'Supera@2026',
  diagnostico: {
    cid: 'C18.9',
    descricao: 'Adenocarcinoma de cólon, sem especificação',
  },
  protocolo: 'FOLFOX',
  estadiamento: 'IIIa',
  alergias: ['Penicilina'],
  reacoesPrevias: ['Náusea grau 2 — ciclo 1', 'Neuropatia leve em MMII — ciclo 3'],
  preferencias: {
    biometria: true,
    lembretes24h: true,
    lembretes2h: true,
    novidadesBiblioteca: true,
    temaEscuro: false,
  },
};

export default patient;
