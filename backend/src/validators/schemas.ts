import { z } from 'zod'

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
})

export const opportunityPlanSchema = z.object({
  productId: z.string().min(1),
  title: z.string().min(1),
  stageCode: z.string().trim().min(1).default('NEW').optional(),
  value: z.number().optional().nullable(),
  currency: z.string().optional(),
  expectedCloseDate: z.string().datetime().optional().nullable(),
  notes: z.string().optional().nullable(),
})

export const companyCreateSchema = z.object({
  name: z.string().min(1),
  website: z.string().optional().nullable(),
  businessCategory: z.string().optional().nullable(),
  addressLine1: z.string().optional().nullable(),
  city: z.string().optional().nullable(),
  state: z.string().optional().nullable(),
  postalCode: z.string().optional().nullable(),
  country: z.string().optional().nullable(),
  leadSource: z.string().optional().nullable(),
  leadStatus: z.enum(['NEW', 'CONTACTED', 'QUALIFIED', 'NURTURING', 'CONVERTED', 'LOST']).optional(),
  preferredContactMethod: z.enum(['CALL', 'EMAIL', 'WHATSAPP', 'SMS', 'IN_PERSON']).optional().nullable(),
  callingHoursStart: z.string().optional().nullable(),
  callingHoursEnd: z.string().optional().nullable(),
  timezone: z.string().optional(),
  tags: z.array(z.string()).optional(),
  notes: z.string().optional().nullable(),
  assignedOfficerId: z.string().optional().nullable(),
  levelId: z.string().optional().nullable(),
  interestedProductIds: z.array(z.string()).optional(),
  opportunity: opportunityPlanSchema.optional().nullable(),
  contact: z
    .object({
      firstName: z.string().min(1),
      lastName: z.string().min(1),
      jobTitle: z.string().optional().nullable(),
      email: z.string().email().optional().nullable().or(z.literal('')),
      mobile: z.string().optional().nullable(),
      phone: z.string().optional().nullable(),
      website: z.string().optional().nullable(),
      linkedinUrl: z.string().optional().nullable(),
      twitterUrl: z.string().optional().nullable(),
      isPrimary: z.boolean().optional(),
    })
    .optional(),
})

const optionalText = z.string().trim().optional().nullable()

export const companyUpdateSchema = z.object({
  name: z.string().trim().min(1).optional(),
  website: optionalText,
  businessCategory: optionalText,
  addressLine1: optionalText,
  addressLine2: optionalText,
  city: optionalText,
  state: optionalText,
  postalCode: optionalText,
  country: optionalText,
  leadSource: optionalText,
  leadStatus: z.enum(['NEW', 'CONTACTED', 'QUALIFIED', 'NURTURING', 'CONVERTED', 'LOST']).optional(),
  preferredContactMethod: z.enum(['CALL', 'EMAIL', 'WHATSAPP', 'SMS', 'IN_PERSON']).optional().nullable(),
  callingHoursStart: optionalText,
  callingHoursEnd: optionalText,
  timezone: z.string().trim().min(1).optional(),
  tags: z.array(z.string()).optional(),
  notes: optionalText,
  assignedOfficerId: z.string().optional().nullable(),
  levelId: z.string().optional().nullable(),
  primaryContact: z
    .object({
      firstName: z.string().trim().optional(),
      lastName: z.string().trim().optional(),
      jobTitle: optionalText,
      email: z.string().trim().email().optional().nullable().or(z.literal('')),
      mobile: optionalText,
      phone: optionalText,
    })
    .optional(),
})

export const followUpCreateSchema = z.object({
  companyId: z.string(),
  contactId: z.string().optional().nullable(),
  productId: z.string().optional().nullable(),
  visitId: z.string().optional().nullable(),
  activityType: z.enum(['CALL', 'VISIT', 'DEMO', 'MEETING', 'FOLLOW_UP']),
  purpose: z.enum(['INTRODUCTION', 'QUOTATION', 'REQUIREMENTS', 'PAYMENT', 'SUPPORT', 'CUSTOM']),
  customPurpose: z.string().optional().nullable(),
  scheduledAt: z.string().datetime(),
  timezone: z.string().default('UTC'),
  reminderMinutes: z.number().int().min(0).default(15),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).default('MEDIUM'),
  notes: z.string().optional().nullable(),
  assigneeId: z.string(),
  smsCustomer: z.boolean().default(false),
  smsAssignee: z.boolean().default(false),
})

/** Follow-up scheduled while registering a customer; company, contact and assignee are filled in by the server. */
export const followUpPlanSchema = followUpCreateSchema
  .omit({ companyId: true, contactId: true, visitId: true, assigneeId: true })
  .extend({ purpose: followUpCreateSchema.shape.purpose.default('INTRODUCTION') })
  .refine((v) => new Date(v.scheduledAt).getTime() > Date.now() - 60_000, {
    message: 'Follow-up time must be in the future',
    path: ['scheduledAt'],
  })

export const callLogSchema = z.object({
  outcome: z.enum([
    'CONNECTED',
    'NO_ANSWER',
    'BUSY',
    'WRONG_NUMBER',
    'INTERESTED',
    'NOT_INTERESTED',
    'REQUESTED_ANOTHER_CALL',
    'DEMO_BOOKED',
    'MEETING_BOOKED',
  ]),
  notes: z.string().optional().nullable(),
  durationSec: z.number().int().optional().nullable(),
  scheduleNext: followUpCreateSchema.optional(),
})

