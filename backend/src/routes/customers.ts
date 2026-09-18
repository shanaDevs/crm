import { Router } from 'express'
import { RoleCode } from '@prisma/client'
import { prisma } from '../lib/prisma'
import { requireAuth, requirePermission } from '../middleware/auth'
import { companyCreateSchema } from '../validators/schemas'
import { param, asJson } from '../lib/http'

const router = Router()

router.use(requireAuth)

function customerScope(user: Express.Request['user']) {
  if (user?.roleCode === RoleCode.CUSTOMER) {
    return { companyId: user.companyId || '__none__' }
  }
  return {}
}

router.get('/', requirePermission('customers.read'), async (req, res) => {
  const q = String(req.query.q || '').trim()
  const where: Record<string, unknown> = { ...customerScope(req.user) }
  if (req.user?.roleCode === RoleCode.CUSTOMER && !req.user.companyId) {
    return res.json([])
  }
  if (q) {
    where.OR = [
      { name: { contains: q, mode: 'insensitive' } },
      { contacts: { some: { email: { contains: q, mode: 'insensitive' } } } },
      { contacts: { some: { mobile: { contains: q, mode: 'insensitive' } } } },
      { contacts: { some: { firstName: { contains: q, mode: 'insensitive' } } } },
      { contacts: { some: { lastName: { contains: q, mode: 'insensitive' } } } },
    ]
  }
  const companies = await prisma.company.findMany({
    where,
    include: {
      contacts: true,
      assignedOfficer: { select: { id: true, firstName: true, lastName: true } },
      interestedProducts: { include: { product: true } },
      _count: { select: { followUps: true, opportunities: true, tickets: true } },
    },
    orderBy: { updatedAt: 'desc' },
    take: 100,
  })
  return res.json(companies)
})

router.get('/duplicates', requirePermission('customers.write'), async (req, res) => {
  const email = String(req.query.email || '').trim()
  const mobile = String(req.query.mobile || '').trim()
  const name = String(req.query.name || '').trim()
  const or: object[] = []
  if (email) or.push({ contacts: { some: { email: { equals: email, mode: 'insensitive' } } } })
  if (mobile) or.push({ contacts: { some: { mobile: { contains: mobile } } } })
  if (name) or.push({ name: { equals: name, mode: 'insensitive' } })
  if (!or.length) return res.json([])
  const matches = await prisma.company.findMany({
    where: { OR: or },
    include: { contacts: true },
    take: 20,
  })
  return res.json(matches)
})

router.get('/:id', requirePermission('customers.read'), async (req, res) => {
  const company = await prisma.company.findUnique({
    where: { id: param(req, 'id') },
    include: {
      contacts: true,
      businessCards: true,
      visits: { orderBy: { visitedAt: 'desc' }, take: 50 },
      followUps: { orderBy: { scheduledAt: 'desc' }, take: 50, include: { callLogs: true, assignee: true } },
      opportunities: { include: { product: true, stage: true } },
      requirements: { include: { product: true } },
      tickets: { include: { product: true } },
      interestedProducts: { include: { product: true } },
      assignedOfficer: true,
    },
  })
  if (!company) return res.status(404).json({ error: 'Not found' })
  if (req.user?.roleCode === RoleCode.CUSTOMER && req.user.companyId !== company.id) {
    return res.status(403).json({ error: 'Forbidden' })
  }
  return res.json(company)
})

router.post('/', requirePermission('customers.write'), async (req, res) => {
  const parsed = companyCreateSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() })
  const data = parsed.data

  const company = await prisma.company.create({
    data: {
      name: data.name,
      website: data.website,
      businessCategory: data.businessCategory,
      addressLine1: data.addressLine1,
      city: data.city,
      state: data.state,
      postalCode: data.postalCode,
      country: data.country,
      leadSource: data.leadSource,
      leadStatus: data.leadStatus,
      preferredContactMethod: data.preferredContactMethod,
      callingHoursStart: data.callingHoursStart,
      callingHoursEnd: data.callingHoursEnd,
      timezone: data.timezone || 'UTC',
      tags: data.tags || [],
      notes: data.notes,
      assignedOfficerId: data.assignedOfficerId || req.user!.id,
      contacts: data.contact
        ? {
            create: {
              firstName: data.contact.firstName,
              lastName: data.contact.lastName,
              jobTitle: data.contact.jobTitle,
              email: data.contact.email || null,
              mobile: data.contact.mobile,
              phone: data.contact.phone,
              website: data.contact.website,
              linkedinUrl: data.contact.linkedinUrl,
              twitterUrl: data.contact.twitterUrl,
              isPrimary: data.contact.isPrimary ?? true,
            },
          }
        : undefined,
      interestedProducts: data.interestedProductIds?.length
        ? {
            create: data.interestedProductIds.map((productId) => ({ productId })),
          }
        : undefined,
    },
    include: { contacts: true, interestedProducts: true },
  })

  await prisma.auditLog.create({
    data: {
      userId: req.user!.id,
      action: 'company.create',
      entityType: 'Company',
      entityId: company.id,
    },
  })

  return res.status(201).json(company)
})

router.patch('/:id', requirePermission('customers.write'), async (req, res) => {
  const company = await prisma.company.update({
    where: { id: param(req, 'id') },
    data: {
      name: req.body.name,
      website: req.body.website,
      businessCategory: req.body.businessCategory,
      leadStatus: req.body.leadStatus,
      leadSource: req.body.leadSource,
      notes: req.body.notes,
      tags: req.body.tags,
      assignedOfficerId: req.body.assignedOfficerId,
      preferredContactMethod: req.body.preferredContactMethod,
      callingHoursStart: req.body.callingHoursStart,
      callingHoursEnd: req.body.callingHoursEnd,
      timezone: req.body.timezone,
    },
  })
  return res.json(company)
})

export default router
