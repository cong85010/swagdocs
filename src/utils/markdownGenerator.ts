export interface OpenApiSpec {
  openapi?: string;
  swagger?: string;
  paths: Record<string, Record<string, OpenApiOperation>>;
  components?: {
    schemas?: Record<string, any>;
  };
}

interface OpenApiOperation {
  summary?: string;
  description?: string;
  operationId?: string;
  parameters?: OpenApiParameter[];
  requestBody?: {
    content?: {
      'application/json'?: {
        schema?: any;
        example?: any;
      };
      'application/xml'?: {
        schema?: any;
        example?: any;
      };
      [key: string]: any;
    };
  };
  responses?: Record<string, OpenApiResponse>;
}

interface OpenApiParameter {
  name: string;
  in: 'query' | 'path' | 'header' | 'cookie';
  required?: boolean;
  schema?: {
    type?: string;
    format?: string;
    enum?: any[];
    default?: any;
    items?: any;
  };
  description?: string;
}

interface OpenApiResponse {
  description?: string;
  content?: {
    'application/json'?: {
      schema?: any;
      example?: any;
    };
    [key: string]: any;
  };
}

interface Endpoint {
  path: string;
  method: string;
  operation: OpenApiOperation;
}

const toTypeScriptType = (schema: any, definitions?: Record<string, any>, depth = 0): string => {
  if (depth > 5) return 'any';

  if (!schema || typeof schema !== 'object') return 'any';

  if (schema.type === 'string') {
    if (schema.enum) {
      return schema.enum.map((v: string) => `"${v}"`).join(' | ');
    }
    if (schema.format === 'date-time') return 'string';
    if (schema.format === 'date') return 'string';
    return 'string';
  }

  if (schema.type === 'number' || schema.type === 'integer') return 'number';
  if (schema.type === 'boolean') return 'boolean';
  if (schema.type === 'array') {
    const itemType = schema.items ? toTypeScriptType(schema.items, definitions, depth + 1) : 'any';
    return `${itemType}[]`;
  }

  if (schema.type === 'object' || !schema.type) {
    if (schema.allOf) {
      return schema.allOf
        .map((s: any) => toTypeScriptType(s, definitions, depth + 1))
        .join(' & ');
    }

    if (schema.oneOf) {
      return '(' + schema.oneOf
        .map((s: any) => toTypeScriptType(s, definitions, depth + 1))
        .join(' | ') + ')';
    }

    if (schema.$ref) {
      const refName = schema.$ref.split('/').pop();
      if (refName && definitions && definitions[refName]) {
        return refName;
      }
      return refName || 'any';
    }

    if (schema.properties) {
      const props = Object.entries(schema.properties)
        .map(([key, value]: [string, any]) => {
          const required = schema.required?.includes(key);
          const optional = required ? '' : '?';
          const propType = toTypeScriptType(value, definitions, depth + 1);
          return `  ${key}${optional}: ${propType};`;
        })
        .join('\n');
      return `{\n${props}\n}`;
    }
  }

  return 'any';
};

const generateRequestExample = (operation: OpenApiOperation, definitions?: Record<string, any>): string => {
  const body = operation.requestBody;
  if (!body || !body.content) return '';

  // Find a suitable content type
  // Find a suitable content type
  const contentTypes = Object.keys(body.content);
  
  // 1. Try JSON variants
  let contentType = contentTypes.find(ct => ct.toLowerCase().includes('json'));
  
  // 2. Try XML variants
  if (!contentType) {
    contentType = contentTypes.find(ct => ct.toLowerCase().includes('xml'));
  }
  
  // 3. Fallback to first available
  if (!contentType && contentTypes.length > 0) {
    contentType = contentTypes[0];
  }

  if (!contentType) return '';

  const content = body.content[contentType];
  if (!content) return '';

  if (content.example) {
    return JSON.stringify(content.example, null, 2);
  }

  if (content.schema) {
    return generateExampleFromSchema(content.schema, definitions);
  }

  return '';
};

