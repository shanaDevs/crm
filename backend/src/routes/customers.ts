import { Router } from 'express'
import { RoleCode } from '@prisma/client'
import { prisma } from '../lib/prisma'
import { requireAuth, requirePermission } from '../middleware/auth'
import type { z } from 'zod'
import { companyCreateSchema, companyUpdateSchema, contactSchema } from '../validators/schemas'
import { param, asJson } from '../lib/http'
import { createFollowUp, parseFollowUpPlan } from '../services/followUps'

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
  const levelId = String(req.query.levelId || '').trim()
  if (levelId) where.levelId = levelId === 'none' ? null : levelId
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
      level: true,
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
      contacts: { orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }] },
      businessCards: { orderBy: { createdAt: 'desc' } },
      level: true,
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
  const plan = parseFollowUpPlan(req.body.followUp, req.user!)
  if (!plan.ok) return res.status(plan.status).json({ error: plan.error })

  let opportunityStage = null
  if (data.opportunity) {
    const product = await prisma.product.findUnique({ where: { id: data.opportunity.productId } })
    if (!product) return res.status(400).json({ error: 'Selected product for opportunity does not exist' })
    const stageCode = data.opportunity.stageCode || 'NEW'
    opportunityStage = await prisma.opportunityStage.findUnique({ where: { code: stageCode } })
    if (!opportunityStage) return res.status(400).json({ error: 'Selected opportunity stage is invalid' })
  }

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
      levelId: data.levelId || null,
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

  const opportunity = data.opportunity && opportunityStage
    ? await prisma.opportunity.create({
        data: {
          companyId: company.id,
          productId: data.opportunity.productId,
          stageId: opportunityStage.id,
          title: data.opportunity.title,
          value: data.opportunity.value,
          currency: data.opportunity.currency || 'LKR',
          expectedCloseDate: data.opportunity.expectedCloseDate ? new Date(data.opportunity.expectedCloseDate) : null,
          notes: data.opportunity.notes,
          ownerId: req.user!.id,
        },
        include: { stage: true, product: true },
      })
    : null

  if (opportunity) {
    await prisma.auditLog.create({
      data: {
        userId: req.user!.id,
        action: 'opportunity.create',
        entityType: 'Opportunity',
        entityId: opportunity.id,
      },
    })
  }

  const followUp = plan.value
    ? await createFollowUp(
        { ...plan.value, companyId: company.id, contactId: company.contacts[0]?.id, assigneeId: req.user!.id },
        req.user!.id
      )
    : null

  return res.status(201).json({ ...company, followUp, opportunity })
})

router.patch('/:id', requirePermission('customers.write'), async (req, res) => {
  const parsed = companyUpdateSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Invalid customer details', details: parsed.error.flatten() })
  const { primaryContact, ...data } = parsed.data
  const id = param(req, 'id')

  const existing = await prisma.company.findUnique({ where: { id }, include: { contacts: true } })
  if (!existing) return res.status(404).json({ error: 'Not found' })
  if (data.levelId && !(await prisma.customerLevel.findUnique({ where: { id: data.levelId } }))) {
    return res.status(400).json({ error: 'Level not found' })
  }

  await prisma.company.update({ where: { id }, data })

  if (primaryContact) {
    const current = existing.contacts.find((c) => c.isPrimary) || existing.contacts[0]
    const contactData = {
      firstName: primaryContact.firstName ?? current?.firstName ?? '',
      lastName: primaryContact.lastName ?? current?.lastName ?? '',
      jobTitle: primaryContact.jobTitle,
      email: primaryContact.email === undefined ? undefined : primaryContact.email || null,
      mobile: primaryContact.mobile,
      phone: primaryContact.phone,
    }
    if (current) {
      await prisma.contact.update({ where: { id: current.id }, data: contactData })
    } else if (Object.values(contactData).some(Boolean)) {
      await prisma.contact.create({ data: { ...contactData, companyId: id, isPrimary: true } })
    }
  }

  await prisma.auditLog.create({
    data: { userId: req.user!.id, action: 'company.update', entityType: 'Company', entityId: id, meta: asJson(parsed.data) },
  })

  const company = await prisma.company.findUnique({
    where: { id },
    include: { contacts: true, level: true, assignedOfficer: { select: { id: true, firstName: true, lastName: true } } },
  })
  return res.json(company)
})

