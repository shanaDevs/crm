import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import { requireAuth, requirePermission } from '../middleware/auth'

const leadSourceSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(100),
  sortOrder: z.number().int().optional(),
})

export const leadSourcesRouter = Router()
leadSourcesRouter.use(requireAuth)

leadSourcesRouter.get('/', requirePermission('customers.read'), async (_req, res) => {
  const sources = await prisma.leadSource.findMany({
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
  })
  return res.json(sources)
})

leadSourcesRouter.post('/', requirePermission('customers.write'), async (req, res) => {
  const parsed = leadSourceSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid lead source' })
  }

  const existing = await prisma.leadSource.findUnique({ where: { name: parsed.data.name } })
  if (existing) {
    return res.status(409).json({ error: 'A lead source with this name already exists' })
  }

  const max = await prisma.leadSource.aggregate({ _max: { sortOrder: true } })
  const source = await prisma.leadSource.create({
    data: {
      name: parsed.data.name,
      sortOrder: parsed.data.sortOrder ?? (max._max.sortOrder ?? 0) + 1,
    },
  })
  return res.status(201).json(source)
})

leadSourcesRouter.patch('/:id', requirePermission('customers.write'), async (req, res) => {
  const parsed = leadSourceSchema.partial().safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid lead source' })
  }

  const id = req.params.id as string
  const current = await prisma.leadSource.findUnique({ where: { id } })
  if (!current) {
    return res.status(404).json({ error: 'Lead source not found' })
  }

  if (parsed.data.name && parsed.data.name !== current.name) {
    const clash = await prisma.leadSource.findUnique({ where: { name: parsed.data.name } })
    if (clash && clash.id !== id) {
      return res.status(409).json({ error: 'A lead source with this name already exists' })
    }

    // Update companies referencing the old name to keep data clean and consistent
    await prisma.company.updateMany({
      where: { leadSource: current.name },
      data: { leadSource: parsed.data.name },
    })
  }

  const updated = await prisma.leadSource.update({
    where: { id },
    data: parsed.data,
  })
  return res.json(updated)
})

leadSourcesRouter.delete('/:id', requirePermission('customers.write'), async (req, res) => {
  const id = req.params.id as string
  const current = await prisma.leadSource.findUnique({ where: { id } })
  if (!current) {
    return res.status(404).json({ error: 'Lead source not found' })
  }

  await prisma.leadSource.delete({ where: { id } })
  return res.json({ ok: true })
})
