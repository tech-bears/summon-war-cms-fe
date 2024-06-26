/*
 * @Author: hypocrisy
 * @Date: 2024-03-21 16:58:04
 * @LastEditors: hypocrisy
 * @LastEditTime: 2024-04-14 17:44:04
 * @FilePath: \summon-war-cms-fe\api2Ts.js
 */
import axios from 'axios'
import https from 'https'
import { existsSync, mkdirSync, rmdirSync, writeFileSync } from 'fs'
const httpsAgent = new https.Agent({
  rejectUnauthorized: false
})
axios.defaults.httpsAgent = httpsAgent
const output = './src/service/frame'
const initApiName = 'Frame'
//https://apifox.com/apidoc/shared-298df24a-8180-4b00-9479-a06337f9a081  user
//https://apifox.com/apidoc/shared-32364896-95f9-44d8-8c89-fc8628de9b9b version
//https://apifox.com/apidoc/shared-43e9b7d8-4e6b-4d76-b2b4-617844cbb844 currency
//https://apifox.com/apidoc/shared-c8d430ca-6419-4576-b750-8ffb6c1d3332 avatar
//https://apifox.com/apidoc/shared-4178c3a0-3543-4152-b093-f953acde27bd race
//https://apifox.com/apidoc/shared-a127f973-798d-4d43-bb72-f877019ec669 frame
const share_id = 'a127f973-798d-4d43-bb72-f877019ec669'

// 清一下目录
existsSync(`${output}`) && rmdirSync(`./${output}`, { recursive: true })

const distPath = `./${output}`
mkdirSync(`${distPath}`, { recursive: true })

// 先抽离schemas
const schemasUrl = `https://www.apifox.cn/api/v1/shared-docs/${share_id}/data-schemas`
let allSchema = {}
// axios.get(schemasUrl).then((res) => {
//   const schemasData = res.data.data
//   console.log(`**************成功请求 schemas 数据**************`)
//   // 处理schema
//   let result = ''
//   schemasData.forEach((item) => {
//     const schemaId = item.id
//     const schemaName = item.name

//     // 收集所有的schema的id
//     allSchema = {
//       ...allSchema,
//       [schemaId]: schemaName
//     }

//     const properties = item.jsonSchema.properties
//     const schemaTitle = formatSchemaName(item.jsonSchema.title)
//     // 先把所有enum类型提前生成
//     if (properties) {
//       for (let key in properties) {
//         const property = properties[key]
//         if (property.enum) {
//           const enumName = schemaTitle + firstToLocaleUpperCase(key)
//           const description = property.description || ''
//           result += `
//     /** ${description} */
//     type ${enumName} = ${handleEnumType(property.enum)}`
//         }
//       }
//     }
//   })

//   schemasData.forEach((item) => {
//     const properties = item.jsonSchema.properties
//     const required = item.jsonSchema.required
//     const description = item.jsonSchema.description || ''
//     const schemaTitle = formatSchemaName(item.jsonSchema.title)

//     result += `
//     /** ${description} */
//     interface ${schemaTitle} {${handleAllType(properties, required, schemaTitle)}
//     }`
//   })

//   const componentPath = `${distPath}/schema.d.ts`

//   writeFileSync(
//     componentPath,
//     `
// declare namespace Api {
//   namespace Schema {
//     ${result}
//   }
// }
// `
//   )
// })

// 抽离Paths, apifox数据结构是，先拿到api-tree，然后轮询id获取请求的request和response
// api-tree数据请求地址
const requestUrl = `https://www.apifox.cn/api/v1/shared-docs/${share_id}/http-api-tree`
// 所有api集合
axios.get(requestUrl).then((apiTreeData) => {
  const apiTree = apiTreeData.data.data
  console.log('**************成功请求 apiTree 数据**************')
  // 遍历模块，取出模块id用于获取api接口

  function getAllApiValues(obj) {
    let result = []

    for (let key in obj) {
      if (key === 'api') {
        result.push(obj[key]['id'])
      } else if (typeof obj[key] === 'object') {
        result = result.concat(getAllApiValues(obj[key]))
      }
    }

    return result
  }
  let urls = getAllApiValues(apiTree)
  // 拍平一下
  urls = urls.flat(Infinity)
  console.log(
    '**************成功获取 urls 数据**************',
    urls.join(' | ')
  )
  executeUrls(urls).then((data) => {
    const { pathsFile, servicesFile } = data
    /** 接口paths */
    writeFileSync(
      `${distPath}/paths.d.ts`,
      `
declare namespace Api {
  namespace Paths {
    ${pathsFile}
  }
}`
    )

    /** 服务接口service */
    writeFileSync(
      `${distPath}/index.ts`,
      `
/** Tip: 需要手动引入 request 函数 */
import request from '@/utils/request'

${servicesFile}
`
    )
  })
})

