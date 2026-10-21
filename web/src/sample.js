// Conteúdo de prévia das telas do Figma. Perfis reais vêm da API.
export const sampleProfessionals = [
  { slug: 'camila-santos-demo', nome_publico: 'Camila Santos', titulo: 'Ativações de marca e eventos corporativos', cidade: 'São Paulo', uf: 'SP', experiencia: '6 anos de experiência', nota: '4,9 (38)', preco: 'R$ 450', resumo: 'Uma boa experiência começa no primeiro contato. Cuido de cada detalhe da sua ação.', cor: 'violet', demo: true },
  { slug: 'rafael-oliveira-demo', nome_publico: 'Rafael Oliveira', titulo: 'Feiras, congressos e ações promocionais', cidade: 'São Paulo', uf: 'SP', experiencia: '5 anos de experiência', nota: '4,8 (26)', preco: 'R$ 400', resumo: 'Energia e organização para aproximar sua marca das pessoas certas.', cor: 'blue', demo: true },
  { slug: 'juliana-costa-demo', nome_publico: 'Juliana Costa', titulo: 'Lançamentos e experiências de marca', cidade: 'São Paulo', uf: 'SP', experiencia: '7 anos de experiência', nota: '5,0 (31)', preco: 'R$ 500', resumo: 'Transformo o encontro com seu público em uma experiência que fica.', cor: 'rose', demo: true },
  { slug: 'lucas-almeida-demo', nome_publico: 'Lucas Almeida', titulo: 'Ações de rua e eventos corporativos', cidade: 'São Paulo', uf: 'SP', experiencia: '4 anos de experiência', nota: '4,9 (10)', preco: 'R$ 380', resumo: 'Comunicação leve e presença ativa para dar vida ao seu evento.', cor: 'green', demo: true },
];

export const initialEvent = {
  nome: '', tipo: 'Corporativo · Lançamento de produto', data: '', inicio: '', termino: '',
  cidade: '', uf: '', espaco: '', endereco: '', publico: '', quantidade: '1',
  necessidades: [], detalhes: '', orcamento: '',
};

export const eventTypes = ['Corporativo · Lançamento de produto', 'Feiras e congressos', 'Festas e celebrações', 'Ações promocionais'];
export const needOptions = ['Ativação de marca', 'Abordagem de público', 'Distribuição de brindes'];
export const brazilStates = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'];
