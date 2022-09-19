export type JavaBaseType = 'integer' | 'number' | 'string' | 'boolean' | 'file'

export type JavaType = JavaBaseType | 'array' | 'object'

export interface Definition {
  required?: string[]
  description?: string
  properties: Properties
}

export type Properties = Record<string, Property | undefined>

export interface Property {
  type?: JavaType
  $ref?: string
  description?: string
  items?: Schema
  format?: string
  enum?: (string | number)[]
}

export interface Schema {
  $ref?: string
  type?: JavaType
  items?: Schema
  format?: string
}

// result
export interface Field {
  name: string
  optional: boolean
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
