import { Router } from 'express'
import { prisma } from '../lib/prisma'
import { hasPermission } from '../lib/auth'
import { requireAuth, requirePermission } from '../middleware/auth'
import { visitCreateSchema, visitUpdateSchema } from '../validators/schemas'
import { param } from '../lib/http'

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
  const data = parsed.data

  if (data.saveAsCompanyAddress && !hasPermission(req.user!, 'customers.write')) {
    return res.status(403).json({ error: "You don't have permission to change the customer's address" })
  }

  const visit = await prisma.visit.create({
    data: {
      companyId: data.companyId,
      contactId: data.contactId,
      visitedAt: new Date(data.visitedAt),
      location: data.location,
      latitude: data.latitude ?? null,
      longitude: data.longitude ?? null,
      notes: data.notes,
      nextAction: data.nextAction,
      createdById: req.user!.id,
    },
  })

  if (data.saveAsCompanyAddress && data.location?.trim()) {
    await prisma.company.update({
      where: { id: data.companyId },
      data: { addressLine1: data.location.trim() },
    })
  }

  return res.status(201).json(visit)
})

router.patch('/:id', requirePermission('visits.write'), async (req, res) => {
  const parsed = visitUpdateSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() })
  const { saveAsCompanyAddress, visitedAt, ...data } = parsed.data
  const id = param(req, 'id')

  const existing = await prisma.visit.findUnique({ where: { id } })
  if (!existing) return res.status(404).json({ error: 'Visit not found' })
  if (saveAsCompanyAddress && !hasPermission(req.user!, 'customers.write')) {
    return res.status(403).json({ error: "You don't have permission to change the customer's address" })
  }

  const visit = await prisma.visit.update({
    where: { id },
    data: { ...data, visitedAt: visitedAt ? new Date(visitedAt) : undefined },
  })

  if (saveAsCompanyAddress && visit.location?.trim()) {
    await prisma.company.update({ where: { id: visit.companyId }, data: { addressLine1: visit.location.trim() } })
  }
  return res.json(visit)
})

router.delete('/:id', requirePermission('visits.write'), async (req, res) => {
  const id = param(req, 'id')
  const existing = await prisma.visit.findUnique({ where: { id } })
  if (!existing) return res.status(404).json({ error: 'Visit not found' })
  await prisma.$transaction([
    prisma.followUp.updateMany({ where: { visitId: id }, data: { visitId: null } }),
    prisma.visit.delete({ where: { id } }),
  ])
  return res.json({ ok: true })
})

export default router
