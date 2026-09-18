import { Router } from 'express'
import multer from 'multer'
import { prisma } from '../lib/prisma'
import { requireAuth, requirePermission } from '../middleware/auth'
import { extractBusinessCard } from '../services/aiCard'
import { uploadPrivateFile } from '../services/storage'

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
        rawAiResponse: extraction.raw as object,
        reviewed: false,
        createdById: req.user!.id,
      },
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
    contact: {
      firstName: string
      lastName: string
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

  if (!cardId || !company?.name || !contact?.firstName || !contact?.lastName) {
    return res.status(400).json({ error: 'cardId, company.name, and contact name are required' })
  }

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
        contacts: {
          create: {
            firstName: contact.firstName,
            lastName: contact.lastName,
            jobTitle: contact.jobTitle,
            email: contact.email || null,
            mobile: contact.mobile,
            phone: contact.phone,
            website: contact.website,
            linkedinUrl: contact.linkedinUrl,
            twitterUrl: contact.twitterUrl,
            isPrimary: true,
          },
        },
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
    return res.status(201).json(created)
  }

  const existing = await prisma.company.findUnique({ where: { id: companyId } })
  if (!existing) return res.status(404).json({ error: 'Company not found' })

  const newContact = await prisma.contact.create({
    data: {
      companyId,
      firstName: contact.firstName,
      lastName: contact.lastName,
      jobTitle: contact.jobTitle,
      email: contact.email || null,
      mobile: contact.mobile,
      phone: contact.phone,
      website: contact.website,
      linkedinUrl: contact.linkedinUrl,
      twitterUrl: contact.twitterUrl,
      isPrimary: false,
    },
  })
  await prisma.businessCard.update({
    where: { id: cardId },
    data: { companyId, contactId: newContact.id, reviewed: true },
  })
  const full = await prisma.company.findUnique({
    where: { id: companyId },
    include: { contacts: true },
  })
  return res.json(full)
})

export default router
