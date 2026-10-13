import { Router } from 'express'
import multer from 'multer'
import { prisma } from '../lib/prisma'
import { requireAuth, requirePermission } from '../middleware/auth'
import { extractBusinessCard } from '../services/aiCard'
import { savePrivateJson, uploadPrivateFile } from '../services/storage'
import { param, asJson } from '../lib/http'
import { createFollowUp, parseFollowUpPlan } from '../services/followUps'

const router = Router()
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: Number(process.env.MAX_UPLOAD_BYTES || 8 * 1024 * 1024) },
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
    if (allowed.includes(file.mimetype)) cb(null, true)
    else cb(new Error('Unsupported image format'))
  },
})

router.use(requireAuth)

router.post(
  '/scan',
  requirePermission('customers.write'),
  upload.fields([
    { name: 'front', maxCount: 1 },
    { name: 'back', maxCount: 1 },
  ]),
  async (req, res) => {
    const files = req.files as { front?: Express.Multer.File[]; back?: Express.Multer.File[] }
    const front = files?.front?.[0]
    if (!front) return res.status(400).json({ error: 'Front card image is required' })

    const frontUpload = await uploadPrivateFile(front.buffer, front.originalname, front.mimetype, 'cards')
    let backKey: string | undefined
    const back = files?.back?.[0]
    if (back) {
      const backUpload = await uploadPrivateFile(back.buffer, back.originalname, back.mimetype, 'cards')
      backKey = backUpload.key
    }

    const base64 = front.buffer.toString('base64')
    let extraction
    try {
      extraction = await extractBusinessCard(base64, front.mimetype)
    } catch (err) {
      return res.status(502).json({
        error: 'AI extraction failed',
        detail: err instanceof Error ? err.message : 'Unknown error',
        frontImageKey: frontUpload.key,
        backImageKey: backKey,
      })
    }

    const card = await prisma.businessCard.create({
      data: {
        frontImageKey: frontUpload.key,
        backImageKey: backKey,
        extractedData: extraction.data,
        confidenceMap: extraction.data.confidence || {},
        rawAiResponse: asJson(extraction.raw),
        reviewed: false,
        createdById: req.user!.id,
      },
    })

    await saveCardRecord(card.id, {
      cardId: card.id,
      status: 'scanned',
      scannedAt: card.createdAt,
      scannedById: req.user!.id,
      frontImageKey: frontUpload.key,
      backImageKey: backKey ?? null,
      aiMode: extraction.mode,
      extraction: extraction.data,
    })

    // Duplicate detection hints
    const email = extraction.data.email
    const mobile = extraction.data.mobile
    const companyName = extraction.data.companyName
    const or: object[] = []
    if (email) or.push({ contacts: { some: { email: { equals: email, mode: 'insensitive' } } } })
    if (mobile) or.push({ contacts: { some: { mobile: { contains: mobile } } } })
    if (companyName) or.push({ name: { equals: companyName, mode: 'insensitive' } })
    const duplicates = or.length
      ? await prisma.company.findMany({ where: { OR: or }, include: { contacts: true }, take: 10 })
      : []

    return res.json({
      cardId: card.id,
      frontImageKey: frontUpload.key,
      backImageKey: backKey,
      extraction: extraction.data,
      mode: extraction.mode,
      duplicates,
    })
  }
)

