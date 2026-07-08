export interface CategoryDef {
  label: string
  color: string
  budgetGroup: BudgetGroup
  subcategories: string[]
}

export type BudgetGroup = 'needs' | 'wants' | 'savings'

export const BUDGET_GROUPS: Record<BudgetGroup, { label: string; targetPercent: number; color: string }> = {
  needs: { label: 'Essenciais', targetPercent: 50, color: '#2563eb' },
  wants: { label: 'Estilo de vida', targetPercent: 30, color: '#f97316' },
  savings: { label: 'Reservas e futuro', targetPercent: 20, color: '#16a34a' },
}

export const CATEGORIES: Record<string, CategoryDef> = {
  'Alimentação': {
    label: 'Alimentação',
    color: '#f97316',
    budgetGroup: 'needs',
    subcategories: ['Mercado', 'Feira', 'Restaurante', 'Delivery', 'Café/Padaria', 'Lanchonete'],
  },
  'Transporte': {
    label: 'Transporte',
    color: '#3b82f6',
    budgetGroup: 'needs',
    subcategories: ['Combustível', 'Estacionamento', 'Uber/App', 'Pedágio', 'Manutenção'],
  },
  'Saúde': {
    label: 'Saúde',
    color: '#10b981',
    budgetGroup: 'needs',
    subcategories: ['Farmácia', 'Consulta/Exame', 'Plano de saúde', 'Terapia', 'Academia/Esporte'],
  },
  'Moradia': {
    label: 'Moradia',
    color: '#84cc16',
    budgetGroup: 'needs',
    subcategories: ['Aluguel', 'Condomínio', 'Energia', 'Água', 'Gás', 'Internet', 'Reformas'],
  },
  'Contas e Serviços': {
    label: 'Contas e Serviços',
    color: '#0ea5e9',
    budgetGroup: 'needs',
    subcategories: ['Telefone', 'Internet', 'Seguro', 'Impostos', 'Documentos'],
  },
  'Lazer': {
    label: 'Lazer',
    color: '#8b5cf6',
    budgetGroup: 'wants',
    subcategories: ['Cinema/Teatro', 'Shows/Eventos', 'Viagem', 'Jogos/Streaming'],
  },
  'Compras': {
    label: 'Compras',
    color: '#ec4899',
    budgetGroup: 'wants',
    subcategories: ['Roupas/Vestuário', 'Eletrônicos', 'Casa/Decoração', 'Livros'],
  },
  'Assinaturas': {
    label: 'Assinaturas',
    color: '#06b6d4',
    budgetGroup: 'wants',
    subcategories: ['Streaming', 'Apps/Software', 'Telefone/Internet'],
  },
  'Educação': {
    label: 'Educação',
    color: '#f59e0b',
    budgetGroup: 'savings',
    subcategories: ['Cursos', 'Material Escolar', 'Mensalidade'],
  },
  'Investimentos': {
    label: 'Investimentos',
    color: '#16a34a',
    budgetGroup: 'savings',
    subcategories: ['Reserva de emergência', 'Renda fixa', 'Renda variável', 'Aposentadoria'],
  },
  'Financeiro': {
    label: 'Financeiro',
    color: '#64748b',
    budgetGroup: 'needs',
    subcategories: ['Juros/IOF', 'Multas', 'Anuidade', 'Parcelamentos'],
  },
  'Trabalho/Negócios': {
    label: 'Trabalho/Negócios',
    color: '#a78bfa',
    budgetGroup: 'savings',
    subcategories: ['Material', 'Serviços', 'Publicidade'],
  },
  'Presentes': {
    label: 'Presentes',
    color: '#f43f5e',
    budgetGroup: 'wants',
    subcategories: ['Presentes', 'Doações'],
  },
  'Outros': {
    label: 'Outros',
    color: '#94a3b8',
    budgetGroup: 'wants',
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

export function getBudgetGroup(category: string): BudgetGroup {
  return CATEGORIES[category]?.budgetGroup ?? 'wants'
}
