export interface Field {
  name: string
  required: boolean
  type: string
  description?: string
  format?: string
}

export interface Interface {
  name: string
  description?: string
  fields: Field[]
}

export interface ParseResult {
  name: string
  comment: string
  interfaces: Interface[]
  body?: string
  isFormData?: boolean
  pathVar?: string
  query?: string
  res?: string
}
