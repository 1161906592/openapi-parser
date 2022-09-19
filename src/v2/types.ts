import { Definition, JavaBaseType, Schema } from '../types'

export interface ParameterV2 {
  name: string
  in: 'query' | 'header' | 'path' | 'formData' | 'body'
  description: string
  required: boolean
  type: JavaBaseType
  items?: Schema
  format?: string
  allowEmptyValue?: boolean
  schema?: Schema
}

export interface RequestDefinitionV2 {
  tags: string[]
  produces?: string[]
  consumes?: string[]
  summary: string
  description: string
  operationId: string
  parameters?: ParameterV2[]
  responses: Record<
    '200',
    {
      description: string
      schema?: Schema
    }
  >
}

export interface SwaggerV2 {
  basePath: string
  definitions: Record<string, Definition | undefined>
  host: string
  paths: {
    [key: string]: Record<string, RequestDefinitionV2 | undefined> | undefined
  }
  swagger: string
  tags: {
    name: string
    description?: string
  }[]
}