const generateExampleFromSchema = (schema: any, definitions?: Record<string, any>): string => {
  if (!schema || typeof schema !== 'object') return '';

  if (schema.example) {
    return JSON.stringify(schema.example, null, 2);
  }

  // Handle $ref
  if (schema.$ref) {
    const refName = schema.$ref.split('/').pop();
    if (refName && definitions && definitions[refName]) {
      return generateExampleFromSchema(definitions[refName], definitions);
    }
  }

  // Check for properties (with or without explicit type)
  if (schema.properties) {
    const obj: Record<string, any> = {};
    Object.entries(schema.properties).forEach(([key, value]: [string, any]) => {
      obj[key] = generateExampleValue(value, definitions);
    });
    return JSON.stringify(obj, null, 2);
  }

  if (schema.type === 'array' && schema.items) {
    return JSON.stringify([generateExampleValue(schema.items, definitions)], null, 2);
  }

  if (schema.type === 'object') {
    return JSON.stringify({}, null, 2);
  }

  const value = generateExampleValue(schema, definitions);
  return value !== null ? JSON.stringify(value, null, 2) : '';
};

const generateExampleValue = (schema: any, definitions?: Record<string, any>): any => {
  if (!schema || typeof schema !== 'object') return null;

  if (schema.example !== undefined) return schema.example;
  if (schema.default !== undefined) return schema.default;

  // Handle $ref
  if (schema.$ref) {
    const refName = schema.$ref.split('/').pop();
    if (refName && definitions && definitions[refName]) {
      return generateExampleValue(definitions[refName], definitions);
    }
  }

  // Check for properties first (regardless of type)
  if (schema.properties) {
    const obj: Record<string, any> = {};
    Object.entries(schema.properties).forEach(([key, value]: [string, any]) => {
      obj[key] = generateExampleValue(value, definitions);
    });
    return obj;
  }

  switch (schema.type) {
    case 'string':
      if (schema.format === 'date-time') return new Date().toISOString();
      if (schema.format === 'date') return new Date().toISOString().split('T')[0];
      if (schema.enum && schema.enum.length > 0) return schema.enum[0];
      return 'string';
    case 'number':
    case 'integer':
      return 0;
    case 'boolean':
      return false;
    case 'array':
      if (schema.items) {
        return [generateExampleValue(schema.items, definitions)];
      }
      return [];
    case 'object':
      return {};
    default:
      // If no type but has properties, treat as object
      return null;
  }
};

const generateResponseInterface = (
  operation: OpenApiOperation,
  method: string,
  path: string,
  definitions?: Record<string, any>
): string => {
  const responses = operation.responses;
  if (!responses) return '';

  const successResponse = responses['200'] || responses['201'] || responses['204'];
  if (!successResponse || !successResponse.content) return '';

  // Find a suitable content type
  const contentTypes = Object.keys(successResponse.content);
  let contentType = contentTypes.find(ct => ct.toLowerCase().includes('json'));
  if (!contentType) contentType = contentTypes.find(ct => ct.toLowerCase().includes('xml'));
  if (!contentType && contentTypes.length > 0) contentType = contentTypes[0];

  if (!contentType) return '';

  const jsonContent = successResponse.content[contentType];
  if (!jsonContent || !jsonContent.schema) return '';

  const typeName = generateTypeName(path, method);
  const typeScript = toTypeScriptType(jsonContent.schema, definitions);

  if (typeScript.includes('{\n')) {
    return `interface ${typeName} ${typeScript}`;
  }

  return `type ${typeName} = ${typeScript}`;
};

const generateTypeName = (path: string, method: string): string => {
  const methodPrefix = method.charAt(0).toUpperCase() + method.slice(1).toLowerCase();
  const pathParts = path
    .replace(/[{}]/g, '')
    .split('/')
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1));

  return `${methodPrefix}${pathParts.join('')}Response`;
};

const generateAxiosSnippet = (method: string, path: string, operation: OpenApiOperation): string => {
  const methodLower = method.toLowerCase();
  const hasParams = operation.parameters && operation.parameters.length > 0;
  const bodyParam = operation.parameters?.find(p => p.in === 'body');
  const hasBody = (operation.requestBody || bodyParam) && ['post', 'put', 'patch'].includes(methodLower);

  const pathParams = operation.parameters?.filter(p => p.in === 'path') || [];
  const queryParams = operation.parameters?.filter(p => p.in === 'query') || [];

  let url = path;
  pathParams.forEach(param => {
    url = url.replace(`{${param.name}}`, `\${${param.name}}`);
  });

  if (pathParams.length > 0) {
    url = '`' + url + '`';
  } else {
    url = `'${url}'`;
  }

  const configParams = [];
  if (queryParams.length > 0) {
    configParams.push('params');
  }

  let snippet = '';
  if (hasBody) {
    // For POST/PUT/PATCH with body, data is the second parameter
    const configStr = configParams.length > 0 ? `, { ${configParams.join(', ')} }` : '';
    snippet = `axios.${methodLower}(${url}, data${configStr})`;
  } else {
    // For GET/DELETE or no body
    const configStr = configParams.length > 0 ? `, { ${configParams.join(', ')} }` : '';
    snippet = `axios.${methodLower}(${url}${configStr})`;
  }

  return snippet;
};

