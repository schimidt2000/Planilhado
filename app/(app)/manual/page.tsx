import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ManualTransactionForm } from '@/components/ManualTransactionForm'

export default function ManualPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Novo lançamento</h1>
        <p className="mt-1 text-muted-foreground">Registre agora. Quando o extrato chegar, o Planilhado completa e concilia os dados.</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Dados do lançamento</CardTitle>
          <CardDescription>O lançamento já entra aprovado no mês escolhido.</CardDescription>
        </CardHeader>
        <CardContent><ManualTransactionForm /></CardContent>
      </Card>
    </div>
  )
}
