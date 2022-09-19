import { Definition, Schema } from '../types'

export interface ParameterV3 {
  name: string
  in: 'query' | 'header' | 'path' | 'cookie'
  description: string
  required: boolean
  allowEmptyValue?: boolean
  schema?: Schema
  style?: string
}

export interface RequestDefinitionV3 {
  tags: string[]
  summary: string
  description: string
  operationId: string
  parameters?: ParameterV3[]
  requestBody?: {
    content: Record<
      string,
      {
        schema?: Schema
      }
    >
  }
  responses: Record<
    '200',
    {
      content?: Record<
        string,
        {
          schema: Schema
        }
      >
      description: string
    }
  >
}

export interface SwaggerV3 {
  components: {
    schemas: Record<string, Definition | undefined>
  }
  paths: {
    [key: string]: Record<string, RequestDefinitionV3 | undefined> | undefined
  }
  openapi: string
  tags: {
    name: string
    description?: string
  }[]
}
