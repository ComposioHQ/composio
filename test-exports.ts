import { 
  ToolRouterToolkitsDisabledConfigSchema,
  ToolRouterToolkitsEnabledConfigSchema,
  ToolRouterToolkitsParamSchema 
} from './ts/packages/core/dist/index.js';
import z from 'zod/v3';

console.log('Testing individual schemas...\n');

// Test ToolRouterToolkitsParamSchema
console.log('ToolRouterToolkitsParamSchema type:', typeof ToolRouterToolkitsParamSchema);
console.log('Has _def?', ToolRouterToolkitsParamSchema?._def);

// Test ToolRouterToolkitsDisabledConfigSchema  
console.log('\nToolRouterToolkitsDisabledConfigSchema type:', typeof ToolRouterToolkitsDisabledConfigSchema);
console.log('Has _def?', ToolRouterToolkitsDisabledConfigSchema?._def);

// Test ToolRouterToolkitsEnabledConfigSchema
console.log('\nToolRouterToolkitsEnabledConfigSchema type:', typeof ToolRouterToolkitsEnabledConfigSchema);
console.log('Has _def?', ToolRouterToolkitsEnabledConfigSchema?._def);

// Try creating a union manually
const manualUnion = z.union([
  ToolRouterToolkitsDisabledConfigSchema,
  ToolRouterToolkitsEnabledConfigSchema,
  ToolRouterToolkitsParamSchema,
]);

console.log('\n--- Testing manual union ---');

try {
  const result = manualUnion.parse({ disabled: ['test'] });
  console.log('✅ Manual union disabled passed:', result);
} catch (e: any) {
  console.error('❌ Manual union disabled failed:', e.message);
}

try {
  const result = manualUnion.parse({ enabled: ['test'] });
  console.log('✅ Manual union enabled passed:', result);
} catch (e: any) {
  console.error('❌ Manual union enabled failed:', e.message);
}