// 接口
const executeUrls = async (urls) => {
  let pathsFile = ''
  let servicesFile = ''
  for (let url of urls) {
    const moduleUrl = `https://www.apifox.cn/api/v1/shared-docs/${share_id}/http-apis/${url}`
    const apiData = await axios.get(moduleUrl)
    console.log(`**************成功请求 ${moduleUrl} 数据**************`)
    pathsFile += convertPaths(apiData.data.data)
    servicesFile += convertServices(apiData.data.data)
  }

  return { pathsFile, servicesFile }
}

/***************************工具函数**********************/
/** 处理枚举类型 */
const handleEnumType = function (enums) {
  let enumTypeStr = ''
  enums.forEach((item, index) => {
    if (index === 0) {
      enumTypeStr += `"${item}"`
    } else {
      enumTypeStr += ` | "${item}"`
    }
  })
  return enumTypeStr
}

/** 处理所有类型 */
const handleAllType = function (properties, required, schemaTitle) {
  let result = ''
  for (let key in properties) {
    const property = properties[key]
    const description = property.description || ''
    if ((required && !required.includes(key)) || property.nullable === true) {
      result += `
      /** ${description} */
      ${key}?: ${convertType(property, key, schemaTitle)};`
    } else {
      result += `
      /** ${description} */
      ${key}: ${convertType(property, key, schemaTitle)};`
    }
  }

  return result
}

/** 转换类型 */
const convertType = function (property, key = '', schemaTitle = '') {
  let type = '未知'
  switch (property.type) {
    case 'string':
      if (property.enum) {
        const enumType = schemaTitle + firstToLocaleUpperCase(key)
        type = enumType
      } else {
        type = 'string'
      }
      break
    case 'boolean':
      type = 'boolean'
      break
    case 'integer':
      type = 'number'
      break
    case 'number':
      type = 'number'
      break
    case 'array':
      if (property.items.type) {
        let itemType = property.items.type
        if (itemType === 'integer') {
          type = 'Array<number>'
        } else {
          type = `Array<${itemType}>`
        }
      } else if (property.items.$ref) {
        const refType = convertRefType(property.items.$ref)
        if (refType) {
          type = `Array<${refType}>`
        }
      }
      break
    case 'object':
      if (property.additionalProperties && property.additionalProperties.type) {
        type = convertType(property.additionalProperties)
      } else {
        type = '{[key: string]: object}'
      }
      break
    default:
      if (property.$ref) {
        const refType = convertRefType(property.$ref)
        if (refType) {
          type = refType
        }
      }
  }
  return formatSchemaName(type)
}

/** 转换ref类型 */
const convertRefType = function (refValue = '') {
  const refArr = refValue.split('/')
  const length = refArr.length
  const id = refArr[length - 1]
  const schemaName = allSchema[id] || ''
  return formatSchemaName(schemaName)
}

/** 首字母大写 */
const firstToLocaleUpperCase = (str) => {
  if (!str) return ''
  return str.charAt(0).toUpperCase() + str.slice(1)
}

