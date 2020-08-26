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

const openAPItypesMap = {
  bool: { type: 'boolean' },
  int: { type: 'integer' },
  string: { type: 'string' },
  uint: { type: 'string' },
  uint64: { type: 'string' },
  password: { type: 'string', format: 'password' },

  // Special types
  '*time.Time': { type: 'string', format: 'date-time' },
  'json.RawMessage': { type: 'string', format: 'json' },
  'sqlxTypes.JSONText': { type: 'string', format: 'json' },
  '*multipart.FileHeader': { type: 'string', format: 'binary' },
  'types.ChannelMembershipPolicy': { type: 'string' },
  'types.UserKind': { type: 'string'},
  'ProcedureArg': {
    type: 'object',
    properties: {
      name: {
        type: 'string'
      },
      value: {
        type: 'string'
      }
    }
  },
}

const openAPIschemas = {
  'types.RecordValueSet': {
    type: 'array',
    items: {
      type: 'object',
      properties: {
        name: {
          type: 'string'
        },
        value: {
          type: 'string'
        }
      }
    }
  },
  'types.RecordBulkSet': {
    type: 'array',
    items: {
      type: 'object',
      properties: {
        recordID: {
          type: 'string',
          format: 'uuid'
        },
        moduleID: {
          type: 'string',
          format: 'uuid'
        },
        namespaceID: {
          type: 'string',
          format: 'uuid'
        },
        values: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: {
                type: 'string'
              },
              value: {
                type: 'string'
              }
            }
          }
        },
        createdAt: {
          type: 'string',
          format: 'date-time',
        },
        updatedAt: {
          type: 'string',
          format: 'date-time'
        },
        deletedAt: {
          type: 'string',
          format: 'date-time'
        },
        ownedBy: {
          type: 'string',
          format: 'uuid'
        },
        createdBy: {
          type: 'string',
          format: 'uuid'
        },
        updatedBy: {
          type: 'string',
          format: 'uuid'
        },
        deletedBy: {
          type: 'string',
          format: 'uuid'
        },
      }
    }
  },
  'types.SettingValueSet': {
    type: 'array',
    items: {
      type: 'object',
      properties: {
        name: {
          type: 'string'
        },
        value: {
          type: 'string'
        }
      }
    }
  },
  'permissions.RuleSet': {
    type: 'array',
    items: {
      type: 'object',
      properties: {
        roleID: {
          type: 'string',
          format: 'uuid'
        },
        resource: {
          type: 'string'
        },
        operation: {
          type: 'string'
        },
        access: {
          type: 'string'
        }
      }
    }
  },
  'types.ModuleFieldSet': {
    type: 'array',
    items: {
      type: 'object',
      properties: {
        fieldID: {
          type: 'string',
          format: 'uuid'
        },
        name: {
          type: 'string'
        },
        kind: {
          type: 'string'
        },
        label: {
          type: 'string'
        },
        defaultValue: {
          type: 'array',
          items: {
            type: 'string'
          }
        },
        maxLength: {
          type: 'integer'
        },
        isRequired: {
          type: 'boolean'
        },
        isPrivate: {
          type: 'boolean'
        },
        isMulti: {
          type: 'boolean'
        },
        isSystem: {
          type: 'boolean'
        },
        options: {
          type: 'object'
        }
      }
    }
  }
}

function getType (type) {
  return openAPItypesMap[type] || openAPItypesMap['string'] 
}

function getSchema (type, name) {
  if (name === 'password') {
    type = 'password'
  }

  if (type.includes('[]')) {
    return {
      type: 'array',
      items: getType(type.split('[]')[1])
    }
  } else if (openAPIschemas[type]) {
    return openAPIschemas[type]
  }
  return getType(type)
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
                  schema: getSchema(p.type, p.name)
                }
              })
            )
          } else if (k === 'post') {
            const properties = {}
            const required = []

            v.map(p => {
              properties[p.name] = {
                ...getSchema(p.type, p.name),
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
                  schema: getSchema(p.type, p.name)
                }
              })
            )
          }
        }
      })

      // Save openAPI definition for endproint group
      base.paths[`${basePath}${api.path}`] = {...base.paths[`${basePath}${api.path}`], ...def}
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