export const requirementCreateSchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
  companyId: z.string(),
  contactId: z.string().optional().nullable(),
  productId: z.string(),
  businessProblem: z.string().optional().nullable(),
  expectedResult: z.string().optional().nullable(),
  category: z.string().optional().nullable(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).default('MEDIUM'),
  acceptanceCriteria: z.string().optional().nullable(),
  requestedDeliveryDate: z.string().datetime().optional().nullable(),
})

export const ticketCreateSchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
  companyId: z.string(),
  contactId: z.string().optional().nullable(),
  productId: z.string(),
  requirementId: z.string().optional().nullable(),
  type: z.enum(['BUG', 'SUPPORT', 'TASK', 'CHANGE_REQUEST']),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).default('MEDIUM'),
  dueDate: z.string().datetime().optional().nullable(),
  assigneeId: z.string().optional().nullable(),
})

export const opportunityCreateSchema = z.object({
  companyId: z.string(),
  productId: z.string(),
  title: z.string().min(1),
  stageCode: z.string().trim().min(1).default('NEW'),
  value: z.number().optional().nullable(),
  currency: z.string().optional(),
  expectedCloseDate: z.string().datetime().optional().nullable(),
  notes: z.string().optional().nullable(),
  ownerId: z.string().optional().nullable(),
})

export const opportunityStageCreateSchema = z.object({
  name: z.string().trim().min(1),
  code: z.string().trim().min(1).optional(),
  sortOrder: z.number().int().optional(),
  isWon: z.boolean().optional(),
  isLost: z.boolean().optional(),
})

export const opportunityStageUpdateSchema = z.object({
  name: z.string().trim().min(1).optional(),
  sortOrder: z.number().int().optional(),
  isWon: z.boolean().optional(),
  isLost: z.boolean().optional(),
})

export const visitCreateSchema = z.object({
  companyId: z.string(),
  contactId: z.string().optional().nullable(),
  visitedAt: z.string().datetime(),
  location: z.string().optional().nullable(),
  latitude: z.number().min(-90).max(90).optional().nullable(),
  longitude: z.number().min(-180).max(180).optional().nullable(),
  saveAsCompanyAddress: z.boolean().optional(),
  notes: z.string().optional().nullable(),
  nextAction: z.string().optional().nullable(),
})

export const productCreateSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional().nullable(),
  category: z.string().optional().nullable(),
  isActive: z.boolean().optional(),
  managerId: z.string().optional().nullable(),
  teamMemberIds: z.array(z.string()).optional(),
})

// Update schemas list every field explicitly: zod 4 applies `.default()` even inside `.partial()`,
// which would silently reset omitted fields such as priority.
const priorityEnum = z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT'])
const nullableText = z.string().trim().optional().nullable()
const nullableDate = z.string().datetime().optional().nullable()

export const productUpdateSchema = z.object({
  name: z.string().trim().min(1).optional(),
  description: nullableText,
  category: nullableText,
  isActive: z.boolean().optional(),
  managerId: z.string().optional().nullable(),
})

export const opportunityUpdateSchema = z.object({
  companyId: z.string().optional(),
  productId: z.string().optional(),
  title: z.string().trim().min(1).optional(),
  stageCode: opportunityCreateSchema.shape.stageCode.unwrap().optional(),
  value: z.number().optional().nullable(),
  currency: z.string().trim().min(1).optional(),
  expectedCloseDate: nullableDate,
  notes: nullableText,
  ownerId: z.string().optional(),
})

export const requirementUpdateSchema = z.object({
  title: z.string().trim().min(1).optional(),
  description: z.string().trim().min(1).optional(),
  productId: z.string().optional(),
  contactId: z.string().optional().nullable(),
  businessProblem: nullableText,
  expectedResult: nullableText,
  category: nullableText,
  priority: priorityEnum.optional(),
  acceptanceCriteria: nullableText,
  requestedDeliveryDate: nullableDate,
})

export const ticketUpdateSchema = z.object({
  title: z.string().trim().min(1).optional(),
  description: z.string().trim().min(1).optional(),
  productId: z.string().optional(),
  contactId: z.string().optional().nullable(),
  type: ticketCreateSchema.shape.type.optional(),
  priority: priorityEnum.optional(),
  dueDate: nullableDate,
  assigneeId: z.string().optional().nullable(),
})

export const visitUpdateSchema = z.object({
  companyId: z.string().optional(),
  contactId: z.string().optional().nullable(),
  visitedAt: z.string().datetime().optional(),
  location: nullableText,
  latitude: z.number().min(-90).max(90).optional().nullable(),
  longitude: z.number().min(-180).max(180).optional().nullable(),
  saveAsCompanyAddress: z.boolean().optional(),
  notes: nullableText,
  nextAction: nullableText,
})

export const followUpUpdateSchema = z.object({
  contactId: z.string().optional().nullable(),
  productId: z.string().optional().nullable(),
  activityType: followUpCreateSchema.shape.activityType.optional(),
  purpose: followUpCreateSchema.shape.purpose.optional(),
  customPurpose: nullableText,
  scheduledAt: z.string().datetime().optional(),
  timezone: z.string().optional(),
  reminderMinutes: z.number().int().min(0).optional(),
  priority: priorityEnum.optional(),
  status: z.enum(['SCHEDULED', 'COMPLETED', 'CANCELLED']).optional(),
  notes: nullableText,
  assigneeId: z.string().optional(),
  smsCustomer: z.boolean().optional(),
  smsAssignee: z.boolean().optional(),
})

export const contactSchema = z.object({
  firstName: z.string().trim().min(1, 'Name is required'),
  lastName: z.string().trim().optional().default(''),
  jobTitle: nullableText,
  email: z.string().trim().email().optional().nullable().or(z.literal('')),
  mobile: nullableText,
  phone: nullableText,
  isPrimary: z.boolean().optional(),
})