function contactData(input: z.infer<typeof contactSchema>) {
  return {
    firstName: input.firstName,
    lastName: input.lastName,
    jobTitle: input.jobTitle || null,
    email: input.email || null,
    mobile: input.mobile || null,
    phone: input.phone || null,
  }
}

router.post('/:id/contacts', requirePermission('customers.write'), async (req, res) => {
  const parsed = contactSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() })
  const companyId = param(req, 'id')
  const company = await prisma.company.findUnique({ where: { id: companyId }, include: { contacts: true } })
  if (!company) return res.status(404).json({ error: 'Customer not found' })

  const isPrimary = parsed.data.isPrimary || company.contacts.length === 0
  const contact = await prisma.$transaction(async (tx) => {
    if (isPrimary) await tx.contact.updateMany({ where: { companyId }, data: { isPrimary: false } })
    return tx.contact.create({ data: { ...contactData(parsed.data), companyId, isPrimary } })
  })
  return res.status(201).json(contact)
})

router.patch('/:id/contacts/:contactId', requirePermission('customers.write'), async (req, res) => {
  const parsed = contactSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() })
  const companyId = param(req, 'id')
  const existing = await prisma.contact.findFirst({ where: { id: param(req, 'contactId'), companyId } })
  if (!existing) return res.status(404).json({ error: 'Contact not found' })

  const contact = await prisma.$transaction(async (tx) => {
    if (parsed.data.isPrimary) await tx.contact.updateMany({ where: { companyId }, data: { isPrimary: false } })
    return tx.contact.update({
      where: { id: existing.id },
      data: { ...contactData(parsed.data), isPrimary: parsed.data.isPrimary ?? existing.isPrimary },
    })
  })
  return res.json(contact)
})

router.delete('/:id/contacts/:contactId', requirePermission('customers.write'), async (req, res) => {
  const companyId = param(req, 'id')
  const existing = await prisma.contact.findFirst({ where: { id: param(req, 'contactId'), companyId } })
  if (!existing) return res.status(404).json({ error: 'Contact not found' })
  const id = existing.id

  await prisma.$transaction(async (tx) => {
    const unlink = { where: { contactId: id }, data: { contactId: null } }
    await tx.businessCard.updateMany(unlink)
    await tx.visit.updateMany(unlink)
    await tx.followUp.updateMany(unlink)
    await tx.requirement.updateMany(unlink)
    await tx.ticket.updateMany(unlink)
    await tx.contact.delete({ where: { id } })
    if (existing.isPrimary) {
      const next = await tx.contact.findFirst({ where: { companyId }, orderBy: { createdAt: 'asc' } })
      if (next) await tx.contact.update({ where: { id: next.id }, data: { isPrimary: true } })
    }
  })
  return res.json({ ok: true })
})

router.delete('/:id', requirePermission('customers.delete'), async (req, res) => {
  const id = param(req, 'id')
  const existing = await prisma.company.findUnique({ where: { id } })
  if (!existing) return res.status(404).json({ error: 'Not found' })

  await prisma.$transaction([
    prisma.user.updateMany({ where: { companyId: id }, data: { companyId: null, isActive: false } }),
    prisma.company.delete({ where: { id } }),
  ])
  await prisma.auditLog.create({
    data: {
      userId: req.user!.id,
      action: 'company.delete',
      entityType: 'Company',
      entityId: id,
      meta: { name: existing.name },
    },
  })
  return res.json({ ok: true })
})

export default router
