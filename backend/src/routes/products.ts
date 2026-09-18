import { Router } from 'express'
import { prisma } from '../lib/prisma'
import { requireAuth, requirePermission } from '../middleware/auth'
import { opportunityCreateSchema, productCreateSchema } from '../validators/schemas'
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
  const product = await prisma.product.update({
    where: { id: param(req, 'id') },
    data: {
      name: req.body.name,
      description: req.body.description,
      category: req.body.category,
      isActive: req.body.isActive,
      managerId: req.body.managerId,
    },
  })
  return res.json(product)
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
  const stages = await prisma.opportunityStage.findMany({ orderBy: { sortOrder: 'asc' } })
  return res.json(stages)
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

export { productsRouter, opportunitiesRouter }
