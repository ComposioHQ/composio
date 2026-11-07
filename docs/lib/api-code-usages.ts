import { createCodeUsageGeneratorRegistry } from 'fumadocs-openapi/requests/generators';
import { registerDefault } from 'fumadocs-openapi/requests/generators/all';
import { python } from 'fumadocs-openapi/requests/generators/python';
import { javascript } from 'fumadocs-openapi/requests/generators/javascript';
import { curl } from 'fumadocs-openapi/requests/generators/curl';

/** Raw HTTP equivalents, not calls to the Composio SDKs. JavaScript fetch is valid TypeScript. */
export const apiCodeUsages = createCodeUsageGeneratorRegistry();
apiCodeUsages.add('python', python);
apiCodeUsages.add('typescript', { ...javascript, label: 'TypeScript', lang: 'typescript' });
apiCodeUsages.add('api', { ...curl, label: 'API' });

// Preserve the reference's other generated languages without duplicate JS/cURL options.
const defaults = registerDefault(createCodeUsageGeneratorRegistry());
for (const [id, generator] of defaults.map()) {
  if (!['python', 'js', 'curl'].includes(id)) apiCodeUsages.add(id, generator);
}
