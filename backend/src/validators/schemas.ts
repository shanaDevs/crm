import { z } from 'zod'

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
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
  interestedProductIds: z.array(z.string()).optional(),
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
  stageCode: z
    .enum(['NEW', 'CONTACTED', 'QUALIFIED', 'DEMO_SCHEDULED', 'PROPOSAL_SENT', 'NEGOTIATION', 'WON', 'LOST'])
    .default('NEW'),
  value: z.number().optional().nullable(),
  currency: z.string().optional(),
  expectedCloseDate: z.string().datetime().optional().nullable(),
  notes: z.string().optional().nullable(),
  ownerId: z.string().optional().nullable(),
})

export const visitCreateSchema = z.object({
  companyId: z.string(),
  contactId: z.string().optional().nullable(),
  visitedAt: z.string().datetime(),
  location: z.string().optional().nullable(),
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
