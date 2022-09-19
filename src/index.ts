import parserv2 from './v2/parser'
import { SwaggerV2 } from './v2/types'
import parserv3 from './v3/parser'
import { SwaggerV3 } from './v3/types'

export default function parser(swagger: SwaggerV2 | SwaggerV3, path: string, method: string) {
  return (swagger as SwaggerV2).definitions
    ? parserv2(swagger as SwaggerV2, path, method)
    : parserv3(swagger as SwaggerV3, path, method)
}

export * from './types'

export * from './v2/types'

export * from './v3/types'
