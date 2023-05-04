import ReservedDict from 'reserved-words'
import pinyin from 'tiny-pinyin'
import { Interface, ParseResult } from './types'

function toFirstUpperCase(str: string) {
  return str.charAt(0).toUpperCase() + str.slice(1)
}

const stripDot = (str: string) => {
  return str.replace(/[-_ .](\w)/g, (_all, letter) => letter.toUpperCase())
}

function resolveFunctionName(functionName: string, methodName: string) {
  const index = functionName.indexOf('Using')
  functionName = index === -1 ? functionName : functionName.slice(0, index)

  // 类型声明过滤关键字
  if (ReservedDict.check(functionName)) {
    return `${functionName}Using${methodName.toUpperCase()}`
  }

  return functionName
}

// 类型声明过滤关键字
const resolveTypeName = (typeName: string) => {
  if (ReservedDict.check(typeName)) {
    return `__openAPI__${typeName}`
  }

  const typeLastName = typeName.split('/').pop()?.split('.').pop() as string

  const name = typeLastName
    .replace(/[-_ ](\w)/g, (_all, letter) => letter.toUpperCase())
    .replace(/[^\w^\s^\u4e00-\u9fa5]/gi, '')

  // 当model名称是number开头的时候，ts会报错。这种场景一般发生在后端定义的名称是中文
  if (name === '_' || /^\d+$/.test(name)) {
    return `Pinyin_${name}`
  }

  if (!/[\u3220-\uFA29]/.test(name) && !/^\d$/.test(name)) {
    return name
  }

  const noBlankName = name.replace(/ +/g, '')

  return pinyin.convertToPinyin(noBlankName, '', true)
}

const DEFAULT_SCHEMA = {
  type: 'object',
  properties: { id: { type: 'number' } },
}

const DEFAULT_PATH_PARAM = {
  in: 'path',
  name: null,
  schema: {
    type: 'string',
  },
  required: true,
  isObject: false,
  type: 'string',
}

