import 'dotenv/config'
import { PrismaClient, RoleCode, OpportunityStageCode } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

const PERMISSIONS = [
  ['dashboard.read', 'View dashboard'],
  ['customers.read', 'View customers'],
  ['customers.write', 'Create/update customers'],
  ['visits.read', 'View visits'],
  ['visits.write', 'Record visits'],
  ['followups.read', 'View follow-ups'],
  ['followups.write', 'Manage follow-ups'],
  ['products.read', 'View products'],
  ['products.write', 'Manage products'],
  ['opportunities.read', 'View opportunities'],
  ['opportunities.write', 'Manage opportunities'],
  ['requirements.read', 'View requirements'],
  ['requirements.write', 'Submit requirements'],
  ['requirements.manage', 'Approve/assign requirements'],
  ['tickets.read', 'View tickets'],
  ['tickets.write', 'Create/update tickets'],
  ['tickets.manage', 'Assign tickets'],
  ['team.read', 'View team'],
  ['team.write', 'Manage team'],
  ['settings.read', 'View settings'],
  ['settings.write', 'Change settings'],
  ['reports.read', 'View reports'],
  ['files.read', 'Download files'],
  ['notifications.read', 'View notifications'],
] as const

const ROLE_PERMS: Record<RoleCode, string[]> = {
  CRM_ADMIN: PERMISSIONS.map(([c]) => c),
  IT_MANAGER: [
    'dashboard.read',
    'customers.read',
    'products.read',
    'opportunities.read',
    'requirements.read',
    'requirements.write',
    'requirements.manage',
    'tickets.read',
    'tickets.write',
    'tickets.manage',
    'team.read',
    'reports.read',
    'files.read',
    'notifications.read',
    'followups.read',
  ],
  MARKETING_OFFICER: [
    'dashboard.read',
    'customers.read',
    'customers.write',
    'visits.read',
    'visits.write',
    'followups.read',
    'followups.write',
    'products.read',
    'opportunities.read',
    'opportunities.write',
    'requirements.read',
    'requirements.write',
    'tickets.read',
    'tickets.write',
    'files.read',
    'notifications.read',
    'reports.read',
  ],
  DEVELOPER: [
    'dashboard.read',
    'requirements.read',
    'requirements.write',
    'tickets.read',
    'tickets.write',
    'products.read',
    'files.read',
    'notifications.read',
  ],
  CUSTOMER: [
    'dashboard.read',
    'customers.read',
    'requirements.read',
    'requirements.write',
    'tickets.read',
    'tickets.write',
    'files.read',
    'notifications.read',
  ],
}

async function main() {
  for (const [code, name] of PERMISSIONS) {
    await prisma.permission.upsert({
      where: { code },
      create: { code, name, description: name },
      update: { name },
    })
  }

  const roleDefs: Array<{ code: RoleCode; name: string }> = [
    { code: RoleCode.CRM_ADMIN, name: 'CRM Admin' },
    { code: RoleCode.IT_MANAGER, name: 'IT Manager' },
    { code: RoleCode.MARKETING_OFFICER, name: 'Marketing Officer' },
    { code: RoleCode.DEVELOPER, name: 'Developer' },
    { code: RoleCode.CUSTOMER, name: 'Customer' },
  ]

  for (const r of roleDefs) {
    const role = await prisma.role.upsert({
      where: { code: r.code },
      create: { code: r.code, name: r.name },
      update: { name: r.name },
    })
    const perms = await prisma.permission.findMany({
      where: { code: { in: ROLE_PERMS[r.code] } },
    })
    for (const p of perms) {
      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: role.id, permissionId: p.id } },
        create: { roleId: role.id, permissionId: p.id },
        update: {},
      })
    }
  }

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
  const roles = await prisma.role.findMany()
  const byCode = Object.fromEntries(roles.map((r) => [r.code, r.id]))

  const users = [
    { email: 'admin@crmtool.local', firstName: 'Alex', lastName: 'Admin', roleId: byCode.CRM_ADMIN },
    { email: 'manager@crmtool.local', firstName: 'Ivy', lastName: 'Manager', roleId: byCode.IT_MANAGER },
    {
      email: 'marketing@crmtool.local',
      firstName: 'Morgan',
      lastName: 'Officer',
      roleId: byCode.MARKETING_OFFICER,
    },
    { email: 'dev@crmtool.local', firstName: 'Dana', lastName: 'Developer', roleId: byCode.DEVELOPER },
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
