import { describe, expect, it } from 'vitest';
import { ragToolInvocationSchema } from '@drcip/contracts';
import { RAG_TOOL_DEFINITIONS } from '../src/services/ragToolDefinitions';

type JsonSchema = {
  type?: string;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  enum?: unknown[];
  minimum?: number;
  maximum?: number;
  exclusiveMinimum?: number;
  minLength?: number;
};

function sampleValue(property: JsonSchema): unknown {
  if (property.enum?.length) return property.enum[0];
  if (property.type === 'string') return 'X';
  if (typeof property.exclusiveMinimum === 'number') {
    return property.exclusiveMinimum + 1;
  }
  if (typeof property.minimum === 'number') return property.minimum;
  return 1;
}

function validArguments(parameters: JsonSchema): Record<string, unknown> {
  const properties = parameters.properties ?? {};
  const arguments_: Record<string, unknown> = {};
  for (const name of parameters.required ?? []) {
    arguments_[name] = sampleValue(properties[name] ?? {});
  }
  if (properties.limit) arguments_.limit = 10;
  return arguments_;
}

describe('RAG tool definitions parity', () => {
  it('covers exactly the approved tool names', () => {
    expect(RAG_TOOL_DEFINITIONS.map((tool) => tool.name)).toEqual([
      'get_active_incidents',
      'get_nearby_ambulances',
      'get_available_rescue_teams',
      'get_shelter_capacity',
      'get_resource_stock',
      'get_current_assignments',
    ]);
  });

  it('accepts every JSON-Schema enum value and rejects unknown values', () => {
    for (const tool of RAG_TOOL_DEFINITIONS) {
      const parameters = tool.parameters as JsonSchema;
      const base = validArguments(parameters);
      for (const [name, property] of Object.entries(parameters.properties ?? {})) {
        for (const value of property.enum ?? []) {
          expect(
            ragToolInvocationSchema.safeParse({
              tool: tool.name,
              arguments: { ...base, [name]: value },
            }).success,
            `${tool.name}.${name} should accept ${String(value)}`,
          ).toBe(true);
        }
        if (property.enum?.length) {
          expect(
            ragToolInvocationSchema.safeParse({
              tool: tool.name,
              arguments: { ...base, [name]: '__INVALID__' },
            }).success,
            `${tool.name}.${name} should reject an unknown value`,
          ).toBe(false);
        }
        for (const key of ['minimum', 'maximum', 'exclusiveMinimum'] as const) {
          const bound = property[key];
          if (typeof bound !== 'number') continue;
          const outside =
            key === 'maximum' ? bound + 1 : key === 'minimum' ? bound - 1 : bound;
          expect(
            ragToolInvocationSchema.safeParse({
              tool: tool.name,
              arguments: { ...base, [name]: outside },
            }).success,
            `${tool.name}.${name} should reject ${key}=${outside}`,
          ).toBe(false);
        }
      }
    }
  });

  it('enforces required properties and rejects unknown properties', () => {
    for (const tool of RAG_TOOL_DEFINITIONS) {
      const parameters = tool.parameters as JsonSchema;
      const base = validArguments(parameters);
      expect(
        ragToolInvocationSchema.safeParse({
          tool: tool.name,
          arguments: base,
        }).success,
        `${tool.name} base arguments should be valid`,
      ).toBe(true);

      for (const required of parameters.required ?? []) {
        const missing = { ...base };
        delete missing[required];
        expect(
          ragToolInvocationSchema.safeParse({
            tool: tool.name,
            arguments: missing,
          }).success,
          `${tool.name} should require ${required}`,
        ).toBe(false);
      }

      expect(
        ragToolInvocationSchema.safeParse({
          tool: tool.name,
          arguments: { ...base, __unexpected: true },
        }).success,
        `${tool.name} should reject unknown properties`,
      ).toBe(false);
    }
  });
});