/** 生成API名称 */
function createApiName(apiUrl, method) {
  // 解析url
  const urlBlock = apiUrl.match(/\/[a-zA-z0-9]+/g) || []
  const routeParams = apiUrl.match(/\{[a-zA-Z0-9]*\}+/g)
  // routeParam 用于区别/xxx 和 /xxx/:id 这两种接口的命名
  let routeParam = ''

  if (routeParams) {
    routeParam = firstToLocaleUpperCase(
      routeParams[routeParams.length - 1].replace(/[{|}]/g, '')
    )
  }

  let name = urlBlock[urlBlock.length - 1].replace('/', '')
  name += routeParam ? '_' + routeParam : ''

  let apiName =
    method + initApiName + firstToLocaleUpperCase(name)

  return (cacheApiName = []) => {
    if (cacheApiName.includes(apiName)) {
      name =
        firstToLocaleUpperCase(urlBlock[urlBlock.length - 2].replace('/', '')) +
        firstToLocaleUpperCase(urlBlock[urlBlock.length - 1].replace('/', ''))
      apiName = method + initApiName + firstToLocaleUpperCase(name)
    }
    cacheApiName.push(apiName)
    return apiName
  }
}
/** 转换Path */
const convertPaths = (item) => {
  let cacheApiName = []
  const getApiName = createApiName(item.path, item.method)
  const apiName = firstToLocaleUpperCase(getApiName(cacheApiName))
  let pathsFileCotent = `
    /**
    ** 接口名称: ${item.name}
    ** 请求方式: ${item.method}
    ** 接口地址: ${item.path}
    ** 接口描述: ${item.description}
    ** 请求头:
    ${convertHeaders1(item.commonParameters.header, item.requestBody.type)}
    ** 请求参数:
    ${item === 'post' ? convertPostParameters1(
    item.requestBody?.jsonSchema?.properties,
    item.requestBody?.jsonSchema?.required
  ) : convertGetParameters1(item.parameters?.query)}
    ** 响应字段:
    ${convertResponse1(item.responses[0].jsonSchema.properties)}
    */
    namespace ${apiName} {
      /** 请求头 */
      interface Headers {
        ${convertHeaders(item.commonParameters.header)}
      }
      /** 请求 */
      interface Request {
        ${item.method === 'post' ? convertPostParameters(
    item.requestBody?.jsonSchema?.properties,
    item.requestBody?.jsonSchema?.required
  ) : convertGetParameters(item.parameters?.query)}
      }
      /** 响应 */
      interface Response  {
        ${convertResponse(item.responses[0].jsonSchema.properties)}
      }

    }
    `
  return pathsFileCotent
}

