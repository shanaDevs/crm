import { Prisma, RoleCode } from '@prisma/client'
import { prisma } from '../lib/prisma'

async function defaultNewStage() {
  return (
    (await prisma.opportunityStage.findUnique({ where: { code: 'NEW' } })) ||
    (await prisma.opportunityStage.findFirst({ orderBy: { sortOrder: 'asc' } }))
  )
}

async function activeProducts() {
  return prisma.product.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } })
}

async function staffAgents() {
  return prisma.user.findMany({
    where: {
      isActive: true,
      role: { code: { not: RoleCode.CUSTOMER } },
    },
    orderBy: { firstName: 'asc' },
    select: { id: true, firstName: true, lastName: true, email: true },
  })
}

/**
 * Creates a NEW-stage opportunity for every customer that has none.
 * Product: body.productId → company interest → first active product.
 * Owner: company.assignedOfficerId → fallbackUserId.
 */
export async function backfillOpportunities(opts: {
  productId?: string | null
  fallbackOwnerId: string
  actorId: string
}) {
  const stage = await defaultNewStage()
  if (!stage) {
    return { ok: false as const, error: 'No opportunity stages configured. Add stages first.' }
  }

  const products = await activeProducts()
  if (!products.length && !opts.productId) {
    return { ok: false as const, error: 'No active products. Create a product before backfilling.' }
  }

  const forcedProduct = opts.productId
    ? await prisma.product.findUnique({ where: { id: opts.productId } })
    : null
  if (opts.productId && !forcedProduct) {
    return { ok: false as const, error: 'Selected product not found' }
  }

  const companies = await prisma.company.findMany({
    where: { opportunities: { none: {} } },
    include: {
      interestedProducts: { include: { product: true }, take: 1 },
      assignedOfficer: { select: { id: true } },
    },
    orderBy: { createdAt: 'asc' },
  })

  let created = 0
  const skipped: Array<{ companyId: string; name: string; reason: string }> = []

  for (const company of companies) {
    const product =
      forcedProduct ||
      company.interestedProducts.find((i) => i.product.isActive)?.product ||
      products[0]
    if (!product) {
      skipped.push({ companyId: company.id, name: company.name, reason: 'No product available' })
      continue
    }

    const ownerId = company.assignedOfficerId || opts.fallbackOwnerId
    const opportunity = await prisma.opportunity.create({
      data: {
        companyId: company.id,
        productId: product.id,
        stageId: stage.id,
        title: `${company.name} — ${product.name}`,
        currency: 'LKR',
        ownerId,
      },
    })
    await prisma.auditLog.create({
      data: {
        userId: opts.actorId,
        action: 'opportunity.backfill',
        entityType: 'Opportunity',
        entityId: opportunity.id,
        meta: { companyId: company.id, productId: product.id },
      },
    })
    created += 1
  }

  return {
    ok: true as const,
    created,
    scanned: companies.length,
    skipped,
    stageCode: stage.code,
  }
}

/** Assigns every unassigned customer to an agent (round-robin or a fixed user). */
export async function backfillAssignees(opts: {
  assigneeId?: string | null
  actorId: string
}) {
  const agents = await staffAgents()
  if (!agents.length) {
    return { ok: false as const, error: 'No active staff users to assign customers to' }
  }

  if (opts.assigneeId && !agents.some((a) => a.id === opts.assigneeId)) {
    return { ok: false as const, error: 'Selected assignee is not an active staff user' }
  }

  const unassigned = await prisma.company.findMany({
    where: { assignedOfficerId: null },
    orderBy: { createdAt: 'asc' },
    select: { id: true, name: true },
  })

  let updated = 0
  for (let i = 0; i < unassigned.length; i++) {
    const company = unassigned[i]
    const assigneeId = opts.assigneeId || agents[i % agents.length].id
    await prisma.company.update({
      where: { id: company.id },
      data: { assignedOfficerId: assigneeId },
    })
    await prisma.auditLog.create({
      data: {
        userId: opts.actorId,
        action: 'company.assign',
        entityType: 'Company',
        entityId: company.id,
        meta: { assignedOfficerId: assigneeId, backfill: true },
      },
    })
    updated += 1
  }

  return {
    ok: true as const,
    updated,
    scanned: unassigned.length,
    mode: opts.assigneeId ? 'fixed' : 'round_robin',
  }
}

export async function transferCustomer(opts: {
  companyId: string
  toUserId: string
  transferOpportunities: boolean
  actorId: string
}) {
  const company = await prisma.company.findUnique({
    where: { id: opts.companyId },
    select: { id: true, name: true, assignedOfficerId: true },
  })
  if (!company) return { ok: false as const, error: 'Customer not found', status: 404 }

  const toUser = await prisma.user.findFirst({
    where: {
      id: opts.toUserId,
      isActive: true,
      role: { code: { not: RoleCode.CUSTOMER } },
    },
    select: { id: true, firstName: true, lastName: true },
  })
  if (!toUser) return { ok: false as const, error: 'Assignee must be an active staff user', status: 400 }

  const fromUserId = company.assignedOfficerId

  await prisma.$transaction(async (tx) => {
    await tx.company.update({
      where: { id: company.id },
      data: { assignedOfficerId: toUser.id },
    })
    if (opts.transferOpportunities) {
      await tx.opportunity.updateMany({
        where: { companyId: company.id },
        data: { ownerId: toUser.id },
      })
    }
    await tx.auditLog.create({
      data: {
        userId: opts.actorId,
        action: 'company.transfer',
        entityType: 'Company',
        entityId: company.id,
        meta: {
          fromUserId,
          toUserId: toUser.id,
          transferOpportunities: opts.transferOpportunities,
        } satisfies Prisma.InputJsonValue,
      },
    })
  })

  const updated = await prisma.company.findUnique({
    where: { id: company.id },
    include: {
      contacts: true,
      level: true,
      assignedOfficer: { select: { id: true, firstName: true, lastName: true } },
      opportunities: { include: { stage: true, product: true, owner: true } },
    },
  })

  return { ok: true as const, company: updated, transferredTo: toUser }
}
