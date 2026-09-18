import 'dotenv/config'
import { createApp } from './app'
import { startReminderLoop } from './services/reminders'

const port = Number(process.env.PORT || 4000)
const app = createApp()

app.listen(port, () => {
  console.log(`CRM backend listening on http://localhost:${port}`)
})

startReminderLoop(30_000)