/** 转换body参数 */
function convertResponse(properties) {
  if (!properties || Object.keys(properties).length == 0) return ''
  let fileContent = ''
  const Params = Object.keys(properties)
  Params.forEach((item) => {
    if (properties[item]['type'] === 'array') {
      fileContent += `/** ${properties[item]['description']} */
      ${item}: {${convertResponse(properties[item]['items']['properties'])}}[]
      `
    } else {
      fileContent += `/** ${properties[item]['description']} */\n
      ${item}: ${convertType(properties[item])}
      `
    }
  })
  return fileContent
}
function convertResponse1(properties, isArray = false) {
  if (!properties || Object.keys(properties).length == 0) return ''
  let fileContent = ''
  const Params = Object.keys(properties)
  Params.forEach((item) => {
    if (properties[item]['type'] === 'array') {
      fileContent += `    ** ${item} ${properties[item]['description']}\n
   ${convertResponse1(properties[item]['items']['properties'], true)}
  `
    } else {
      if (!isArray) {
        fileContent += `    ** ${item}: ${convertType(properties[item])} ${properties[item]['description']}\n
   `
      }
      else {
        fileContent += `       ** ${item}: ${convertType(properties[item])} ${properties[item]['description']}\n
   `
      }
    }
  })
  return fileContent
}
/** 转换parameters参数 */
function convertPostParameters(properties, required = []) {
  if (!properties || Object.keys(properties).length == 0) return ''
  let fileContent = ''
  // 处理path
  const Params = Object.keys(properties)
  Params.forEach((item) => {
    const description =
      properties[item]['description'] || properties[item]['title'] || ''
    if (required.includes(item)) {
      fileContent += `/** ${description} */
        ${item}: ${convertType(properties[item])}
        `
    } else {
      fileContent += `/** ${description} */
        ${item}?: ${convertType(properties[item])}
        `
    }
  })
  return fileContent
}
function convertGetParameters(query = []) {
  let fileContent = ''
  query.forEach((item) => {
    if (item.required) {
      fileContent += `/** ${item.name} ${item.description} */
      ${item.name}: ${convertType(item)}
      `
    }
    else {
      fileContent += `/** ${item.name} ${item.description} */
      ${item.name}?: ${convertType(item)}
      `
    }
  })
  return fileContent
}
function convertGetParameters1(query = []) {
  let fileContent = ''
  query.forEach((item) => {
    if (item.required) {
      fileContent += `   ** ${item.name}: ${convertType(item)} ${item.description}
      `
    }
    else {
      fileContent += `   ** ${item.name}?: ${convertType(item)} ${item.description}
      `
    }
  })
  return fileContent
}
function convertPostParameters1(properties, required = []) {
  if (!properties || Object.keys(properties).length == 0) return ''
  let fileContent = ''
  // 处理path
  const Params = Object.keys(properties)
  Params.forEach((item) => {
    const description =
      properties[item]['description'] || properties[item]['title'] || ''
    if (required.includes(item)) {
      fileContent += `   ** ${item}: ${convertType(
        properties[item]
      )} ${description}
   `
    } else {
      fileContent += `   ** ${item}?: ${convertType(
        properties[item]
      )}  ${description}
   `
    }
  })
  return fileContent
}
//处理header
function convertHeaders(headers = []) {
  headers = headers
    .filter((item) => item.name !== 'X-CAPTCHA-RANDSTR')
    .filter((item) => item.enable !== false)
    .map((item) => item.name)
  if (headers.length === 0) return ''
  let fileContent = ''
  headers.forEach((item) => {
    fileContent += `"${item}": string
        `
  })
  //加上一个任意的header用于其他情况
  fileContent += `[key: string]: string
    `
  return fileContent
}
function convertHeaders1(headers = [], type = 'application/json') {
  headers = headers
    .filter((item) => item.name !== 'X-CAPTCHA-RANDSTR')
    .filter((item) => item.enable !== false)
    .map((item) => item.name)
  if (headers.length === 0) return ''
  let fileContent = ''
  headers.forEach((item) => {
    fileContent += `   ** ${item}: string
   `
  })
  fileContent += `   ** Content-Type: ${type}`
  return fileContent
}
// function convertResponse(responses) {
//   const successRes = responses.find((item) => item.name === '成功')
//   const resRef = successRes.jsonSchema.$ref || ''
//   const resSchemaName = convertRefType(resRef)
//   if (resSchemaName) {
//     return `extends Api.Schema.${resSchemaName} `
//   }
//   return ''
// }

function formatSchemaName(str) {
  return str.replace(/«|»|\./g, '')
}

function convertServices(item) {
  let cacheApiName = []
  const getApiName = createApiName(item.path, item.method)
  const funcName = getApiName(cacheApiName)
  const apiName = firstToLocaleUpperCase(funcName)
  const servicesFileCotent = `
  /**
   ** 接口名称: ${item.name}
   ** 请求方式: ${item.method}
   ** 接口地址: ${item.path}
   ** 接口描述: ${item.description}
   ** 请求头:
   ${convertHeaders1(item.commonParameters.header, item.requestBody.type)}
   ** 请求参数:
   ${item.method === 'post' ? convertPostParameters1(
    item.requestBody?.jsonSchema?.properties,
    item.requestBody?.jsonSchema?.required
  ) : convertGetParameters1(item.parameters?.query)}
   ** 响应字段:
   ${convertResponse1(item.responses[0].jsonSchema.properties)}
   */
export const ${funcName} = (params: Api.Paths.${apiName}.Request,config={}) => {
  return request<Api.Paths.${apiName}.Response>({
    url: \`${item.path.replace(/[{]/g, '${params.')}\`,
    method: "${item.method.toUpperCase()}",
    ${['GET', 'DELETE'].includes(item.method.toUpperCase())
      ? 'params,'
      : 'data: params,'
    }
    ...config
  });
}
        `
  return servicesFileCotent
}
