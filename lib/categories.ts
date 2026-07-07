export interface CategoryDef {
  label: string
  color: string
  subcategories: string[]
}

export const CATEGORIES: Record<string, CategoryDef> = {
  'Alimentação': {
    label: 'Alimentação',
    color: '#f97316',
    subcategories: ['Restaurante', 'Delivery', 'Mercado', 'Café/Padaria', 'Lanchonete'],
  },
  'Transporte': {
    label: 'Transporte',
    color: '#3b82f6',
    subcategories: ['Combustível', 'Estacionamento', 'Uber/App', 'Pedágio', 'Manutenção'],
  },
  'Saúde': {
    label: 'Saúde',
    color: '#10b981',
    subcategories: ['Farmácia', 'Consulta/Exame', 'Academia/Esporte'],
  },
  'Lazer': {
    label: 'Lazer',
    color: '#8b5cf6',
    subcategories: ['Cinema/Teatro', 'Shows/Eventos', 'Viagem', 'Jogos/Streaming'],
  },
  'Compras': {
    label: 'Compras',
    color: '#ec4899',
    subcategories: ['Roupas/Vestuário', 'Eletrônicos', 'Casa/Decoração', 'Livros'],
  },
  'Assinaturas': {
    label: 'Assinaturas',
    color: '#06b6d4',
    subcategories: ['Streaming', 'Apps/Software', 'Telefone/Internet'],
  },
  'Educação': {
    label: 'Educação',
    color: '#f59e0b',
    subcategories: ['Cursos', 'Material Escolar', 'Mensalidade'],
  },
  'Moradia': {
    label: 'Moradia',
    color: '#84cc16',
    subcategories: ['Aluguel', 'Condomínio', 'Energia/Água', 'Reformas'],
  },
  'Financeiro': {
    label: 'Financeiro',
    color: '#64748b',
    subcategories: ['Juros/IOF', 'Multas', 'Anuidade', 'Parcelamentos'],
  },
  'Trabalho/Negócios': {
    label: 'Trabalho/Negócios',
    color: '#a78bfa',
    subcategories: ['Material', 'Serviços', 'Publicidade'],
  },
  'Presentes': {
    label: 'Presentes',
    color: '#f43f5e',
    subcategories: ['Presentes', 'Doações'],
  },
  'Outros': {
    label: 'Outros',
    color: '#94a3b8',
    subcategories: [],
  },
}

export const CATEGORY_NAMES = Object.keys(CATEGORIES)

export function getCategoryColor(category: string): string {
  return CATEGORIES[category]?.color ?? '#94a3b8'
}

export function getSubcategories(category: string): string[] {
  return CATEGORIES[category]?.subcategories ?? []
}
