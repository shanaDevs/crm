import 'dotenv/config'
import { processDueReminders } from './services/reminders'

async function main() {
  const n = await processDueReminders()
  console.log(`Processed ${n} reminder jobs`)
  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
