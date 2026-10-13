import 'dotenv/config'
import { createApp } from './app'
import { prisma } from './lib/prisma'
import { startReminderLoop } from './services/reminders'
import { ensureRbacDefaults } from './services/rbac'

const port = Number(process.env.PORT || 4000)
const app = createApp()

ensureRbacDefaults(prisma).catch((err) => console.error('Failed to ensure roles/permissions defaults', err))

app.listen(port, () => {
  console.log(`CRM backend listening on http://localhost:${port}`)
})

startReminderLoop(30_000)
