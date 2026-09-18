import bcrypt from 'bcryptjs'
import crypto from 'crypto'
import jwt from 'jsonwebtoken'
import { RoleCode } from '@prisma/client'
import { prisma } from './prisma'

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret'
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d'

export type AuthUser = {
  id: string
  email: string
  firstName: string
  lastName: string
  roleCode: RoleCode
  companyId: string | null
  timezone: string
  permissions: string[]
}

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 10)
}

export async function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash)
}

export function signAccessToken(userId: string) {
  return jwt.sign({ sub: userId }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN as jwt.SignOptions['expiresIn'] })
}

export function verifyAccessToken(token: string): { sub: string } {
  return jwt.verify(token, JWT_SECRET) as { sub: string }
}

export function hashToken(token: string) {
  return crypto.createHash('sha256').update(token).digest('hex')
}

export async function createSession(userId: string, userAgent?: string, ipAddress?: string) {
  const token = signAccessToken(userId)
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
  await prisma.session.create({
    data: {
      userId,
      tokenHash: hashToken(token),
      expiresAt,
      userAgent,
      ipAddress,
    },
  })
  return { token, expiresAt }
}

export async function loadAuthUser(userId: string): Promise<AuthUser | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      role: {
        include: {
          permissions: { include: { permission: true } },
        },
      },
    },
  })
  if (!user || !user.isActive) return null
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    roleCode: user.role.code,
    companyId: user.companyId,
    timezone: user.timezone,
    permissions: user.role.permissions.map((rp) => rp.permission.code),
  }
}

export function hasPermission(user: AuthUser, permission: string) {
  if (user.roleCode === RoleCode.CRM_ADMIN) return true
  return user.permissions.includes(permission)
}

export function isStaff(user: AuthUser) {
  return user.roleCode !== RoleCode.CUSTOMER
}