export const generateMarkdown = (
  spec: OpenApiSpec,
  selectedEndpoints: Endpoint[],
  systemPrompt?: string
): string => {
  // Support both OpenAPI 3.0 (components.schemas) and Swagger 2.0 (definitions)
  const definitions = spec.components?.schemas || (spec as any).definitions || {};

  let markdown = '';

  if (systemPrompt) {
    markdown += `${systemPrompt}\n\n`;
  }

  markdown += `# API Documentation\n\n`;

  if (spec.openapi) {
    markdown += `**OpenAPI Version:** ${spec.openapi}\n\n`;
  } else if (spec.swagger) {
    markdown += `**Swagger Version:** ${spec.swagger}\n\n`;
  }

  selectedEndpoints.forEach(({ path, method, operation }) => {
    const methodUpper = method.toUpperCase();

    markdown += `### ${methodUpper} ${path}\n\n`;

    if (operation.summary) {
      markdown += `**Summary:** ${operation.summary}\n\n`;
    }

    if (operation.description) {
      markdown += `${operation.description}\n\n`;
    }

    // Handle parameters (excluding body parameters for Swagger 2.0)
    const nonBodyParams = operation.parameters?.filter(p => p.in !== 'body') || [];
    if (nonBodyParams.length > 0) {
      markdown += `#### Parameters\n\n`;

      const paramsJson: Record<string, any> = {};
      nonBodyParams.forEach(param => {
        paramsJson[param.name] = {
          type: param.schema?.type || 'string',
          required: param.required || false,
          in: param.in,
          description: param.description || '',
        };
      });

      markdown += `\`\`\`json\n${JSON.stringify(paramsJson, null, 2)}\n\`\`\`\n\n`;
    }

    // Handle request body - check both OpenAPI 3.0 requestBody and Swagger 2.0 body parameter
    const bodyParam = (operation.parameters as any)?.find((p: any) => p.in === 'body');
    let requestExample = '';

    if (operation.requestBody) {
      requestExample = generateRequestExample(operation, definitions);
    } else if (bodyParam && bodyParam.schema) {
      // Swagger 2.0 body parameter
      requestExample = generateExampleFromSchema(bodyParam.schema, definitions);
    }

    if (requestExample) {
      markdown += `#### Request Body\n\n`;
      markdown += `\`\`\`json\n${requestExample}\n\`\`\`\n\n`;
    }

    const responseInterface = generateResponseInterface(operation, method, path, definitions);
    if (responseInterface) {
      markdown += `#### Response Type\n\n`;
      markdown += `\`\`\`typescript\n${responseInterface}\n\`\`\`\n\n`;
    }

    const axiosSnippet = generateAxiosSnippet(method, path, operation);
    markdown += `#### Axios Example\n\n`;
    markdown += `\`\`\`typescript\n${axiosSnippet}\n\`\`\`\n\n`;

    markdown += `---\n\n`;
  });

  return markdown;
};

export const extractEndpoints = (spec: OpenApiSpec): Endpoint[] => {
  const endpoints: Endpoint[] = [];

  if (!spec.paths) return endpoints;

  Object.entries(spec.paths).forEach(([path, methods]) => {
    Object.entries(methods).forEach(([method, operation]) => {
      if (typeof operation === 'object' && operation.operationId !== undefined || operation.summary !== undefined) {
        endpoints.push({
          path,
          method: method.toUpperCase(),
          operation: operation as OpenApiOperation,
        });
      }
    });
  });

  return endpoints.sort((a, b) => {
    if (a.method !== b.method) {
      const order = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];
      return order.indexOf(a.method) - order.indexOf(b.method);
    }
    return a.path.localeCompare(b.path);
  });
};
