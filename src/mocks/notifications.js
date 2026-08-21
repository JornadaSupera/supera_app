const notifications = [
  {
    id: 'n1',
    tipo: 'lembrete',
    titulo: 'Lembrete: tomar capecitabina',
    descricao: 'Próxima dose em 2h — junto com o almoço.',
    minutosAtras: 60,
    lida: false,
  },
  {
    id: 'n2',
    tipo: 'chat',
    titulo: 'Camila respondeu no chat',
    descricao: 'Quer fazer o exercício de respiração 4-7-8 comigo agora?',
    minutosAtras: 120,
    lida: false,
    autor: { nome: 'Camila Souza', foto: null },
  },
  {
    id: 'n3',
    tipo: 'orientacao',
    titulo: 'Nova orientação da Nutri',
    descricao: 'Alimentos seguros após sessão de quimio',
    minutosAtras: 1500,
    lida: true,
  },
  {
    id: 'n4',
    tipo: 'agenda',
    titulo: 'Consulta confirmada',
    descricao: 'Sua consulta com Dr. Roberto foi confirmada para a próxima semana.',
    minutosAtras: 2880,
    lida: true,
  },
  {
    id: 'n5',
    tipo: 'lembrete',
    titulo: 'Lembrete da fisioterapia',
    descricao: 'Faltam 24h para sua sessão com Fisio. Júlia.',
    minutosAtras: 4320,
    lida: true,
  },
  {
    id: 'n6',
    tipo: 'chat',
    titulo: 'Bruno respondeu no chat',
    descricao: 'Sobre dúvida no horário da capecitabina',
    minutosAtras: 8640,
    lida: true,
    autor: { nome: 'Bruno Alves Tavares', foto: null },
  },
];

export default notifications;
