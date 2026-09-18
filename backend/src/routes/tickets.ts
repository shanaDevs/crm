import { Router } from 'express'
import { CommentVisibility, RoleCode, TicketStatus } from '@prisma/client'
import { prisma } from '../lib/prisma'
import { requireAuth, requirePermission } from '../middleware/auth'
import { notifyUser } from '../services/notifications'
import { ticketCreateSchema } from '../validators/schemas'

const router = Router()
router.use(requireAuth)

async function nextTicketNumber() {
  const count = await prisma.ticket.count()
  return `TCK-${String(count + 1).padStart(5, '0')}`
}

router.get('/', requirePermission('tickets.read'), async (req, res) => {
  const where: Record<string, unknown> = {}
  if (req.user?.roleCode === RoleCode.CUSTOMER) {
    where.companyId = req.user.companyId || '__none__'
  } else if (req.user?.roleCode === RoleCode.DEVELOPER) {
    where.assigneeId = req.user.id
  }
  if (req.query.status) where.status = String(req.query.status)

  const tickets = await prisma.ticket.findMany({
    where,
    include: {
      company: true,
      product: true,
      assignee: { select: { id: true, firstName: true, lastName: true } },
    },
    orderBy: { updatedAt: 'desc' },
  })
  return res.json(tickets)
})

router.post('/', requirePermission('tickets.write'), async (req, res) => {
  const parsed = ticketCreateSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() })

  if (req.user?.roleCode === RoleCode.CUSTOMER && req.user.companyId !== parsed.data.companyId) {
    return res.status(403).json({ error: 'Forbidden' })
  }

  const ticket = await prisma.ticket.create({
    data: {
      ticketNumber: await nextTicketNumber(),
      title: parsed.data.title,
      description: parsed.data.description,
      companyId: parsed.data.companyId,
      contactId: parsed.data.contactId,
      productId: parsed.data.productId,
      requirementId: parsed.data.requirementId,
      type: parsed.data.type,
      priority: parsed.data.priority,
      dueDate: parsed.data.dueDate ? new Date(parsed.data.dueDate) : null,
      assigneeId: parsed.data.assigneeId,
      createdById: req.user!.id,
      statusHistory: {
        create: { toStatus: TicketStatus.OPEN, changedById: req.user!.id, note: 'Created' },
      },
    },
  })

  if (ticket.assigneeId) {
    await notifyUser({
      userId: ticket.assigneeId,
      title: 'Ticket assigned',
      body: `${ticket.ticketNumber}: ${ticket.title}`,
      linkUrl: `/tickets/${ticket.id}`,
    })
  }

  return res.status(201).json(ticket)
})

router.get('/:id', requirePermission('tickets.read'), async (req, res) => {
  const ticket = await prisma.ticket.findUnique({
    where: { id: req.params.id },
    include: {
      company: true,
      contact: true,
      product: true,
      requirement: true,
      assignee: true,
      createdBy: true,
      statusHistory: { orderBy: { createdAt: 'desc' } },
      comments: {
        include: { author: { select: { id: true, firstName: true, lastName: true } } },
        orderBy: { createdAt: 'asc' },
      },
    },
  })
  if (!ticket) return res.status(404).json({ error: 'Not found' })
  if (req.user?.roleCode === RoleCode.CUSTOMER) {
    if (req.user.companyId !== ticket.companyId) return res.status(403).json({ error: 'Forbidden' })
    return res.json({
      ...ticket,
      comments: ticket.comments.filter((c) => c.visibility === CommentVisibility.CUSTOMER_VISIBLE),
    })
  }
  return res.json(ticket)
})

router.patch('/:id/assign', requirePermission('tickets.manage'), async (req, res) => {
  const assigneeId = req.body.assigneeId as string
  const existing = await prisma.ticket.findUnique({ where: { id: req.params.id } })
  if (!existing) return res.status(404).json({ error: 'Not found' })

  const ticket = await prisma.ticket.update({
    where: { id: req.params.id },
    data: { assigneeId },
  })

  if (assigneeId) {
    await notifyUser({
      userId: assigneeId,
      title: 'Ticket reassigned to you',
      body: `${ticket.ticketNumber}: ${ticket.title}`,
      linkUrl: `/tickets/${ticket.id}`,
    })
  }
  return res.json(ticket)
})

router.patch('/:id/status', requirePermission('tickets.write'), async (req, res) => {
  const toStatus = req.body.status as TicketStatus
  const existing = await prisma.ticket.findUnique({ where: { id: req.params.id } })
  if (!existing) return res.status(404).json({ error: 'Not found' })

  const ticket = await prisma.ticket.update({
    where: { id: req.params.id },
    data: {
      status: toStatus,
      statusHistory: {
        create: {
          fromStatus: existing.status,
          toStatus,
          note: req.body.note,
          changedById: req.user!.id,
        },
      },
    },
  })
  return res.json(ticket)
})

router.post('/:id/comments', requirePermission('tickets.write'), async (req, res) => {
  const visibility =
    req.user?.roleCode === RoleCode.CUSTOMER
      ? CommentVisibility.CUSTOMER_VISIBLE
      : (req.body.visibility as CommentVisibility) || CommentVisibility.INTERNAL

  if (req.user?.roleCode === RoleCode.CUSTOMER && visibility !== CommentVisibility.CUSTOMER_VISIBLE) {
    return res.status(403).json({ error: 'Customers cannot create internal notes' })
  }

  const comment = await prisma.comment.create({
    data: {
      ticketId: req.params.id,
      body: req.body.body,
      visibility,
      authorId: req.user!.id,
    },
  })

  if (visibility === CommentVisibility.CUSTOMER_VISIBLE) {
    const ticket = await prisma.ticket.findUnique({ where: { id: req.params.id } })
    if (ticket?.assigneeId && req.user?.roleCode === RoleCode.CUSTOMER) {
      await notifyUser({
        userId: ticket.assigneeId,
        title: 'Customer replied on ticket',
        body: ticket.title,
        linkUrl: `/tickets/${ticket.id}`,
      })
    }
  }

  return res.status(201).json(comment)
})

export default router
