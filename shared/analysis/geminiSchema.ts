import { z } from 'zod';
import { AnalysisResultSchema } from './schema.ts';

// Gemini's responseJsonSchema accepts only a subset of JSON Schema. Unsupported
// keywords (minLength, maxLength, $schema, ...) are dropped here; the full Zod
// schema still enforces them when the response is validated.
const SUPPORTED_KEYWORDS = new Set([
  '$id',
  '$defs',
  '$ref',
  '$anchor',
  'type',
  'format',
  'title',
  'description',
  'enum',
  'items',
  'prefixItems',
  'minItems',
  'maxItems',
  'minimum',
  'maximum',
  'anyOf',
  'oneOf',
  'properties',
  'additionalProperties',
  'required',
  'propertyOrdering',
]);

// Keywords whose value is a map of name -> schema rather than a schema.
const SCHEMA_MAPS = new Set(['properties', '$defs']);

function sanitize(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(sanitize);
  if (node === null || typeof node !== 'object') return node;

  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(node)) {
    if (!SUPPORTED_KEYWORDS.has(key)) continue;
    if (SCHEMA_MAPS.has(key) && value !== null && typeof value === 'object') {
      out[key] = Object.fromEntries(Object.entries(value).map(([name, schema]) => [name, sanitize(schema)]));
    } else {
      out[key] = sanitize(value);
    }
  }
  return out;
}

export function toGeminiResponseSchema(): unknown {
  return sanitize(z.toJSONSchema(AnalysisResultSchema, { target: 'draft-2020-12', io: 'output' }));
}
