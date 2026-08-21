export const equipeCuidado = [
  { nome: 'Helena Costa Andrade', cargo: 'Onco.', foto: null },
  { nome: 'Patrícia Lima Soares', cargo: 'Enf.', foto: null },
  { nome: 'Bruno Alves Tavares', cargo: 'Farm.', foto: null },
  { nome: 'Larissa Rocha', cargo: 'Psic.', foto: null },
  { nome: 'Camila Souza', cargo: 'Nutri.', foto: null },
  { nome: 'Roberto Pinto Coelho', cargo: 'Dr.', foto: null },
  { nome: 'Júlia Andrade', cargo: 'Fisio.', foto: null },
];

const conversations = [
  {
    id: 'c1',
    titulo: 'Ansiedade antes da sessão de quimio',
    profissional: { nome: 'Camila Souza', cargo: 'Nutri.', foto: null },
    assunto: 'sintomas',
    naoLidas: 1,
    mensagens: [
      {
        id: 'c1-m1',
        autor: 'paciente',
        tipo: 'texto',
        texto: 'Oi Camila, esses dias antes da sessão eu fico tão ansioso que quase não como nada.',
        minutosAtras: 200,
      },
      {
        id: 'c1-m2',
        autor: 'profissional',
        tipo: 'texto',
        texto: 'Entendo, Rafael. É bem comum a ansiedade afetar o apetite nesses dias. Já tentou comer porções bem pequenas, sem se cobrar tanto?',
        minutosAtras: 180,
      },
      {
        id: 'c1-m3',
        autor: 'paciente',
        tipo: 'texto',
        texto: 'Tentei um pouco, mas ainda sinto o estômago meio embrulhado.',
        minutosAtras: 150,
      },
      {
        id: 'c1-m4',
        autor: 'profissional',
        tipo: 'texto',
        texto: 'Quer fazer o exercício de respiração 4-7-8 comigo agora?',
        minutosAtras: 120,
      },
    ],
  },
  {
    id: 'c2',
    titulo: 'Confirmação da consulta de amanhã',
    profissional: { nome: 'Patrícia Lima Soares', cargo: 'Enf.', foto: null },
    assunto: 'agendamento',
    naoLidas: 0,
    mensagens: [
      {
        id: 'c2-m1',
        autor: 'paciente',
        tipo: 'texto',
        texto: 'Oi Patrícia, posso confirmar minha consulta de amanhã às 8h30?',
        minutosAtras: 1500,
      },
      {
        id: 'c2-m2',
        autor: 'profissional',
        tipo: 'texto',
        texto: 'Confirmado! Te espero amanhã às 8h30.',
        minutosAtras: 1440,
      },
    ],
  },
  {
    id: 'c3',
    titulo: 'Dúvida sobre a capecitabina',
    profissional: { nome: 'Bruno Alves Tavares', cargo: 'Farm.', foto: null },
    assunto: 'medicacao',
    naoLidas: 0,
    mensagens: [
      {
        id: 'c3-m1',
        autor: 'paciente',
        tipo: 'texto',
        texto: 'Bruno, essa é a caixa certa do remédio que o Dr. Roberto passou?',
        minutosAtras: 10200,
      },
      {
        id: 'c3-m2',
        autor: 'paciente',
        tipo: 'imagem',
        legenda: 'Caixa da farmácia',
        minutosAtras: 10190,
      },
      {
        id: 'c3-m3',
        autor: 'profissional',
        tipo: 'texto',
        texto: 'Isso mesmo, Rafael! Essa é a capecitabina 500mg. Pode seguir tomando como combinado, 30 minutos após as refeições.',
        minutosAtras: 10150,
      },
      {
        id: 'c3-m4',
        autor: 'paciente',
        tipo: 'texto',
        texto: 'Perfeito, obrigado!',
        minutosAtras: 10100,
      },
    ],
  },
  {
    id: 'c4',
    titulo: 'Conversa sobre contar o diagnóstico aos filhos',
    profissional: { nome: 'Larissa Rocha', cargo: 'Psic.', foto: null },
    assunto: 'outros',
    naoLidas: 0,
    mensagens: [
      {
        id: 'c4-m1',
        autor: 'paciente',
        tipo: 'texto',
        texto: 'Larissa, posso te chamar pra conversar sobre como contar o diagnóstico pros meus filhos?',
        minutosAtras: 90,
      },
      {
        id: 'c4-m2',
        autor: 'profissional',
        tipo: 'texto',
        texto: 'Claro, Rafael. Podemos marcar uma conversa ainda essa semana, se quiser.',
        minutosAtras: 75,
      },
      {
        id: 'c4-m3',
        autor: 'paciente',
        tipo: 'texto',
        texto: 'Seria ótimo, obrigado!',
        minutosAtras: 60,
        statusEnvio: 'enviada',
      },
    ],
  },
];

export default conversations;
