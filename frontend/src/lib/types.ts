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
  roleCode: RoleCode
  companyId: string | null
  timezone: string
  permissions: string[]
}

export type Company = {
  id: string
  name: string
  website?: string | null
  businessCategory?: string | null
  addressLine1?: string | null
  city?: string | null
  state?: string | null
  country?: string | null
  leadStatus?: string
  leadSource?: string | null
  notes?: string | null
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
  activityType: string
  purpose: string
  customPurpose?: string | null
  scheduledAt: string
  status: string
  priority: string
  notes?: string | null
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
  visitedAt: string
  location?: string | null
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
  title: string
  description: string
  status: string
  priority: string
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
  role: { code: RoleCode; name: string }
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
    companyName?: string
    firstName?: string
    lastName?: string
    jobTitle?: string
    email?: string
    mobile?: string
    phone?: string
    website?: string
    address?: string
    linkedinUrl?: string
    twitterUrl?: string
    confidence?: Record<string, number>
  }
  mode?: string
  duplicates: Company[]
}
