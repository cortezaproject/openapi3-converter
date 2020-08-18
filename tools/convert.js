import fs from 'fs'
import yaml from 'js-yaml'

let path
if (process.argv.length >= 3) {
  path = process.argv[2]
} else {
  // Assume "standard" dev environment
  // where corteza server source could be found
  // next to this lib
  path = '../corteza-server'
}

const dst = `${__dirname}/../swagger`

const namespaces = [
  {
    path: `${path}/system/rest.yaml`,
    namespace: 'system',
    className: 'System',
  },
  {
    path: `${path}/compose/rest.yaml`,
    namespace: 'compose',
    className: 'Compose',
  },
  {
    path: `${path}/messaging/rest.yaml`,
    namespace: 'messaging',
    className: 'Messaging',
  },
]

const openAItypesMap = {
  string: 'string',
  uint: 'string',
  uint64: 'string',
  int: 'integer',
  integer: 'integer',
  bool: 'boolean',
}

const uniqueTypes = new Set()

function getType (type) {
  return openAItypesMap[type] || 'string'
}

function getSchema (type) {
  if (type.includes('[]')) {
    return {
      type: 'array',
      items: {
        type: getType(type.split('[]')[1])
      }
    }
  } else {
    return { 
      type: getType(type)
    }
  }
} 

namespaces.forEach(({ path, namespace, className }) => {
  console.log(`Generating ${className} documentation from specs file '${path}'`)

  let spec

  try {
    spec = yaml.safeLoad(fs.readFileSync(path)).endpoints
  } catch (err) {
    switch (err.code) {
      case 'ENOENT':
        console.error('Could not find specs file')
        return
    }

    throw err
  }

  if (!spec) {
    console.error('Endpoints are undefined')
    return
  }

  // Base API info for the specific namespace
  const base = {
    openapi: '3.0.0',
    info: {
      title: `Corteza ${namespace} API`,
      description: `Corteza ${namespace} REST API definition`,
      version: '1.0.0',
      contact: {
        email: 'contact@mail.com'
      },
      license: {
        name: 'Apache 2.0',
        url: 'http://www.apache.org/licenses/LICENSE-2.0.html'
      }
    },
    paths: {}
  }

  // Generate openAPI code for each endpoint group
  spec.forEach(e => {
    const tag = e.title
    const basePath = e.path
    const baseParams = e.parameters || {}
    let def = {}
    
    e.apis.forEach(api => {
      def = {}

      // Base definition for specific endpoint
      def[`${api.method.toLowerCase()}`] = {
        tags: [tag],
        summary: api.title,
        responses: {
          200: {
            description: 'OK'
          }
        }
      }
      
      // Set default parameters
      api.parameters = api.parameters || {}

      // Add base parameter to the parameters object. Takes care of nested path parameters.
      Object.entries(baseParams).forEach(([k, v]) => {
        if (api.parameters[k]) {
          api.parameters[k] = [...v, ...api.parameters[k]]
        } else {
          api.parameters[k] = v
        }
      })

      // Convert YAML paramterets to openAPI parameters (get/query, path, post(body))
      Object.entries(api.parameters).forEach(([k, v]) => {
        if (v.length) {
          if (k === 'get') {
            def[`${api.method.toLowerCase()}`].parameters = (def[`${api.method.toLowerCase()}`].parameters || []).concat(
              v.map(p => {
                return {
                  in: 'query',
                  name: p.name,
                  description: p.title,
                  required: p.required || false,
                  schema: getSchema(p.type)
                }
              })
            )
          } else if (k === 'post') {
            const properties = {}
            const required = []

            v.map(p => {
              properties[p.name] = {
                ...getSchema(p.type),
                description: p.title
              }

              if (p.required) {
                required.push(p.name)
              }
            })

            const requestBody = {
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties,
                  }
                },
                'application/x-www-form-urlencoded': {
                  schema: {
                    type: 'object',
                    properties,
                  }
                },
              }
            }

            if (required.length) {
              requestBody.content['application/json'].schema.required = required
            }

            def[`${api.method.toLowerCase()}`].requestBody = requestBody
          } else if (k === 'path' ) {
            def[`${api.method.toLowerCase()}`].parameters = (def[`${api.method.toLowerCase()}`].parameters || []).concat(
              v.map(p => {
                return {
                  in: 'path',
                  name: p.name,
                  description: p.title,
                  required: true,
                  schema: getSchema(p.type)
                }
              })
            )
          }
        }
      })

      // Save openAPI definition for endproint group
      base.paths[`${basePath}${api.path}`] = def
    })
  })


  try {
    // Save namespace file
    let yamlStr = yaml.safeDump(base);
    fs.writeFileSync(`${dst}/${namespace}.yaml`, yamlStr, 'utf8')
  } catch (err) {
    console.error(err)
  }
})
