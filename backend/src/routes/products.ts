import { Router } from 'express'
import { prisma } from '../lib/prisma'
import { requireAuth, requirePermission } from '../middleware/auth'
import {
  opportunityCreateSchema,
  opportunityStageCreateSchema,
  opportunityStageUpdateSchema,
  opportunityUpdateSchema,
  productCreateSchema,
  productUpdateSchema,
} from '../validators/schemas'
import { param, asJson } from '../lib/http'

const productsRouter = Router()
productsRouter.use(requireAuth)

productsRouter.get('/', requirePermission('products.read'), async (_req, res) => {
  const products = await prisma.product.findMany({
    include: {
      manager: { select: { id: true, firstName: true, lastName: true } },
      teamMembers: { include: { user: { select: { id: true, firstName: true, lastName: true } } } },
      _count: { select: { opportunities: true, requirements: true, tickets: true } },
    },
    orderBy: { name: 'asc' },
  })
  return res.json(products)
})

productsRouter.post('/', requirePermission('products.write'), async (req, res) => {
  const parsed = productCreateSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() })
  const product = await prisma.product.create({
    data: {
      name: parsed.data.name,
      description: parsed.data.description,
      category: parsed.data.category,
      isActive: parsed.data.isActive ?? true,
      managerId: parsed.data.managerId,
      teamMembers: parsed.data.teamMemberIds?.length
        ? { create: parsed.data.teamMemberIds.map((userId) => ({ userId })) }
        : undefined,
    },
  })
  return res.status(201).json(product)
})

productsRouter.patch('/:id', requirePermission('products.write'), async (req, res) => {
  const parsed = productUpdateSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() })
  const id = param(req, 'id')
  if (!(await prisma.product.findUnique({ where: { id } }))) return res.status(404).json({ error: 'Product not found' })
  const product = await prisma.product.update({ where: { id }, data: parsed.data })
  return res.json(product)
})

productsRouter.delete('/:id', requirePermission('products.write'), async (req, res) => {
  const id = param(req, 'id')
  const product = await prisma.product.findUnique({
    where: { id },
    include: { _count: { select: { opportunities: true, requirements: true, tickets: true } } },
  })
  if (!product) return res.status(404).json({ error: 'Product not found' })
  const used = product._count.opportunities + product._count.requirements + product._count.tickets
  if (used > 0) {
    return res.status(400).json({
      error: `"${product.name}" is used by ${product._count.opportunities} opportunities, ${product._count.requirements} requirements and ${product._count.tickets} tickets. Mark it inactive instead.`,
    })
  }
  await prisma.$transaction([
    prisma.followUp.updateMany({ where: { productId: id }, data: { productId: null } }),
    prisma.product.delete({ where: { id } }),
  ])
  return res.json({ ok: true })
})

const opportunitiesRouter = Router()
opportunitiesRouter.use(requireAuth)

opportunitiesRouter.get('/', requirePermission('opportunities.read'), async (req, res) => {
  const productId = req.query.productId ? String(req.query.productId) : undefined
  const opportunities = await prisma.opportunity.findMany({
    where: productId ? { productId } : undefined,
    include: {
      company: true,
      product: true,
      stage: true,
      owner: { select: { id: true, firstName: true, lastName: true } },
    },
    orderBy: { updatedAt: 'desc' },
  })
  return res.json(opportunities)
})

opportunitiesRouter.get('/stages', requirePermission('opportunities.read'), async (_req, res) => {
  const stages = await prisma.opportunityStage.findMany({
    include: { _count: { select: { opportunities: true } } },
    orderBy: { sortOrder: 'asc' },
  })
  return res.json(stages)
})

opportunitiesRouter.post('/stages', requirePermission('opportunities.write'), async (req, res) => {
  const parsed = opportunityStageCreateSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() })

  const name = parsed.data.name.trim()
  let code = (parsed.data.code?.trim() || name)
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
  if (!code) code = `STAGE_${Date.now()}`

  // Ensure unique code
  let existing = await prisma.opportunityStage.findUnique({ where: { code } })
  if (existing) {
    code = `${code}_${Math.floor(1000 + Math.random() * 9000)}`
  }

  let sortOrder = parsed.data.sortOrder
  if (typeof sortOrder !== 'number') {
    const highest = await prisma.opportunityStage.findFirst({ orderBy: { sortOrder: 'desc' } })
    sortOrder = (highest?.sortOrder ?? 0) + 1
  }

  const stage = await prisma.opportunityStage.create({
    data: {
      name,
      code,
      sortOrder,
      isWon: parsed.data.isWon ?? false,
      isLost: parsed.data.isLost ?? false,
    },
    include: { _count: { select: { opportunities: true } } },
  })
  return res.status(201).json(stage)
})

