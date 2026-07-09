import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { created, error, ok, unauthorized } from '@/lib/api-response'
import type { ImportPreviewItem, ParsedTransaction, ImportSource, InputType } from '@/lib/types'
import { resolveDebtorReference } from '@/lib/server-debtors'

function dayDistance(left: Date, right: Date) {
  return Math.abs(left.getTime() - right.getTime()) / 86_400_000
}

async function buildPreview(
  userId: string,
  source: ImportSource,
  transactions: ParsedTransaction[]
): Promise<ImportPreviewItem[]> {
  const dates = transactions.map((item) => new Date(item.date))
  const minDate = new Date(Math.min(...dates.map((date) => date.getTime())) - 4 * 86_400_000)
  const maxDate = new Date(Math.max(...dates.map((date) => date.getTime())) + 4 * 86_400_000)
  const existing = await prisma.transaction.findMany({
    where: { userId, date: { gte: minDate, lte: maxDate } },
    select: {
      id: true, date: true, description: true, amountCents: true, isCredit: true,
      origin: true, reconciledAt: true, sourceType: true, externalIdentifier: true,
    },
  })
  const claimed = new Set<string>()

  return transactions.map((item, index) => {
    const duplicate = existing.find((candidate) =>
      item.externalIdentifier
        ? candidate.sourceType === source && candidate.externalIdentifier === item.externalIdentifier
        : candidate.origin !== 'manual' &&
          candidate.amountCents === item.amountCents &&
          candidate.isCredit === item.isCredit &&
          dayDistance(candidate.date, new Date(item.date)) <= 1 &&
          candidate.description.trim().toLowerCase() === item.description.trim().toLowerCase()
    )

    if (duplicate) {
      return {
        ...item,
        key: `${item.externalIdentifier ?? index}`,
        action: 'duplicate' as const,
        matchedTransactionId: duplicate.id,
        matchedDescription: duplicate.description,
      }
    }

    const manual = existing
      .filter((candidate) =>
        candidate.origin === 'manual' &&
        !candidate.reconciledAt &&
        !claimed.has(candidate.id) &&
        candidate.amountCents === item.amountCents &&
        candidate.isCredit === item.isCredit &&
        dayDistance(candidate.date, new Date(item.date)) <= 3
      )
      .sort((left, right) =>
        dayDistance(left.date, new Date(item.date)) - dayDistance(right.date, new Date(item.date))
      )[0]

    if (manual) {
      claimed.add(manual.id)
      return {
        ...item,
        key: `${item.externalIdentifier ?? index}`,
        action: 'complete' as const,
        matchedTransactionId: manual.id,
        matchedDescription: manual.description,
      }
    }

    return { ...item, key: `${item.externalIdentifier ?? index}`, action: 'new' as const }
  })
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return unauthorized()
  const userId = session.user.id

  const body = await req.json()
  const { month, source, inputType, transactions, previewOnly, fileName, fileSize, fileHash } = body as {
    month: string
    source: ImportSource
    inputType: InputType
    transactions: (ParsedTransaction | ImportPreviewItem)[]
    previewOnly?: boolean
    fileName?: string | null
    fileSize?: number | null
    fileHash?: string | null
  }

  if (!month || !source || !inputType || !Array.isArray(transactions)) {
    return error('Dados inválidos')
  }

  if (transactions.length === 0) return error('Nenhuma transação encontrada')

  if (previewOnly) {
    return ok({ preview: await buildPreview(userId, source, transactions) })
  }

  const preview = transactions.every((item) => 'action' in item)
    ? transactions as ImportPreviewItem[]
    : await buildPreview(userId, source, transactions)
  const newItems = preview.filter((item) => item.action === 'new')
  const completedItems = preview.filter((item) => item.action === 'complete' && item.matchedTransactionId)
  const duplicateCount = preview.filter((item) => item.action === 'duplicate').length

  let resolvedNewItems: {
    item: ImportPreviewItem
    debtor: Awaited<ReturnType<typeof resolveDebtorReference>>
  }[]
  let resolvedCompletedItems: {
    item: ImportPreviewItem
    debtor: Awaited<ReturnType<typeof resolveDebtorReference>>
  }[]
  try {
    resolvedNewItems = await Promise.all(newItems.map(async (item) => ({
      item,
      debtor: await resolveDebtorReference(userId, item.assignedDebtorId, item.assignedDebtorName),
    })))
    resolvedCompletedItems = await Promise.all(completedItems.map(async (item) => ({
      item,
      debtor: await resolveDebtorReference(userId, item.assignedDebtorId, item.assignedDebtorName),
    })))
  } catch (err) {
    return error(err instanceof Error ? err.message : 'Devedor inválido')
  }

  const result = await prisma.$transaction(async (tx) => {
    const importSession = await tx.importSession.create({
      data: {
        userId,
        month,
        source,
        inputType,
        fileName: fileName?.trim() || null,
        fileSize: Number.isFinite(Number(fileSize)) ? Math.round(Number(fileSize)) : null,
        fileHash: fileHash?.trim() || null,
        newCount: newItems.length,
        completedCount: completedItems.length,
        duplicateCount,
        transactions: {
          create: resolvedNewItems.map(({ item: t, debtor }) => ({
          userId,
          date: new Date(t.date),
          description: t.description,
          amountCents: t.amountCents,
          isCredit: t.isCredit,
          isCharge: t.isCharge ?? false,
          installmentCurrent: t.installmentCurrent ?? null,
          installmentTotal: t.installmentTotal ?? null,
          currencyOriginal: t.currencyOriginal ?? null,
          amountOriginalCents: t.amountOriginalCents ?? null,
          sourceType: source,
          cardLastFour: t.cardLastFour ?? null,
          rawLine: t.rawLine ?? null,
          externalIdentifier: t.externalIdentifier ?? null,
          origin: 'imported',
          ...(debtor.debtorName && {
            transactionType: 'receivable',
            debtorId: debtor.debtorId,
            debtorName: debtor.debtorName,
          }),
        })),
      },
    },
      select: { id: true },
    })

    for (const { item, debtor } of resolvedCompletedItems) {
      await tx.transaction.updateMany({
        where: {
          id: item.matchedTransactionId,
          userId,
          origin: 'manual',
          reconciledAt: null,
        },
        data: {
          date: new Date(item.date),
          description: item.description,
          isCredit: item.isCredit,
          isCharge: item.isCharge ?? false,
          installmentCurrent: item.installmentCurrent ?? null,
          installmentTotal: item.installmentTotal ?? null,
          currencyOriginal: item.currencyOriginal ?? null,
          amountOriginalCents: item.amountOriginalCents ?? null,
          sourceType: source,
          cardLastFour: item.cardLastFour ?? null,
          rawLine: item.rawLine ?? null,
          externalIdentifier: item.externalIdentifier ?? null,
          ...(debtor.debtorName && {
            transactionType: 'receivable',
            debtorId: debtor.debtorId,
            debtorName: debtor.debtorName,
          }),
          reconciledAt: new Date(),
        },
      })
    }

    return importSession
  })

  return created({
    sessionId: result.id,
    imported: newItems.length,
    completed: completedItems.length,
    ignored: duplicateCount,
  })
}

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return unauthorized()
  const userId = session.user.id

  const month = req.nextUrl.searchParams.get('month')

  const sessions = await prisma.importSession.findMany({
    where: { userId, ...(month && { month }) },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      month: true,
      source: true,
      inputType: true,
      fileName: true,
      fileSize: true,
      fileHash: true,
      newCount: true,
      completedCount: true,
      duplicateCount: true,
      createdAt: true,
      transactions: {
        select: {
          id: true,
          status: true,
          amountCents: true,
          isCredit: true,
        },
      },
    },
  })

  return ok(sessions.map((session) => {
    const total = session.transactions.length
    const approved = session.transactions.filter((tx) => tx.status === 'approved').length
    const rejected = session.transactions.filter((tx) => tx.status === 'rejected').length
    const pending = session.transactions.filter((tx) => tx.status === 'pending').length
    const newCount = session.newCount || total
    const completedCount = session.completedCount
    const duplicateCount = session.duplicateCount
    const totalCents = session.transactions
      .filter((tx) => !tx.isCredit)
      .reduce((sum, tx) => sum + tx.amountCents, 0)

    return {
      id: session.id,
      month: session.month,
      source: session.source,
      inputType: session.inputType,
      fileName: session.fileName,
      fileSize: session.fileSize,
      fileHash: session.fileHash,
      newCount,
      completedCount,
      duplicateCount,
      processedCount: newCount + completedCount + duplicateCount,
      createdAt: session.createdAt.toISOString(),
      total,
      approved,
      rejected,
      pending,
      totalCents,
    }
  }))
}