router.post('/confirm', requirePermission('customers.write'), async (req, res) => {
  const {
    cardId,
    company,
    contact,
    interestedProductIds,
    linkCompanyId,
  } = req.body as {
    cardId: string
    company: {
      name: string
      website?: string
      businessCategory?: string
      addressLine1?: string
      leadSource?: string
      timezone?: string
      notes?: string
    }
    contact?: {
      name?: string
      firstName?: string
      lastName?: string
      jobTitle?: string
      email?: string
      mobile?: string
      phone?: string
      website?: string
      linkedinUrl?: string
      twitterUrl?: string
    }
    interestedProductIds?: string[]
    linkCompanyId?: string
  }

  if (!cardId || !company?.name) {
    return res.status(400).json({ error: 'cardId and company.name are required' })
  }

  const card = await prisma.businessCard.findUnique({ where: { id: cardId } })
  if (!card) return res.status(404).json({ error: 'Card not found' })

  const plan = parseFollowUpPlan(req.body.followUp, req.user!)
  if (!plan.ok) return res.status(plan.status).json({ error: plan.error })
  const scheduleFollowUp = (savedCompanyId: string, savedContactId: string | null) =>
    plan.value
      ? createFollowUp(
          { ...plan.value, companyId: savedCompanyId, contactId: savedContactId, assigneeId: req.user!.id },
          req.user!.id
        )
      : null

  const contactData = buildContactData(contact)
  const saveConfirmedRecord = (savedCompanyId: string, savedContactId: string | null) =>
    saveCardRecord(cardId, {
      cardId,
      status: 'confirmed',
      scannedAt: card.createdAt,
      scannedById: card.createdById,
      confirmedAt: new Date(),
      confirmedById: req.user!.id,
      frontImageKey: card.frontImageKey,
      backImageKey: card.backImageKey,
      extraction: card.extractedData,
      companyId: savedCompanyId,
      contactId: savedContactId,
      linkedToExistingCompany: Boolean(linkCompanyId),
      company,
      contact: contactData,
      interestedProductIds: interestedProductIds ?? [],
    })

  let companyId = linkCompanyId
  if (!companyId) {
    const created = await prisma.company.create({
      data: {
        name: company.name,
        website: company.website,
        businessCategory: company.businessCategory,
        addressLine1: company.addressLine1,
        leadSource: company.leadSource || 'Business Card',
        timezone: company.timezone || 'UTC',
        notes: company.notes,
        assignedOfficerId: req.user!.id,
        contacts: contactData ? { create: { ...contactData, isPrimary: true } } : undefined,
        interestedProducts: interestedProductIds?.length
          ? { create: interestedProductIds.map((productId) => ({ productId })) }
          : undefined,
      },
      include: { contacts: true },
    })
    companyId = created.id
    await prisma.businessCard.update({
      where: { id: cardId },
      data: {
        companyId: created.id,
        contactId: created.contacts[0]?.id,
        reviewed: true,
      },
    })
    await saveConfirmedRecord(created.id, created.contacts[0]?.id ?? null)
    const followUp = await scheduleFollowUp(created.id, created.contacts[0]?.id ?? null)
    return res.status(201).json({ ...created, followUp })
  }

  const existing = await prisma.company.findUnique({ where: { id: companyId } })
  if (!existing) return res.status(404).json({ error: 'Company not found' })

  const newContact = contactData
    ? await prisma.contact.create({ data: { ...contactData, companyId, isPrimary: false } })
    : null
  await prisma.businessCard.update({
    where: { id: cardId },
    data: { companyId, contactId: newContact?.id, reviewed: true },
  })
  await saveConfirmedRecord(companyId, newContact?.id ?? null)
  const followUp = await scheduleFollowUp(companyId, newContact?.id ?? null)
  const full = await prisma.company.findUnique({
    where: { id: companyId },
    include: { contacts: true },
  })
  return res.json({ ...full, followUp })
})

/** Best-effort: the database stays the source of truth if the Spaces write fails. */
async function saveCardRecord(cardId: string, record: Record<string, unknown>) {
  try {
    await savePrivateJson(`cards/${cardId}/details.json`, record)
  } catch (err) {
    console.error(`Failed to save card ${cardId} details to Spaces`, err)
  }
}

type ContactInput = {
  name?: string
  firstName?: string
  lastName?: string
  jobTitle?: string
  email?: string
  mobile?: string
  phone?: string
  website?: string
  linkedinUrl?: string
  twitterUrl?: string
}

/** Returns null when the card has no contact details worth saving. */
function buildContactData(contact: ContactInput | undefined) {
  if (!contact) return null
  const clean = (v?: string) => v?.trim() || undefined

  let firstName = clean(contact.firstName) ?? ''
  let lastName = clean(contact.lastName) ?? ''
  const fullName = clean(contact.name)
  if (fullName && !firstName && !lastName) {
    const [first, ...rest] = fullName.split(/\s+/)
    firstName = first
    lastName = rest.join(' ')
  }

  const data = {
    firstName,
    lastName,
    jobTitle: clean(contact.jobTitle),
    email: clean(contact.email) ?? null,
    mobile: clean(contact.mobile),
    phone: clean(contact.phone),
    website: clean(contact.website),
    linkedinUrl: clean(contact.linkedinUrl),
    twitterUrl: clean(contact.twitterUrl),
  }

  const hasAnything = Object.values(data).some(Boolean)
  return hasAnything ? data : null
}

export default router
