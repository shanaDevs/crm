import 'dotenv/config'
import { PrismaClient, OpportunityStageCode } from '@prisma/client'
import bcrypt from 'bcryptjs'
import { ensureRbacDefaults } from '../src/services/rbac'

const prisma = new PrismaClient()

async function main() {
  await ensureRbacDefaults(prisma)

  const stages: Array<{
    code: OpportunityStageCode
    name: string
    sortOrder: number
    isWon?: boolean
    isLost?: boolean
  }> = [
    { code: OpportunityStageCode.NEW, name: 'New', sortOrder: 1 },
    { code: OpportunityStageCode.CONTACTED, name: 'Contacted', sortOrder: 2 },
    { code: OpportunityStageCode.QUALIFIED, name: 'Qualified', sortOrder: 3 },
    { code: OpportunityStageCode.DEMO_SCHEDULED, name: 'Demo Scheduled', sortOrder: 4 },
    { code: OpportunityStageCode.PROPOSAL_SENT, name: 'Proposal Sent', sortOrder: 5 },
    { code: OpportunityStageCode.NEGOTIATION, name: 'Negotiation', sortOrder: 6 },
    { code: OpportunityStageCode.WON, name: 'Won', sortOrder: 7, isWon: true },
    { code: OpportunityStageCode.LOST, name: 'Lost', sortOrder: 8, isLost: true },
  ]
  for (const s of stages) {
    await prisma.opportunityStage.upsert({
      where: { code: s.code },
      create: s,
      update: {
        name: s.name,
        sortOrder: s.sortOrder,
        isWon: s.isWon ?? false,
        isLost: s.isLost ?? false,
      },
    })
  }

  const passwordHash = await bcrypt.hash('Password123!', 10)
  const roles = await prisma.role.findMany({ where: { isSystem: true } })
  const byName = Object.fromEntries(roles.map((r) => [r.name, r.id]))

  const users = [
    { email: 'admin@crmtool.local', firstName: 'Alex', lastName: 'Admin', roleId: byName['CRM Admin'] },
    { email: 'sales@crmtool.local', firstName: 'Sam', lastName: 'Sales', roleId: byName['Sales Executive'] },
    { email: 'manager@crmtool.local', firstName: 'Ivy', lastName: 'Manager', roleId: byName['IT Manager'] },
    {
      email: 'marketing@crmtool.local',
      firstName: 'Morgan',
      lastName: 'Officer',
      roleId: byName['Marketing Officer'],
    },
    { email: 'dev@crmtool.local', firstName: 'Dana', lastName: 'Developer', roleId: byName['Developer'] },
  ]

  for (const u of users) {
    const user = await prisma.user.upsert({
      where: { email: u.email },
      create: { ...u, passwordHash, timezone: 'Asia/Colombo' },
      update: { firstName: u.firstName, lastName: u.lastName, roleId: u.roleId },
    })
    await prisma.notificationPreference.upsert({
      where: { userId: user.id },
      create: { userId: user.id },
      update: {},
    })
  }

  const admin = await prisma.user.findUnique({ where: { email: 'admin@crmtool.local' } })
  const products = [
    { name: 'POS System', description: 'Point of sale for retail and restaurants', category: 'Retail' },
    { name: 'HR System', description: 'Human resources and payroll', category: 'HR' },
    { name: 'Inventory Suite', description: 'Warehouse and stock management', category: 'Operations' },
  ]
  for (const p of products) {
    const existing = await prisma.product.findFirst({ where: { name: p.name } })
    if (!existing) {
      await prisma.product.create({ data: { ...p, managerId: admin?.id } })
    }
  }

  await prisma.systemSetting.upsert({
    where: { key: 'card_scan' },
    create: {
      key: 'card_scan',
      value: {
        enabled: true,
        allowedFormats: ['image/jpeg', 'image/png', 'image/webp'],
        maxUploadMb: 8,
        frontBackSupport: true,
        duplicateRules: ['email', 'mobile', 'companyName'],
      },
    },
    update: {},
  })

  await prisma.systemSetting.upsert({
    where: { key: 'crm_defaults' },
    create: {
      key: 'crm_defaults',
      value: {
        companyTimezone: 'Asia/Colombo',
        workingHours: { start: '09:00', end: '18:00' },
        reminderMinutesDefault: 15,
      },
    },
    update: {},
  })

  console.log('Seed complete')
  console.log('Demo logins (password: Password123!):')
  console.log('  admin@crmtool.local')
  console.log('  sales@crmtool.local')
  console.log('  manager@crmtool.local')
  console.log('  marketing@crmtool.local')
  console.log('  dev@crmtool.local')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
