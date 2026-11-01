import { describe, expectTypeOf, it } from 'vitest';
import type * as z3 from 'zod/v3';
import type * as z4 from 'zod/v4';

import * as root from '../src/index';
import * as v4 from '../src/v4';

describe('entry point types', () => {
  it('types the root entry against zod v3', () => {
    expectTypeOf(root.jsonSchemaToZod).returns.toEqualTypeOf<z3.ZodType>();
    expectTypeOf(root.jsonSchemaToZodShape).returns.toEqualTypeOf<Record<string, z3.ZodTypeAny>>();
    const schema = root.jsonSchemaToZod({ type: 'string' });
    // @ts-expect-error a v3 schema is not a v4 schema
    const asV4: z4.ZodType = schema;
    void asV4;
  });

  it('types the /v4 entry against zod v4', () => {
    expectTypeOf(v4.jsonSchemaToZod).returns.toEqualTypeOf<z4.ZodType>();
    expectTypeOf(v4.jsonSchemaToZodShape).returns.toEqualTypeOf<Record<string, z4.ZodType>>();
    const schema = v4.jsonSchemaToZod({ type: 'string' });
    // @ts-expect-error a v4 schema is not a v3 schema
    const asV3: z3.ZodTypeAny = schema;
    void asV3;
  });
});
