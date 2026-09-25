import type { KnowledgeCategory, KnowledgeQuestion } from '../types';

// Conteúdo da Central de Conhecimento: o Manual do Paciente Quimioterápico da
// Supera Oncologia, em perguntas e respostas.
//
// O texto das respostas é o que a clínica enviou, palavra por palavra — só
// foi dividido em parágrafos e listas. Mudar uma frase aqui é mudar orientação
// médica: qualquer ajuste de texto passa pela clínica antes.
//
// Não há tabela no banco para este conteúdo (ver `types/knowledgeCenter.ts`).
// Só `services/knowledgeCenter.ts` lê este arquivo; se o conteúdo for para o
// banco, ele sai e o service passa a ler com `.from()`.
//
// Imagem: pôr o arquivo em `src/assets/knowledge/`, importar aqui e incluir um
// trecho `{ type: 'image', image: { src, alt, width, height } }` no ponto da
// resposta onde ela deve aparecer.

export const KNOWLEDGE_CATEGORIES: KnowledgeCategory[] = [
  { id: 'sobre-o-cancer', label: 'Sobre o câncer', order: 1 },
  { id: 'quimioterapia', label: 'Quimioterapia', order: 2 },
  { id: 'medicamentos', label: 'Medicamentos', order: 3 },
  { id: 'efeitos-colaterais', label: 'Efeitos colaterais', order: 4 },
  { id: 'sexualidade', label: 'Sexualidade', order: 5 },
  { id: 'cuidados-gerais', label: 'Cuidados gerais', order: 6 },
];

