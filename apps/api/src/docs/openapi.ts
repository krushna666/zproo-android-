import {
  extendZodWithOpenApi,
  OpenAPIRegistry,
  OpenApiGeneratorV31,
} from '@asteasolutions/zod-to-openapi';
import { ErrorCode } from '@zproo/types';
import { z } from 'zod';

extendZodWithOpenApi(z);

/**
 * OpenAPI registry. Each module registers its paths from the same Zod schemas it uses
 * for validation, so the docs cannot drift from the implementation.
 */
export const registry = new OpenAPIRegistry();

export const successEnvelope = <T extends z.ZodType>(data: T) =>
  z.object({ success: z.literal(true), message: z.string(), data });

export const ErrorResponse = registry.register(
  'ErrorResponse',
  z.object({
    error: z.object({
      code: z.enum(Object.values(ErrorCode) as [ErrorCode, ...ErrorCode[]]),
      message: z.string().openapi({ example: 'Something went wrong. Please try again.' }),
      requestId: z.string().optional(),
      details: z
        .object({
          fields: z.record(z.string(), z.string()).optional(),
          issues: z.array(z.object({ path: z.string(), message: z.string() })).optional(),
          oldTotal: z.number().int().optional(),
          newTotal: z.number().int().optional(),
          seats: z.array(z.string()).optional(),
          roomTypeId: z.string().optional(),
          reason: z.enum(['expired', 'not_applicable', 'min_amount', 'usage_limit']).optional(),
          retryAfter: z.number().int().optional(),
        })
        .optional(),
    }),
  }),
);

const DependencyCheck = z.object({
  status: z.enum(['up', 'down']),
  latencyMs: z.number().int(),
  error: z.string().optional(),
});

export const HealthReport = registry.register(
  'HealthReport',
  z.object({
    status: z.enum(['ok', 'degraded']),
    version: z.string(),
    uptimeSeconds: z.number().int(),
    timestamp: z.iso.datetime(),
    checks: z.record(z.string(), DependencyCheck),
  }),
);

const jsonContent = (schema: z.ZodType) => ({ 'application/json': { schema } });

registry.registerPath({
  method: 'get',
  path: '/health',
  tags: ['System'],
  summary: 'Health report including database and Redis status',
  responses: {
    200: { description: 'Health report', content: jsonContent(successEnvelope(HealthReport)) },
  },
});

registry.registerPath({
  method: 'get',
  path: '/health/ready',
  tags: ['System'],
  summary: 'Readiness probe',
  responses: {
    200: {
      description: 'All dependencies up',
      content: jsonContent(successEnvelope(HealthReport)),
    },
    503: { description: 'A dependency is down', content: jsonContent(ErrorResponse) },
  },
});

registry.registerPath({
  method: 'get',
  path: '/health/live',
  tags: ['System'],
  summary: 'Liveness probe',
  responses: {
    200: {
      description: 'Process is alive',
      content: jsonContent(successEnvelope(z.object({ status: z.literal('ok') }))),
    },
  },
});

export function buildOpenApiDocument(version: string) {
  return new OpenApiGeneratorV31(registry.definitions).generateDocument({
    openapi: '3.1.0',
    info: {
      title: 'ZPROO GO API',
      version,
      description:
        'Unified Mobility & Travel Super App. Every response uses the envelope ' +
        '`{ success, message, data }`; errors are `{ error: { code, message, requestId, details } }`.',
    },
    servers: [{ url: '/api' }],
  });
}
