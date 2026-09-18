import { Prisma } from '@prisma/client'
import { Request } from 'express'

/** Express 5 types `req.params` values as `string | string[]`. */
export function param(req: Request, name: string): string {
  const value = req.params[name]
  if (Array.isArray(value)) return value[0] || ''
  return value || ''
}

export function asJson(value: unknown): Prisma.InputJsonValue | undefined {
  if (value == null) return undefined
  return value as Prisma.InputJsonValue
}
