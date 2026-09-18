import { Router } from 'express'
import { prisma } from '../lib/prisma'
import { requireAuth, requirePermission } from '../middleware/auth'
import { visitCreateSchema } from '../validators/schemas'

const router = Router()
router.use(requireAuth)

router.get('/', requirePermission('visits.read'), async (req, res) => {
  const visits = await prisma.visit.findMany({
    include: {
      company: true,
      contact: true,
      createdBy: { select: { id: true, firstName: true, lastName: true } },
      followUps: true,
    },
    orderBy: { visitedAt: 'desc' },
    take: 100,
  })
  return res.json(visits)
})

router.post('/', requirePermission('visits.write'), async (req, res) => {
  const parsed = visitCreateSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() })
  const visit = await prisma.visit.create({
    data: {
      companyId: parsed.data.companyId,
      contactId: parsed.data.contactId,
      visitedAt: new Date(parsed.data.visitedAt),
      location: parsed.data.location,
      notes: parsed.data.notes,
      nextAction: parsed.data.nextAction,
      createdById: req.user!.id,
    },
  })
  return res.status(201).json(visit)
})

export default router