export const KNOWLEDGE_QUESTIONS: KnowledgeQuestion[] = [
  // Sobre o câncer
  {
    id: 'o-que-e-cancer',
    categoryId: 'sobre-o-cancer',
    order: 1,
    question: 'O que é câncer?',
    answer: [
      {
        type: 'paragraph',
        text: 'Câncer é o nome dado a um conjunto de mais de 100 doenças que têm em comum o crescimento desordenado de células, que invadem tecidos e órgãos. Dividindo-se rapidamente, estas células tendem a ser muito agressivas e incontroláveis, levando a formação de tumores que podem espalhar-se para outras regiões do corpo.',
      },
      {
        type: 'paragraph',
        text: 'Outras características que diferenciam os diversos tipos de câncer entre si são a velocidade de multiplicação das células e a capacidade de invadir tecidos e órgãos vizinhos ou distantes, conhecida como metástase.',
      },
    ],
  },
  {
    id: 'como-surge-o-cancer',
    categoryId: 'sobre-o-cancer',
    order: 2,
    question: 'Como surge o câncer?',
    answer: [
      {
        type: 'paragraph',
        text: 'O câncer surge a partir de uma mutação genética, ou seja, de uma alteração no DNA da célula, que passa a receber instruções erradas para as suas atividades. As alterações podem ocorrer em genes especiais, denominados proto-oncogenes, que a princípio são inativos em células normais. Quando ativados, os proto-oncogenes tornam-se oncogenes, responsáveis por transformar as células normais em células cancerosas.',
      },
    ],
  },
  {
    id: 'tipos-de-cancer',
    categoryId: 'sobre-o-cancer',
    order: 3,
    question: 'Quais são os tipos de câncer?',
    answer: [
      {
        type: 'paragraph',
        text: 'Cada órgão pode ser acometido por tipos diferenciados de tumor, mais ou menos agressivos. São diferentes linhagens de acordo com a célula de origem: linhagem epitelial (carcinomas), linhagem linfática e hematopoetica, linhagem mesênquimal (como os sarcomas) e os de sistema nervoso central.',
      },
    ],
  },
  {
    id: 'o-que-causa-o-cancer',
    categoryId: 'sobre-o-cancer',
    order: 4,
    question: 'O que causa o câncer?',
    answer: [
      {
        type: 'paragraph',
        text: 'O câncer não tem uma causa única. Há diversas causas externas (presentes no meio ambiente) e internas (como hormônios, condições imunológicas e mutações genéticas). Os fatores podem interagir de diversas formas, dando início ao surgimento do câncer.',
      },
      {
        type: 'paragraph',
        text: 'A grande maioria dos casos de câncer estão associados a causas externas. As mudanças provocadas no meio ambiente pelo próprio homem, os hábitos e o estilo de vida podem aumentar o risco de diferentes tipos de câncer.',
      },
      {
        type: 'paragraph',
        text: 'Entende-se por ambiente o meio em geral (água, terra e ar), o ambiente de trabalho (indústrias químicas e afins), o ambiente de consumo (alimentos, medicamentos) e o ambiente social e cultural (estilo e hábitos de vida).',
      },
      {
        type: 'paragraph',
        text: 'Os fatores de risco ambientais de câncer são denominados cancerígenos ou carcinógenos. Esses fatores alteram a estrutura genética (DNA) das células. As causas internas estão ligadas à capacidade do organismo de se defender das agressões externas. Apesar de o fator genético exercer um importante papel na formação dos tumores (oncogênese), são raros os casos de câncer que se devem exclusivamente a fatores hereditários, familiares e étnicos.',
      },
      {
        type: 'paragraph',
        text: 'Existem ainda alguns fatores genéticos que tornam determinadas pessoas mais suscetíveis à ação dos agentes cancerígenos ambientais. Isso parece explicar porque algumas delas desenvolvem câncer e outras não, quando expostas a um mesmo carcinógeno.',
      },
    ],
  },
  {
    id: 'tratamentos-do-cancer',
    categoryId: 'sobre-o-cancer',
    order: 5,
    question: 'Quais são os tratamentos do câncer?',
    answer: [
      {
        type: 'paragraph',
        text: 'O tratamento do câncer pode ser feito por meio de cirurgia, quimioterapia, imunoterapia, terapia alvo, radioterapia ou transplante de medula óssea.',
      },
      {
        type: 'paragraph',
        text: 'É importante lembrar que o tratamento contra o câncer é individualizado e que a conduta adotada pelo médico depende de diversos fatores, como: tamanho, tipo, estágio, estratificação de risco, mutações genéticas, localização do tumor. Os tratamentos podem ser utilizados isoladamente ou em conjunto com outras terapias.',
      },
    ],
  },

  // Quimioterapia
  {
    id: 'como-e-feito-o-tratamento',
    categoryId: 'quimioterapia',
    order: 1,
    question: 'Como é feito o tratamento?',
    answer: [
      {
        type: 'paragraph',
        text: 'Após a consulta médica e a liberação dos exames laboratoriais, quimioterapia será marcada e o paciente receberá, do enfermeiro do setor de Quimioterapia, orientações sobre o tratamento conforme a prescrição médica.',
      },
      {
        type: 'paragraph',
        text: 'O tratamento, que será administrado por profissionais capacitados da equipe de enfermagem, pode ser feito das seguintes maneiras:',
      },
      {
        type: 'list',
        items: [
          {
            label: 'Ambulatorial',
            text: 'O paciente recebe o tratamento no Setor de Quimioterapia e depois do término é liberado para casa.',
          },
          {
            label: 'Internado',
            text: 'O paciente é hospitalizado durante o período do tratamento.',
          },
        ],
      },
    ],
  },
  {
    id: 'como-e-administrada-a-quimioterapia',
    categoryId: 'quimioterapia',
    order: 2,
    question: 'Como é administrada a quimioterapia?',
    answer: [
      { type: 'paragraph', text: 'O tratamento pode ser realizado das seguintes formas:' },
      {
        type: 'list',
        items: [
          {
            label: 'Via oral (pela boca)',
            text: 'remédios em forma de comprimidos, cápsulas ou líquidos, que podem ser tomados em casa.',
          },
          {
            label: 'Intravenosa (pela veia)',
            text: 'a medicação é aplicada na veia ou por meio de cateter (tubo fino colocado na veia), na forma de injeções, ou diluída em soro.',
          },
          {
            label: 'Intramuscular (pelo músculo)',
            text: 'a medicação é aplicada por meio de injeções no músculo.',
          },
          {
            label: 'Subcutânea (abaixo da pele)',
            text: 'a medicação é aplicada por meio de injeção no tecido gorduroso acima do músculo.',
          },
          {
            label: 'Intratecal (pela espinha dorsal)',
            text: 'pouco comum, sendo aplicada no liquor (líquido da espinha) pelo médico em uma sala própria ou no centro cirúrgico.',
          },
          {
            label: 'Tópica (sobre a pele)',
            text: 'o medicamento, que pode ser líquido ou pomada, é aplicado na pele.',
          },
        ],
      },
    ],
  },
  {
    id: 'por-que-continuar-sem-sintomas',
    categoryId: 'quimioterapia',
    order: 3,
    question: 'Mesmo sem ter sintomas, por que continuar fazendo quimioterapia?',
    answer: [
      {
        type: 'paragraph',
        text: 'O fato de o paciente não estar sentindo mais nada não significa que as aplicações devam ser suspensas. Isso comprova que ele está respondendo bem ao tratamento e o seu médico indicará o momento em que as aplicações deverão terminar em função das características da sua doença.',
      },
    ],
  },

  // Medicamentos
  {
    id: 'outros-remedios',
    categoryId: 'medicamentos',
    order: 1,
    question: 'É permitido tomar outros remédios?',
    answer: [
      {
        type: 'paragraph',
        text: 'Caso o paciente tenha outros problemas de saúde, deve informar ao médico. Não suspender o uso de medicamentos previamente utilizados sem orientação médica. Ex.: medicamentos para hipertensão e diabetes.',
      },
    ],
  },
  {
    id: 'cuidados-com-os-medicamentos',
    categoryId: 'medicamentos',
    order: 2,
    question: 'Quais cuidados devo ter com os medicamentos?',
    answer: [
      {
        type: 'paragraph',
        text: 'Em alguns casos o seu tratamento poderá ser feito com quimioterapia oral, que é quando o medicamento será administrado pela boca, geralmente na forma de comprimido, cápsula ou líquido. Se houver dificuldade para ingerir o medicamento, jamais quebre, corte ou triture seu medicamento sem a orientação de um Farmacêutico.',
      },
      {
        type: 'paragraph',
        text: 'Lembre-se de tomar a medicação sempre no horário indicado; caso você esqueça, tome apenas se faltar mais de 12 horas para o horário seguinte, se faltar menos de 12 horas, aguarde o próximo horário.',
      },
      {
        type: 'paragraph',
        text: 'Orientamos que apenas você manuseie a medicação, caso você não consiga, seu cuidador será o responsável e deverá ter todo o cuidado para não ter contato com a medicação, pois se trata de uma quimioterapia, para isso ele deverá usar luvas, uma colher, ou recipiente (de uso exclusivo), evitando ter contato direto com a medicação.',
      },
      {
        type: 'paragraph',
        text: 'Mantenha os comprimidos na sua embalagem original e, de preferência, dentro da caixa, longe da luz e da umidade. Não guarde na cozinha ou banheiro, pois são locais que tem bastante umidade e oscilação de temperatura. Medicamentos que precisam ficar na geladeira, nunca devem ser colocados na porta, e sim, bem no meio da geladeira em recipiente fechado (nunca em caixa de isopor).',
      },
      {
        type: 'paragraph',
        text: 'As cartelas e caixas dos medicamentos vazias devem ser armazenadas em sacola e trazidas para clínica para o seu correto descarte. Jamais jogue no seu lixo comum.',
      },
      {
        type: 'paragraph',
        text: 'Se você estiver fazendo uso de outras medicações deverá informar o seu Farmacêutico/Enfermeiro ou Médico para que o mesmo possa avaliar e orientar como deverá tomar as medicações.',
      },
      {
        type: 'paragraph',
        text: 'Caso vomite logo após tomar a medicação, não tome novamente, entre em contato com a clínica que fará a orientação correta.',
      },
    ],
  },
  {
    id: 'bebidas-alcoolicas',
    categoryId: 'medicamentos',
    order: 3,
    question: 'É permitido o consumo de bebidas alcoólicas?',
    answer: [
      {
        type: 'paragraph',
        text: 'Não existe dose segura para bebida alcoólica mesmo em pessoas saudáveis. Especialmente durante a quimioterapia é aconselhável parar. Atenção especial deve ser dada caso esteja tomando antibióticos e tranquilizantes.',
      },
    ],
  },

  // Efeitos colaterais
  {
    id: 'quimioterapia-causa-dor',
    categoryId: 'efeitos-colaterais',
    order: 1,
    question: 'A quimioterapia causa dor?',
    answer: [
      {
        type: 'paragraph',
        text: 'A única dor que o paciente deverá sentir é a da “picada” da agulha na pele, no momento de puncionar a veia para a realização da quimioterapia.',
      },
      {
        type: 'paragraph',
        text: 'Certos remédios podem causar, em algumas situações, uma sensação de desconforto, ardência, queimação, placas avermelhadas na pele e coceira. O paciente deve avisar imediatamente ao profissional que estiver lhe atendendo se sentir qualquer um desses sintomas.',
      },
    ],
  },
  {
    id: 'queda-de-cabelo',
    categoryId: 'efeitos-colaterais',
    order: 2,
    question: 'A quimioterapia causa queda de cabelo?',
    answer: [
      {
        type: 'paragraph',
        text: 'A queda do cabelo depende do tipo de medicamento. Pode não ocorrer, ser total ou parcial e leva, geralmente, de 14 a 21 dias para acontecer.',
      },
      {
        type: 'paragraph',
        text: 'Alguns pacientes, durante esta fase, preferem cortar o cabelo antes de vê-lo cair. Outros já preferem esperar que ele caia para só então tomar a decisão de cortar o restante e/ou usar bonés, lenços e perucas. Não se preocupe, pois este efeito é temporário e reversível: o cabelo voltará a crescer após o término da quimioterapia.',
      },
      {
        type: 'paragraph',
        text: 'A Crioterapia Capilar pode ser uma ferramenta auxiliar. Em casos selecionados e com indicação do seu médico, para muitos pacientes, representa a chance de manter um pouco mais de controle sobre a própria imagem em meio a um tratamento tão intenso.',
      },
      {
        type: 'paragraph',
        text: 'A Crioterapia Capilar, através do sistema Paxman, resfria o couro cabeludo antes, durante e depois da infusão da quimioterapia. Esse resfriamento reduz o fluxo sanguíneo na região, diminuindo a quantidade de medicamento que chega aos folículos capilares e preservando parte dos fios.',
      },
    ],
  },

  // Sexualidade
  {
    id: 'vida-sexual',
    categoryId: 'sexualidade',
    order: 1,
    question: 'A quimioterapia interfere na vida sexual?',
    answer: [
      {
        type: 'paragraph',
        text: 'A quimioterapia não interfere nas atividades sexuais: elas podem ser mantidas normalmente. Porém, alguns assuntos devem ser lembrados:',
      },
      {
        type: 'list',
        items: [
          {
            label: 'Uso de preservativos',
            text: 'A camisinha sempre deve ser utilizada durante as relações sexuais com o intuito de proteger o casal caso ocorra eliminação de medicamentos da quimioterapia. Além disso, ela pode prevenir infecções caso o paciente esteja no período de baixa imunidade.',
          },
          {
            label: 'Reprodução e sexualidade',
            text: 'A quimioterapia pode causar efeitos como a suspensão temporária da menstruação, a menopausa precoce nas mulheres e andropausa nos homens, levando a disfunções sexuais, ondas de calor, ressecamento vaginal e perda da libido. Caso o paciente esteja em idade reprodutiva e queira ter filhos, deve pedir orientações ao seu médico quanto a preservação da fertilidade.',
          },
          {
            label: 'Gravidez',
            text: 'Durante a quimioterapia a gravidez deve ser evitada, uma vez que os remédios podem causar má-formação fetal. Consulte o médico quanto ao melhor método contraceptivo a ser usado durante o tratamento.',
          },
        ],
      },
    ],
  },

  // Cuidados gerais
  {
    id: 'quando-procurar-o-hospital',
    categoryId: 'cuidados-gerais',
    order: 1,
    question: 'Quando devo procurar o hospital ou emergência?',
    answer: [
      {
        type: 'list',
        tone: 'alert',
        items: [
          // Espaço inseparável: "37,8" e "°C" não se separam na quebra de linha.
          { text: 'Febre igual ou superior a 37,8\u00a0°C' },
          { text: 'Pintas ou manchas avermelhadas na pele' },
          { text: 'Dispneia (falta de ar ao fazer pequenos esforços)' },
          { text: 'Dor persistente' },
          { text: 'Sangramentos' },
          { text: 'Vômito persistente' },
          { text: 'Crise convulsiva' },
          { text: 'Reações alérgicas' },
          { text: 'Aparecimento de nódulo pelo corpo' },
        ],
      },
    ],
  },
  {
    id: 'eliminacao-dos-quimioterapicos',
    categoryId: 'cuidados-gerais',
    order: 2,
    question: 'Como os quimioterápicos são eliminados pelo corpo?',
    answer: [
      {
        type: 'paragraph',
        text: 'A medicação é eliminada do corpo principalmente através da urina, mas também pode ocorrer por meio das fezes, vômito, suor, lágrimas, sêmen e leite materno.',
      },
      {
        type: 'paragraph',
        text: 'Se você divide o banheiro com alguém na sua casa, é importante puxar a descarga duas vezes seguidas com a tampa do vaso sanitário fechada. Fazendo isso, você impede que a próxima pessoa a utilizar o banheiro entre em contato com os quimioterápicos eventualmente.',
      },
      {
        type: 'paragraph',
        text: 'Se houver suor intenso, é importante também lavar as roupas de cama, toalhas e roupas separadas dos demais membros da casa.',
      },
    ],
  },
  {
    id: 'servico-de-quimioterapia',
    categoryId: 'cuidados-gerais',
    order: 3,
    question: 'Como funciona o serviço de quimioterapia?',
    answer: [
      {
        type: 'list',
        items: [
          {
            text: 'O serviço de quimioterapia da Supera Oncologia funciona das 8 às 18 horas, de segunda a sexta-feira.',
          },
          {
            text: 'Para as consultas, o paciente deverá estar com os resultados de exames de sangue, se solicitados pelo médico; se possível, colher um dia antes (quanto mais próximo do novo ciclo de quimioterapia melhor).',
          },
          { text: 'Os atendimentos serão realizados conforme a agenda do seu médico.' },
          {
            text: 'O paciente deverá marcar consulta quando precisar mostrar algum exame ao médico, caso o retorno não tiver sido marcado em consulta anterior.',
          },
          {
            text: 'Lembre-se de sempre agendar suas consultas com médico, nutricionista, fisioterapeuta e demais profissionais.',
          },
          {
            text: 'O paciente deve realizar agendamento para limpeza do cateter de Portocath diretamente com a enfermeira, este deve ser a cada 60 dias após o término do tratamento.',
          },
        ],
      },
    ],
  },
];
