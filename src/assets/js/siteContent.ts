export interface FaqItem {
  id: string
  question: string
  answer: string
  sortOrder: number
  published: boolean
}

export interface LegalSection {
  title: string
  paragraphs: string[]
}

export interface LegalDocument {
  slug: "privacy-policy" | "terms-of-use"
  title: string
  description: string
  sections: LegalSection[]
  version: number
  updatedAt?: string
}

export type LegalPath = `/${LegalDocument["slug"]}`

export type LegalDocuments = Partial<Record<LegalPath, LegalDocument>>