opportunitiesRouter.patch('/stages/:id', requirePermission('opportunities.write'), async (req, res) => {
  const parsed = opportunityStageUpdateSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() })

  const id = param(req, 'id')
  const existing = await prisma.opportunityStage.findUnique({ where: { id } })
  if (!existing) return res.status(404).json({ error: 'Stage not found' })

  const updated = await prisma.opportunityStage.update({
    where: { id },
    data: {
      name: parsed.data.name?.trim(),
      sortOrder: parsed.data.sortOrder,
      isWon: parsed.data.isWon,
      isLost: parsed.data.isLost,
    },
    include: { _count: { select: { opportunities: true } } },
  })
  return res.json(updated)
})

opportunitiesRouter.delete('/stages/:id', requirePermission('opportunities.write'), async (req, res) => {
  const id = param(req, 'id')
  const stage = await prisma.opportunityStage.findUnique({
    where: { id },
    include: { _count: { select: { opportunities: true } } },
  })
  if (!stage) return res.status(404).json({ error: 'Stage not found' })

  if (stage._count.opportunities > 0) {
    return res.status(400).json({
      error: `Cannot delete stage "${stage.name}" because it currently contains ${stage._count.opportunities} opportunities. Move or delete them first.`,
    })
  }

  await prisma.opportunityStage.delete({ where: { id } })
  return res.json({ success: true })
})

opportunitiesRouter.post('/', requirePermission('opportunities.write'), async (req, res) => {
  const parsed = opportunityCreateSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() })
  const stage = await prisma.opportunityStage.findUnique({ where: { code: parsed.data.stageCode } })
  if (!stage) return res.status(400).json({ error: 'Invalid stage' })

  const opportunity = await prisma.opportunity.create({
    data: {
      companyId: parsed.data.companyId,
      productId: parsed.data.productId,
      stageId: stage.id,
      title: parsed.data.title,
      value: parsed.data.value,
      currency: parsed.data.currency || 'USD',
      expectedCloseDate: parsed.data.expectedCloseDate ? new Date(parsed.data.expectedCloseDate) : null,
      notes: parsed.data.notes,
      ownerId: parsed.data.ownerId || req.user!.id,
    },
    include: { stage: true, product: true, company: true },
  })
  return res.status(201).json(opportunity)
})

opportunitiesRouter.patch('/:id/stage', requirePermission('opportunities.write'), async (req, res) => {
  const stage = await prisma.opportunityStage.findUnique({ where: { code: req.body.stageCode } })
  if (!stage) return res.status(400).json({ error: 'Invalid stage' })
  const opportunity = await prisma.opportunity.update({
    where: { id: param(req, 'id') },
    data: { stageId: stage.id },
    include: { stage: true },
  })
  return res.json(opportunity)
})

opportunitiesRouter.patch('/:id', requirePermission('opportunities.write'), async (req, res) => {
  const parsed = opportunityUpdateSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() })
  const { stageCode, expectedCloseDate, ...data } = parsed.data
  const id = param(req, 'id')
  if (!(await prisma.opportunity.findUnique({ where: { id } }))) {
    return res.status(404).json({ error: 'Opportunity not found' })
  }
  let stageId: string | undefined
  if (stageCode) {
    const stage = await prisma.opportunityStage.findUnique({ where: { code: stageCode } })
    if (!stage) return res.status(400).json({ error: 'Invalid stage' })
    stageId = stage.id
  }
  const opportunity = await prisma.opportunity.update({
    where: { id },
    data: {
      ...data,
      stageId,
      expectedCloseDate:
        expectedCloseDate === undefined ? undefined : expectedCloseDate ? new Date(expectedCloseDate) : null,
    },
    include: { stage: true, product: true, company: true },
  })
  return res.json(opportunity)
})

opportunitiesRouter.delete('/:id', requirePermission('opportunities.write'), async (req, res) => {
  const id = param(req, 'id')
  if (!(await prisma.opportunity.findUnique({ where: { id } }))) {
    return res.status(404).json({ error: 'Opportunity not found' })
  }
  await prisma.opportunity.delete({ where: { id } })
  return res.json({ ok: true })
})

export { productsRouter, opportunitiesRouter }
