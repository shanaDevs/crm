import { NextFunction, Request, Response } from 'express'
import { AuthUser, hashToken, loadAuthUser, verifyAccessToken } from '../lib/auth'
import { prisma } from '../lib/prisma'
import { RoleCode } from '@prisma/client'

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser
    }
  }
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  try {
    const header = req.headers.authorization
    const cookieToken = req.cookies?.token as string | undefined
    const token = header?.startsWith('Bearer ') ? header.slice(7) : cookieToken
    if (!token) {
      return res.status(401).json({ error: 'Authentication required' })
    }

    const payload = verifyAccessToken(token)
    const session = await prisma.session.findUnique({ where: { tokenHash: hashToken(token) } })
    if (!session || session.expiresAt < new Date()) {
      return res.status(401).json({ error: 'Session expired' })
    }

    const user = await loadAuthUser(payload.sub)
    if (!user) {
      return res.status(401).json({ error: 'User not found or inactive' })
    }

    req.user = user
    next()
  } catch {
    return res.status(401).json({ error: 'Invalid token' })
  }
}

export function requirePermission(...permissions: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = req.user
    if (!user) return res.status(401).json({ error: 'Authentication required' })
    if (user.roleCode === RoleCode.CRM_ADMIN) return next()
    const ok = permissions.some((p) => user.permissions.includes(p))
    if (!ok) return res.status(403).json({ error: 'Forbidden' })
    next()
  }
}

export function requireRoles(...roles: RoleCode[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = req.user
    if (!user) return res.status(401).json({ error: 'Authentication required' })
    if (!roles.includes(user.roleCode)) {
      return res.status(403).json({ error: 'Forbidden' })
    }
    next()
  }
}
