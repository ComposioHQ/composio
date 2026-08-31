import { describe, it, expect } from 'vitest';
import { ComposioError } from '../../src/errors/ComposioError';
import { ComposioToolVersionRequiredError } from '../../src/errors/ToolErrors';
import {
  JsonSchemaToZodError,
  JsonSchemaRefResolutionError,
} from '../../src/errors/ValidationErrors';

// The base ComposioError assigns `name` as a class field, so a subclass that does
// not reassign `this.name` in its constructor inherits the base value and reports
// 'ComposioError'. error.name is forwarded to error telemetry (see Telemetry.ts),
// where that silently mis-groups distinct error types under the base name. These
// three subclasses had omitted the reassignment their ~30 siblings all perform.
describe('ComposioError subclass names', () => {
  it('ComposioToolVersionRequiredError reports its own name', () => {
    const error = new ComposioToolVersionRequiredError();
    expect(error).toBeInstanceOf(ComposioError);
    expect(error.name).toBe('ComposioToolVersionRequiredError');
  });

  it('JsonSchemaToZodError reports its own name', () => {
    const error = new JsonSchemaToZodError();
    expect(error).toBeInstanceOf(ComposioError);
    expect(error.name).toBe('JsonSchemaToZodError');
  });

  it('JsonSchemaRefResolutionError reports its own name', () => {
    const error = new JsonSchemaRefResolutionError();
    expect(error).toBeInstanceOf(ComposioError);
    expect(error.name).toBe('JsonSchemaRefResolutionError');
  });
});
