import { Router } from 'express'
import { createSession, hashPassword, loadAuthUser, verifyPassword } from '../lib/auth'
import { prisma } from '../lib/prisma'
import { loginSchema } from '../validators/schemas'
import { requireAuth } from '../middleware/auth'
import { normalizePhone } from '../services/sms'

const router = Router()

router.post('/login', async (req, res) => {
  const parsed = loginSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() })

  const user = await prisma.user.findUnique({
    where: { email: parsed.data.email.toLowerCase() },
    include: { role: true },
  })
  if (!user || !(await verifyPassword(parsed.data.password, user.passwordHash))) {
    return res.status(401).json({ error: 'Invalid email or password' })
  }
  if (!user.isActive) return res.status(403).json({ error: 'Account inactive' })

  const { token, expiresAt } = await createSession(
    user.id,
    req.headers['user-agent'],
    req.ip
  )

  res.cookie('token', token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    expires: expiresAt,
  })

  const authUser = await loadAuthUser(user.id)
  return res.json({ token, user: authUser })
})

router.post('/logout', requireAuth, async (req, res) => {
  const header = req.headers.authorization
  const cookieToken = req.cookies?.token as string | undefined
  const token = header?.startsWith('Bearer ') ? header.slice(7) : cookieToken
  if (token) {
    const { hashToken } = await import('../lib/auth')
    await prisma.session.deleteMany({ where: { tokenHash: hashToken(token) } })
  }
  res.clearCookie('token')
  return res.json({ ok: true })
})

router.get('/me', requireAuth, async (req, res) => {
  return res.json({ user: req.user })
})

router.patch('/me', requireAuth, async (req, res) => {
  const raw = req.body?.phone
  if (raw !== null && typeof raw !== 'string') return res.status(400).json({ error: 'phone must be a string or null' })
  const phone = raw?.trim() || null
  if (phone && !normalizePhone(phone)) {
    return res.status(400).json({ error: 'Enter a valid mobile number, e.g. 0771234567' })
  }
  await prisma.user.update({ where: { id: req.user!.id }, data: { phone } })
  return res.json({ user: await loadAuthUser(req.user!.id) })
})

router.post('/register-customer', requireAuth, async (req, res) => {
  // Staff can create a portal login for a company contact
  if (!req.user || req.user.roleCode === 'CUSTOMER') {
    return res.status(403).json({ error: 'Forbidden' })
  }
  const { email, password, firstName, lastName, companyId } = req.body as {
    email: string
    password: string
    firstName: string
    lastName: string
    companyId: string
  }
  if (!email || !password || !firstName || !lastName || !companyId) {
    return res.status(400).json({ error: 'Missing required fields' })
  }
  const role = await prisma.role.findFirst({ where: { code: 'CUSTOMER' }, orderBy: { isSystem: 'desc' } })
  if (!role) return res.status(500).json({ error: 'Customer role missing' })

  const existing = await prisma.user.findUnique({ where: { email: email.toLowerCase() } })
  if (existing) return res.status(409).json({ error: 'Email already registered' })

  const user = await prisma.user.create({
    data: {
      email: email.toLowerCase(),
      passwordHash: await hashPassword(password),
      firstName,
      lastName,
      roleId: role.id,
      companyId,
    },
  })
  await prisma.notificationPreference.create({ data: { userId: user.id } })
  return res.status(201).json({ id: user.id, email: user.email })
})

export default router
