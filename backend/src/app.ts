import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import morgan from 'morgan'
import cookieParser from 'cookie-parser'
import authRoutes from './routes/auth'
import customersRoutes from './routes/customers'
import cardsRoutes from './routes/cards'
import followUpsRoutes from './routes/followUps'
import visitsRoutes from './routes/visits'
import { productsRouter, opportunitiesRouter } from './routes/products'
import requirementsRoutes from './routes/requirements'
import ticketsRoutes from './routes/tickets'
import {
  notificationsRouter,
  dashboardRouter,
  teamRouter,
  settingsRouter,
  filesRouter,
} from './routes/misc'
import { prisma } from './lib/prisma'
import { requireAuth, requirePermission } from './middleware/auth'

export function createApp() {
  const app = express()

  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }))
  app.use(
    cors({
      origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
      credentials: true,
    })
  )
  app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'))
  app.use(express.json({ limit: '2mb' }))
  app.use(express.urlencoded({ extended: true }))
  app.use(cookieParser())

  app.get('/health', (_req, res) => res.json({ ok: true, service: 'crmtool-backend' }))

  app.use('/api/auth', authRoutes)
  app.use('/api/customers', customersRoutes)
  app.use('/api/cards', cardsRoutes)
  app.use('/api/follow-ups', followUpsRoutes)
  app.use('/api/visits', visitsRoutes)
  app.use('/api/products', productsRouter)
  app.use('/api/opportunities', opportunitiesRouter)
  app.use('/api/requirements', requirementsRoutes)
  app.use('/api/tickets', ticketsRoutes)
  app.use('/api/notifications', notificationsRouter)
  app.use('/api/dashboard', dashboardRouter)
  app.use('/api/team', teamRouter)
  app.use('/api/settings', settingsRouter)
  app.use('/api/files', filesRouter)

  app.get('/api/reports/summary', requireAuth, requirePermission('reports.read'), async (_req, res) => {
    const [companies, won, lost, completedFollowUps, openTickets, completedReqs] = await Promise.all([
      prisma.company.count(),
      prisma.opportunity.count({ where: { stage: { isWon: true } } }),
      prisma.opportunity.count({ where: { stage: { isLost: true } } }),
      prisma.followUp.count({ where: { status: 'COMPLETED' } }),
      prisma.ticket.count({ where: { status: { in: ['OPEN', 'IN_PROGRESS'] } } }),
      prisma.requirement.count({ where: { status: 'COMPLETED' } }),
    ])
    return res.json({
      companies,
      opportunitiesWon: won,
      opportunitiesLost: lost,
      completedFollowUps,
      openTickets,
      completedRequirements: completedReqs,
      conversionRate: won + lost > 0 ? Number(((won / (won + lost)) * 100).toFixed(1)) : 0,
    })
  })

  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error(err)
    if (err instanceof Error && err.message === 'Unsupported image format') {
      return res.status(400).json({ error: err.message })
    }
    return res.status(500).json({ error: 'Internal server error' })
  })

  return app
}