export default function parser(openAPIData: any, path: string, method: string): ParseResult | undefined {
  const operationObject = openAPIData.paths[path]?.[method]
  if (!operationObject) return
  const name = resolveFunctionName(stripDot(operationObject.operationId), method)
  const comment = [operationObject.summary, operationObject.description].filter(Boolean).join(', ')
  const interfaces: Interface[] = []
  const typeNameMap: Record<string, boolean> = {}
  const defines = openAPIData.components.schemas
  let placement: Interface['placement']

  function getRefName(refObject: any): string {
    if (typeof refObject !== 'object' || !refObject.$ref) {
      return refObject
    }

    const refPaths = refObject.$ref.split('/')
    const typeName = refPaths[refPaths.length - 1]

    // 循环引用
    if (!typeNameMap[typeName]) {
      typeNameMap[typeName] = true

      interfaces.push({
        name: resolveTypeName(typeName),
        description: defines[typeName].description,
        fields: resolveObject(defines[typeName]).fields || [],
        placement,
      })
    }

    return resolveTypeName(typeName) as string
  }

  function getType(schemaObject: any): string {
    if (schemaObject === undefined || schemaObject === null) {
      return 'object'
    }

    if (typeof schemaObject !== 'object') {
      return schemaObject
    }

    if (schemaObject.$ref) {
      return getRefName(schemaObject)
    }

    let { type } = schemaObject as any

    const numberEnum = [
      'int64',
      'integer',
      'long',
      'float',
      'double',
      'number',
      'int',
      'float',
      'double',
      'int32',
      'int64',
    ]

    const dateEnum = ['Date', 'date', 'dateTime', 'date-time', 'datetime']

    const stringEnum = ['string', 'email', 'password', 'url', 'byte', 'binary']

    if (numberEnum.includes(schemaObject.format as string)) {
      type = 'number'
    }

    if (schemaObject.enum) {
      type = 'enum'
    }

    if (numberEnum.includes(type)) {
      return 'number'
    }

    if (dateEnum.includes(type)) {
      return 'Date'
    }

    if (stringEnum.includes(type)) {
      return 'string'
    }

    if (type === 'boolean') {
      return 'boolean'
    }

    if (type === 'array') {
      let { items } = schemaObject

      if (schemaObject.schema) {
        items = schemaObject.schema.items
      }

      if (Array.isArray(items)) {
        const arrayItemType = (items as any).map((subType: any) => getType(subType.schema || subType)).toString()

        return `[${arrayItemType}]`
      }

      const arrayType = getType(items)

      return arrayType.includes(' | ') ? `(${arrayType})[]` : `${arrayType}[]`
    }

    if (type === 'enum') {
      return Array.isArray(schemaObject.enum)
        ? Array.from(
            new Set(
              schemaObject.enum.map((v: any) => (typeof v === 'string' ? `"${v.replace(/"/g, '"')}"` : getType(v)))
            )
          ).join(' | ')
        : 'string'
    }

    if (schemaObject.oneOf && schemaObject.oneOf.length) {
      return schemaObject.oneOf.map((item: any) => getType(item)).join(' | ')
    }

    if (schemaObject.allOf && schemaObject.allOf.length) {
      return `(${schemaObject.allOf.map((item: any) => getType(item)).join(' & ')})`
    }

    if (schemaObject.type === 'object' || schemaObject.properties) {
      if (!Object.keys(schemaObject.properties || {}).length) {
        return 'object'
      }

      return `{\n${Object.keys(schemaObject.properties)
        .map((key) => {
          const required =
            'required' in (schemaObject.properties[key] || {})
              ? ((schemaObject.properties[key] || {}) as any).required
              : schemaObject.required || false

          const description = schemaObject.properties?.[key].description

          /**
           * 将类型属性变为字符串，兼容错误格式如：
           * 3d_title(数字开头)等错误命名，
           * 在后面进行格式化的时候会将正确的字符串转换为正常形式，
           * 错误的继续保留字符串。
           * */
          return `'${key}'${required ? '' : '?'}: ${getType(
            schemaObject.properties && schemaObject.properties[key]
          )}; ${description ? `// ${description}` : ''}`
        })
        .join('\n')}\n}`
    }

    return type
  }

  function resolveRefObject(refObject: any): any {
    if (!refObject || !refObject.$ref) {
      return refObject
    }

    const refPaths = refObject.$ref.split('/')

    if (refPaths[0] === '#') {
      refPaths.shift()
      let obj = openAPIData

      refPaths.forEach((node: any) => {
        obj = obj[node]
      })

      if (!obj) {
        throw new Error(`[GenSDK] Data Error! Notfoud: ${refObject.$ref}`)
      }

      return {
        ...resolveRefObject(obj),
        type: obj.$ref ? resolveRefObject(obj).type : obj,
        description: refObject.description,
      }
    }

    return refObject
  }

  function getParamsTP(parameters: any[] = [], path: string) {
    const templateParams: Record<string, any> = {}

    if (parameters && parameters.length) {
      const sources = ['query', 'path', 'cookie' /* , 'file' */]

      sources.forEach((source) => {
        // Possible values are "query", "header", "path" or "cookie". (https://swagger.io/specification/)
        const params = parameters
          .map((p) => resolveRefObject(p))
          .filter((p: any) => p.in === source)
          .map((p) => {
            const isDirectObject = ((p.schema || {}).type || p.type) === 'object'
            const refList = ((p.schema || {}).$ref || p.$ref || '').split('/')
            const ref = refList[refList.length - 1]

            const deRefObj = (Object.entries((openAPIData.components && openAPIData.components.schemas) || {}).find(
              ([k]) => k === ref
            ) || []) as any

            const isRefObject = (deRefObj[1] || {}).type === 'object'

            return {
              ...p,
              isObject: isDirectObject || isRefObject,
              type: getType(p.schema || DEFAULT_SCHEMA),
            }
          })

        if (params.length) {
          templateParams[source] = params
        }
      })
    }

    if (path && path.length > 0) {
      const regex = /\{(\w+)\}/g

      templateParams.path = templateParams.path || []
      let match: RegExpExecArray | null = null

      while ((match = regex.exec(path))) {
        if (!templateParams.path.some((p: any) => p.name === match?.[1])) {
          templateParams.path.push({
            ...DEFAULT_PATH_PARAM,
            name: match[1],
          })
        }
      }

      // 如果 path 没有内容，则将删除 path 参数，避免影响后续的 hasParams 判断
      if (!templateParams.path.length) delete templateParams.path
    }

    if (templateParams.path) {
      const typeName = `${toFirstUpperCase(name)}PathVar`
      const fields: any[] = []
      placement = 'path'

      templateParams.path.forEach((parameter: any) => {
        fields.push({
          name: parameter.name,
          required: parameter.required,
          type: getType(parameter.schema),
          description: parameter.description,
          format: parameter.schema.format,
        })
      })

      interfaces.push({ name: typeName, fields: fields, placement })
      templateParams.path = typeName
    }

    if (templateParams.query) {
      const typeName = `${toFirstUpperCase(name)}Query`
      const fields: any[] = []
      placement = 'body'

      templateParams.query.forEach((parameter: any) => {
        fields.push({
          name: parameter.name,
          required: parameter.required,
          type: getType(parameter.schema),
          description: parameter.description,
          format: parameter.schema.format,
        })
      })

      interfaces.push({ name: typeName, fields: fields, placement })
      templateParams.query = typeName
    }

    return templateParams
  }

  function getBodyTP(requestBody: any = {}) {
    placement = 'body'
    const reqBody = resolveRefObject(requestBody)
    if (!reqBody) return null
    const reqContent = reqBody.content
    if (typeof reqContent !== 'object') return null
    let mediaType = Object.keys(reqContent)[0]
    const schema = reqContent[mediaType].schema || DEFAULT_SCHEMA

    if (mediaType === '*/*') {
      mediaType = ''
    }

    // 直接定义的单个schema提升为一个类型
    if (schema.type === 'object' && schema.properties) {
      Object.keys(schema.properties).forEach((p) => {
        if (schema.properties[p]) {
          if (schema.properties[p].format === 'binary') {
            schema.properties[p].type = 'File'
          } else if (schema.properties[p].items?.format === 'binary') {
            schema.properties[p].items.type = 'File'
          }
        }
      })

      const typeName = `${toFirstUpperCase(name)}Body`
      interfaces.push({ name: typeName, ...resolveProperties(schema), placement })

      return { mediaType, type: typeName }
    }

    return { mediaType, type: getType(schema) }
  }

  function getFileTP(requestBody: any = {}) {
    const reqBody = resolveRefObject(requestBody)

    if (reqBody && reqBody.content && reqBody.content['multipart/form-data']) {
      const ret = resolveFileTP(reqBody.content['multipart/form-data'].schema)

      return ret.length > 0 ? ret : null
    }

    return null
  }

  function resolveFileTP(obj: any): any[] {
    let ret = []
    const resolved = resolveObject(obj)

    const fields =
      (resolved.fields &&
        resolved.fields.length > 0 &&
        resolved.fields.filter(
          (p: any) =>
            p.format === 'binary' ||
            p.format === 'base64' ||
            ((p.type === 'string[]' || p.type === 'array') &&
              (p.items.format === 'binary' || p.items.format === 'base64'))
        )) ||
      []

    if (fields.length > 0) {
      ret = fields.map((p: any) => {
        return { title: p.name, multiple: p.type === 'string[]' || p.type === 'array' }
      })
    }

    if (resolved.type) ret = [...ret, ...resolveFileTP(resolved.type)]

    return ret
  }

  function getResponseTP(responses: any = {}) {
    placement = 'res'
    const { components } = openAPIData
    const response = responses && resolveRefObject(responses.default || responses['200'] || responses['201'])
    if (!response) return
    const resContent = response.content
    const mediaType = Object.keys(resContent || {})[0]
    if (typeof resContent !== 'object' || !mediaType) return
    let schema = resContent[mediaType].schema || DEFAULT_SCHEMA

    if (schema.$ref) {
      const refPaths = schema.$ref.split('/')
      const refName = refPaths[refPaths.length - 1]
      const childrenSchema = components.schemas[refName]

      if (childrenSchema?.type === 'object' && 'properties' in childrenSchema) {
        schema = resContent[mediaType].schema || DEFAULT_SCHEMA
      }
    }

    if ('properties' in schema) {
      Object.keys(schema.properties).map((fieldName) => {
        schema.properties[fieldName].required = schema.required?.includes(fieldName) ?? false
      })
    }

    return {
      mediaType,
      type: getType(schema),
    }
  }

  function resolveObject(schemaObject: any) {
    // 引用类型
    if (schemaObject.$ref) {
      return resolveRefObject(schemaObject)
    }

    // 枚举类型
    if (schemaObject.enum) {
      return resolveEnumObject(schemaObject)
    }

    // 继承类型
    if (schemaObject.allOf && schemaObject.allOf.length) {
      return resolveAllOfObject(schemaObject)
    }

    // 对象类型
    if (schemaObject.properties) {
      return resolveProperties(schemaObject)
    }

    // 数组类型
    if (schemaObject.items && schemaObject.type === 'array') {
      return resolveArray(schemaObject)
    }

    return schemaObject
  }

  function resolveAllOfObject(schemaObject: any) {
    const fields = (schemaObject.allOf || []).map((item: any) =>
      item.$ref ? [{ ...item, type: getType(item).split('/').pop() }] : getFields(item)
    )

    return { fields }
  }

  function resolveProperties(schemaObject: any) {
    return {
      fields: getFields(schemaObject),
      description: schemaObject.description,
    }
  }

  function resolveEnumObject(schemaObject: any) {
    const enumArray = schemaObject.enum

    const enumStr = Array.from(
      new Set(enumArray.map((v: any) => (typeof v === 'string' ? `"${v.replace(/"/g, '"')}"` : getType(v))))
    ).join(' | ')

    return {
      type: Array.isArray(enumArray) ? enumStr : 'string',
    }
  }

  function resolveArray(schemaObject: any) {
    if (schemaObject.items.$ref) {
      const refObj = schemaObject.items.$ref.split('/')

      return {
        type: `${refObj[refObj.length - 1]}[]`,
      }
    }

    // TODO: 这里需要解析出具体属性，但由于 parser 层还不确定，所以暂时先返回 any
    return 'any[]'
  }

  function getFields(schemaObject: any) {
    return schemaObject.properties
      ? Object.keys(schemaObject.properties).map((propName) => {
          const schema = (schemaObject.properties && schemaObject.properties[propName]) || DEFAULT_SCHEMA

          return {
            ...schema,
            name: propName,
            type: getType(schema),
            description: [schema.title, schema.description].filter((s) => s).join(' '),
            format: schema.format,
            required: schemaObject?.required?.some((key: string) => key === propName),
          }
        })
      : []
  }

  const params = getParamsTP(operationObject.parameters, path)
  const body = getBodyTP(operationObject.requestBody)
  const res = getResponseTP(operationObject.responses)
  const file = getFileTP(operationObject.requestBody)

  return {
    name,
    comment,
    body: body?.type,
    isFormData: !!((body && (body.mediaType || '').includes('form')) || file),
    pathVar: params.path,
    query: params.query,
    res: res?.type,
    interfaces,
  }
}
