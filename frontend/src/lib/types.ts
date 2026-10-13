export type RoleCode =
  | 'CRM_ADMIN'
  | 'IT_MANAGER'
  | 'MARKETING_OFFICER'
  | 'DEVELOPER'
  | 'CUSTOMER'

export type AuthUser = {
  id: string
  email: string
  firstName: string
  lastName: string
  phone: string | null
  roleCode: RoleCode
  roleId: string
  roleName: string
  companyId: string | null
  timezone: string
  permissions: string[]
}

export type CustomerLevel = {
  id: string
  name: string
  color: string
  sortOrder: number
  _count?: { companies: number }
}

export type BusinessCard = {
  id: string
  frontImageKey: string
  backImageKey?: string | null
  extractedData?: Record<string, unknown> | null
  reviewed: boolean
  createdAt: string
}

export type PermissionInfo = {
  code: string
  name: string
  group: string
  grantable: boolean
}

export type Role = {
  id: string
  name: string
  code: RoleCode
  description?: string | null
  isSystem: boolean
  userCount: number
  permissions: string[]
}

export type PermissionOverride = { code: string; granted: boolean }

export type ManagedUser = {
  id: string
  email: string
  firstName: string
  lastName: string
  phone?: string | null
  timezone: string
  isActive: boolean
  role: { id: string; code: RoleCode; name: string; isSystem: boolean }
  rolePermissions: string[]
  overrides: PermissionOverride[]
  permissions: string[]
}

export type Company = {
  id: string
  name: string
  website?: string | null
  businessCategory?: string | null
  addressLine1?: string | null
  addressLine2?: string | null
  city?: string | null
  state?: string | null
  postalCode?: string | null
  country?: string | null
  leadStatus?: string
  leadSource?: string | null
  notes?: string | null
  levelId?: string | null
  level?: CustomerLevel | null
  businessCards?: BusinessCard[]
  assignedOfficer?: { id: string; firstName: string; lastName: string } | null
  contacts?: Contact[]
  interestedProducts?: { product: Product }[]
  _count?: { followUps: number; opportunities: number; tickets: number }
  visits?: Visit[]
  followUps?: FollowUp[]
  opportunities?: Opportunity[]
  requirements?: Requirement[]
  tickets?: Ticket[]
  updatedAt?: string
  createdAt?: string
}

export type Contact = {
  id: string
  firstName: string
  lastName: string
  jobTitle?: string | null
  email?: string | null
  mobile?: string | null
  phone?: string | null
  website?: string | null
  isPrimary?: boolean
}

export type Product = {
  id: string
  name: string
  description?: string | null
  category?: string | null
  isActive?: boolean
  manager?: { id: string; firstName: string; lastName: string } | null
  _count?: { opportunities: number; requirements: number; tickets: number }
}

export type FollowUp = {
  id: string
  companyId?: string
  contactId?: string | null
  assigneeId?: string
  reminderMinutes?: number
  timezone?: string
  activityType: string
  purpose: string
  customPurpose?: string | null
  scheduledAt: string
  status: string
  priority: string
  notes?: string | null
  smsCustomer?: boolean
  smsAssignee?: boolean
  company?: Company
  contact?: Contact | null
  product?: Product | null
  assignee?: { id: string; firstName: string; lastName: string } | null
  callLogs?: CallLog[]
}

export type CallLog = {
  id: string
  outcome: string
  notes?: string | null
  durationSec?: number | null
  loggedAt: string
}

export type Visit = {
  id: string
  companyId?: string
  contactId?: string | null
  visitedAt: string
  location?: string | null
  latitude?: number | null
  longitude?: number | null
  notes?: string | null
  nextAction?: string | null
  company?: Company
  contact?: Contact | null
  createdBy?: { id: string; firstName: string; lastName: string }
}

export type OpportunityStage = {
  id: string
  code: string
  name: string
  sortOrder: number
  isWon?: boolean
  isLost?: boolean
}

export type Opportunity = {
  id: string
  companyId?: string
  productId?: string
  title: string
  value?: number | null
  currency?: string
  notes?: string | null
  expectedCloseDate?: string | null
  company?: Company
  product?: Product
  stage?: OpportunityStage
  owner?: { id: string; firstName: string; lastName: string } | null
}

export type Requirement = {
  id: string
  companyId?: string
  productId?: string
  title: string
  description: string
  status: string
  priority: string
  acceptanceCriteria?: string | null
  requestedDeliveryDate?: string | null
  businessProblem?: string | null
  expectedResult?: string | null
  category?: string | null
  company?: Company
  product?: Product
  manager?: { id: string; firstName: string; lastName: string } | null
  assignments?: {
    id: string
    userId: string
    unassignedAt?: string | null
    user?: { id: string; firstName: string; lastName: string }
  }[]
  comments?: Comment[]
  contact?: Contact | null
}

export type Ticket = {
  id: string
  companyId?: string
  productId?: string
  ticketNumber: string
  title: string
  description: string
  type: string
  status: string
  priority: string
  dueDate?: string | null
  company?: Company
  product?: Product
  assignee?: { id: string; firstName: string; lastName: string } | null
  comments?: Comment[]
  contact?: Contact | null
}

export type Comment = {
  id: string
  body: string
  visibility: string
  createdAt: string
  author?: { id: string; firstName: string; lastName: string }
}

export type NotificationItem = {
  id: string
  title: string
  body?: string | null
  linkUrl?: string | null
  isRead: boolean
  createdAt: string
}

export type TeamMember = {
  id: string
  email: string
  firstName: string
  lastName: string
  phone?: string | null
  isActive: boolean
  role: { id: string; code: RoleCode; name: string }
  _count?: {
    followUpsAssigned: number
    ticketsAssigned: number
    requirementAssignments: number
  }
}

export type DashboardData = {
  todayCalls: FollowUp[]
  overdueCount: number
  newLeadsCount: number
  myRequirements: Requirement[]
  myTickets: Ticket[]
  unreadNotifications: number
}

export type CardScanResult = {
  cardId: string
  frontImageKey: string
  backImageKey?: string
  extraction: {
    contactName?: string | null
    companyName?: string | null
    jobTitle?: string | null
    email?: string | null
    mobile?: string | null
    phone?: string | null
    website?: string | null
    address?: string | null
    socialProfiles?: {
      linkedin?: string | null
      twitter?: string | null
      other?: string | null
    } | null
    suggestedBusinessCategory?: string | null
    confidence?: Record<string, number>
  }
  mode?: string
  duplicates: Company[]
}
