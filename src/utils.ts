import { Interface } from './types'

// 匹配引用类型的名称
export function matchRefTypeName(prefix: string, $ref?: string) {
  return $ref?.match(new RegExp(`${prefix}(\\w+).*`))?.[1] || ''
}

export function toFirstUpperCase(str: string) {
  return str.charAt(0).toUpperCase() + str.slice(1)
}

export function duplicate(interfaces: Interface[]) {
  const map: Record<string, boolean> = {}

  return interfaces.filter((item) => {
    const has = map[item.name]
    map[item.name] = true

    return !has
  })
}
