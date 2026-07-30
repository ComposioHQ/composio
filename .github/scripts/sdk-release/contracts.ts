import { z } from 'zod';

export const SDK_RELEASE_MANIFEST_VERSION = 'sdk-release-manifest/v1' as const;
export const SDK_RELEASE_REQUEST_VERSION = 'sdk-release-request/v1' as const;
export const SDK_RELEASE_STATE_TRANSITION_VERSION = 'sdk-release-state-transition/v1' as const;
export const SDK_RELEASE_REGISTRY_OBSERVATION_VERSION =
  'sdk-release-registry-observation/v1' as const;
export const SDK_RELEASE_ATTEMPT_RECEIPT_VERSION = 'sdk-release-attempt-receipt/v1' as const;

export const IGNORED_TYPESCRIPT_RELEASE_PACKAGES = [
  '@composio/cli',
  '@composio/cli-local-tools',
] as const;

export const PYTHON_RELEASE_FAMILY = [
  'composio',
  'composio-anthropic',
  'composio-autogen',
  'composio-claude-agent-sdk',
  'composio-crewai',
  'composio-gemini',
  'composio-google',
  'composio-google-adk',
  'composio-langchain',
  'composio-langgraph',
  'composio-llamaindex',
  'composio-openai',
  'composio-openai-agents',
] as const;

const Sha256Schema = z.string().regex(/^[a-f0-9]{64}$/, 'expected a lowercase SHA-256 digest');
const GitShaSchema = z.string().regex(/^[a-f0-9]{40}$/, 'expected a full Git commit SHA');
const ReleaseIdSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/);
const NpmVersionSchema = z.string().superRefine((version, context) => {
  const match =
    /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/.exec(
      version
    );
  const invalidNumericIdentifier = match?.[4]
    ?.split('.')
    .some(identifier => /^\d+$/.test(identifier) && identifier.length > 1 && identifier[0] === '0');
  if (!match || invalidNumericIdentifier) {
    context.addIssue({ code: 'custom', message: 'expected an exact SemVer version' });
  }
});
const PythonVersionSchema = z
  .string()
  .regex(
    /^(?:[1-9]\d*!)?(?:0|[1-9]\d*)(?:\.(?:0|[1-9]\d*)){1,3}(?:(?:a|b|rc)\d+)?(?:\.post\d+)?(?:\.dev\d+)?(?:\+[a-z0-9]+(?:[._-][a-z0-9]+)*)?$/,
    'expected an exact PEP 440 version'
  );

const SelectionSchema = z
  .object({
    typescript: z.enum(['selected', 'skipped']),
    python: z.enum(['selected', 'skipped']),
  })
  .strict();

export const ReleaseRequestSchema = z
  .object({
    schema_version: z.literal(SDK_RELEASE_REQUEST_VERSION),
    operation: z.enum(['prepare', 'publish', 'resume', 'verify']),
    release_id: ReleaseIdSchema,
    scope: z.enum(['typescript', 'python', 'combined']),
    python_version: PythonVersionSchema.optional(),
  })
  .strict()
  .superRefine((request, context) => {
    const includesPython = request.scope === 'python' || request.scope === 'combined';
    if (request.operation === 'prepare' && includesPython && !request.python_version) {
      context.addIssue({
        code: 'custom',
        path: ['python_version'],
        message: 'Python preparation requires an exact target version',
      });
    }
    if (!includesPython && request.python_version) {
      context.addIssue({
        code: 'custom',
        path: ['python_version'],
        message: 'python_version is only valid for a Python-inclusive release',
      });
    }
  });

const TypeScriptPackageSchema = z
  .object({
    ecosystem: z.literal('typescript'),
    name: z.string().min(1),
    version: NpmVersionSchema,
    registry: z.literal('npm'),
    dist_tag: z
      .string()
      .min(1)
      .regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/),
  })
  .strict();

const PythonPackageSchema = z
  .object({
    ecosystem: z.literal('python'),
    name: z.string().min(1),
    version: PythonVersionSchema,
    registry: z.literal('pypi'),
  })
  .strict();

export const PackageSchema = z.discriminatedUnion('ecosystem', [
  TypeScriptPackageSchema,
  PythonPackageSchema,
]);

export const ArtifactSchema = z
  .object({
    ecosystem: z.enum(['typescript', 'python']),
    package_name: z.string().min(1),
    registry: z.enum(['npm', 'pypi']),
    filename: z
      .string()
      .min(1)
      .refine(value => !value.includes('/') && !value.includes('\\'), {
        message: 'artifact filename must be a basename',
      }),
    sha256: Sha256Schema,
  })
  .strict()
  .superRefine((artifact, context) => {
    const expectedRegistry = artifact.ecosystem === 'typescript' ? 'npm' : 'pypi';
    if (artifact.registry !== expectedRegistry) {
      context.addIssue({
        code: 'custom',
        path: ['registry'],
        message: `${artifact.ecosystem} artifacts must use ${expectedRegistry}`,
      });
    }
  });

export const OpenAIGenerationSchema = z
  .object({
    provider: z.literal('openai'),
    model: z.literal('gpt-5.5-2026-04-23'),
    response_id: z.string().min(1),
    prompt_version: z.string().min(1),
    prompt_sha256: Sha256Schema,
    schema_version: z.string().min(1),
    schema_sha256: Sha256Schema,
    generated_at: z.string().datetime({ offset: true }),
  })
  .strict();

const ChangelogSchema = z
  .object({
    draft_path: z
      .string()
      .min(1)
      .refine(path => !path.startsWith('docs/content/changelog/'), {
        message: 'review drafts must remain outside the public changelog collection',
      }),
    sha256: Sha256Schema,
  })
  .strict();

const ToolchainsSchema = z
  .object({
    node: z.string().min(1),
    pnpm: z.string().min(1),
    python: z.string().min(1).nullable(),
    uv: z.string().min(1).nullable(),
  })
  .strict();

const PrepareRunSchema = z
  .object({
    repository: z.string().regex(/^[^/\s]+\/[^/\s]+$/),
    workflow: z.string().min(1),
    run_id: z.number().int().positive(),
    run_attempt: z.number().int().positive(),
    commit_sha: GitShaSchema,
  })
  .strict();

const ManifestShape = {
  schema_version: z.literal(SDK_RELEASE_MANIFEST_VERSION),
  release_id: ReleaseIdSchema,
  base_commit: GitShaSchema,
  selection: SelectionSchema,
  packages: z.array(PackageSchema),
  artifacts: z.array(ArtifactSchema),
  changeset_ids: z.array(z.string().min(1)),
  python_release_family: z.array(z.string().min(1)),
  changelog: ChangelogSchema,
  openai_generation: OpenAIGenerationSchema,
  toolchains: ToolchainsSchema,
  prepare_run: PrepareRunSchema,
};

function validateManifest(
  manifest: z.infer<z.ZodObject<typeof ManifestShape>> & {
    phase: 'draft' | 'sealed';
  },
  context: z.RefinementCtx
): void {
  if (manifest.selection.typescript !== 'selected' && manifest.selection.python !== 'selected') {
    context.addIssue({
      code: 'custom',
      path: ['selection'],
      message: 'at least one ecosystem must be selected',
    });
  }

  const packageNames = new Set<string>();
  for (const [index, releasePackage] of manifest.packages.entries()) {
    if (packageNames.has(releasePackage.name)) {
      context.addIssue({
        code: 'custom',
        path: ['packages', index, 'name'],
        message: `duplicate package ${releasePackage.name}`,
      });
    }
    packageNames.add(releasePackage.name);

    if (
      releasePackage.ecosystem === 'typescript' &&
      IGNORED_TYPESCRIPT_RELEASE_PACKAGES.includes(
        releasePackage.name as (typeof IGNORED_TYPESCRIPT_RELEASE_PACKAGES)[number]
      )
    ) {
      context.addIssue({
        code: 'custom',
        path: ['packages', index, 'name'],
        message: `${releasePackage.name} is excluded from SDK releases`,
      });
    }
  }

  const filenames = new Set<string>();
  for (const [index, artifact] of manifest.artifacts.entries()) {
    if (filenames.has(artifact.filename)) {
      context.addIssue({
        code: 'custom',
        path: ['artifacts', index, 'filename'],
        message: `duplicate artifact filename ${artifact.filename}`,
      });
    }
    filenames.add(artifact.filename);
    const releasePackage = manifest.packages.find(item => item.name === artifact.package_name);
    if (!releasePackage || releasePackage.ecosystem !== artifact.ecosystem) {
      context.addIssue({
        code: 'custom',
        path: ['artifacts', index, 'package_name'],
        message: 'artifact must belong to a package in the same ecosystem',
      });
    }
  }

  const duplicateListValue = (values: string[]): string | undefined =>
    values.find((value, index) => values.indexOf(value) !== index);
  for (const [path, values] of [
    ['changeset_ids', manifest.changeset_ids],
    ['python_release_family', manifest.python_release_family],
  ] as const) {
    const duplicate = duplicateListValue(values);
    if (duplicate) {
      context.addIssue({
        code: 'custom',
        path: [path],
        message: `duplicate value ${duplicate}`,
      });
    }
  }

  const typescriptPackages = manifest.packages.filter(
    releasePackage => releasePackage.ecosystem === 'typescript'
  );
  const pythonPackages = manifest.packages.filter(
    releasePackage => releasePackage.ecosystem === 'python'
  );
  if (
    (manifest.selection.typescript === 'selected' && typescriptPackages.length === 0) ||
    (manifest.selection.typescript === 'skipped' && typescriptPackages.length > 0)
  ) {
    context.addIssue({
      code: 'custom',
      path: ['packages'],
      message: 'TypeScript packages must match the explicit ecosystem selection',
    });
  }
  if (
    (manifest.selection.python === 'selected' && pythonPackages.length === 0) ||
    (manifest.selection.python === 'skipped' && pythonPackages.length > 0)
  ) {
    context.addIssue({
      code: 'custom',
      path: ['packages'],
      message: 'Python packages must match the explicit ecosystem selection',
    });
  }
  if (
    manifest.selection.typescript === 'skipped' &&
    (manifest.changeset_ids.length > 0 ||
      manifest.artifacts.some(artifact => artifact.ecosystem === 'typescript'))
  ) {
    context.addIssue({
      code: 'custom',
      path: ['selection', 'typescript'],
      message: 'skipped TypeScript releases cannot contain TypeScript release data',
    });
  }
  if (
    manifest.selection.python === 'skipped' &&
    (manifest.python_release_family.length > 0 ||
      manifest.artifacts.some(artifact => artifact.ecosystem === 'python'))
  ) {
    context.addIssue({
      code: 'custom',
      path: ['selection', 'python'],
      message: 'skipped Python releases cannot contain Python release data',
    });
  }

  if (manifest.selection.python === 'selected') {
    const expectedFamily = [...PYTHON_RELEASE_FAMILY].sort();
    const recordedFamily = [...manifest.python_release_family].sort();
    const packageFamily = pythonPackages.map(releasePackage => releasePackage.name).sort();
    if (
      JSON.stringify(recordedFamily) !== JSON.stringify(expectedFamily) ||
      JSON.stringify(packageFamily) !== JSON.stringify(expectedFamily)
    ) {
      context.addIssue({
        code: 'custom',
        path: ['python_release_family'],
        message: 'Python releases must contain the complete provider release family',
      });
    }
    if (new Set(pythonPackages.map(releasePackage => releasePackage.version)).size !== 1) {
      context.addIssue({
        code: 'custom',
        path: ['packages'],
        message: 'all Python release-family packages must use one exact version',
      });
    }
  }
}

export const DraftManifestSchema = z
  .object({ ...ManifestShape, phase: z.literal('draft') })
  .strict()
  .superRefine(validateManifest);

export const SealedManifestSchema = z
  .object({ ...ManifestShape, phase: z.literal('sealed') })
  .strict()
  .superRefine(validateManifest);

export const ManifestSchema = z.union([DraftManifestSchema, SealedManifestSchema]);

export const RegistryArtifactSchema = z
  .object({
    filename: z.string().min(1),
    sha256: Sha256Schema,
  })
  .strict();

const RegistryArtifactSetSchema = z
  .array(RegistryArtifactSchema)
  .superRefine((artifacts, context) => {
    const filenames = new Set<string>();
    for (const [index, artifact] of artifacts.entries()) {
      if (filenames.has(artifact.filename)) {
        context.addIssue({
          code: 'custom',
          path: [index, 'filename'],
          message: `duplicate registry artifact filename ${artifact.filename}`,
        });
      }
      filenames.add(artifact.filename);
    }
  });

export const RegistryObservationSchema = z
  .object({
    schema_version: z.literal(SDK_RELEASE_REGISTRY_OBSERVATION_VERSION),
    manifest_id: Sha256Schema,
    package_name: z.string().min(1),
    version: z.string().min(1),
    registry: z.enum(['npm', 'pypi']),
    state: z.enum(['absent', 'exact', 'conflict']),
    expected_artifacts: RegistryArtifactSetSchema,
    observed_artifacts: RegistryArtifactSetSchema,
    observed_at: z.string().datetime({ offset: true }),
  })
  .strict();

export const ReleaseStateSchema = z.enum([
  'requested',
  'drafting',
  'preparation_pr_open',
  'preparation_failed',
  'sealed',
  'preflight_reconciling',
  'conflict',
  'waiting_for_approval',
  'authorized',
  'publishing',
  'partial',
  'verified',
  'changelog_finalizing',
  'receipted',
  'notified',
]);

export const StateTransitionSchema = z
  .object({
    schema_version: z.literal(SDK_RELEASE_STATE_TRANSITION_VERSION),
    release_id: ReleaseIdSchema,
    from: ReleaseStateSchema,
    to: ReleaseStateSchema,
    occurred_at: z.string().datetime({ offset: true }).optional(),
  })
  .strict();

export const AttemptReceiptSchema = z
  .object({
    schema_version: z.literal(SDK_RELEASE_ATTEMPT_RECEIPT_VERSION),
    release_id: ReleaseIdSchema,
    manifest_id: Sha256Schema,
    attempt: z.number().int().positive(),
    operation: z.enum(['publish', 'resume', 'verify']),
    workflow_run_id: z.number().int().positive(),
    workflow_run_attempt: z.number().int().positive(),
    started_at: z.string().datetime({ offset: true }),
    completed_at: z.string().datetime({ offset: true }),
    transition: StateTransitionSchema,
    observations: z.array(RegistryObservationSchema),
    outcome: z.enum(['partial', 'conflict', 'verified', 'receipted', 'notified']),
  })
  .strict();

export type ReleaseRequest = z.infer<typeof ReleaseRequestSchema>;
export type DraftManifest = z.infer<typeof DraftManifestSchema>;
export type SealedManifest = z.infer<typeof SealedManifestSchema>;
export type ReleaseManifest = z.infer<typeof ManifestSchema>;
export type ReleasePackage = z.infer<typeof PackageSchema>;
export type ReleaseArtifact = z.infer<typeof ArtifactSchema>;
export type RegistryObservation = z.infer<typeof RegistryObservationSchema>;
export type AttemptReceipt = z.infer<typeof AttemptReceiptSchema>;
export type ReleaseState = z.infer<typeof ReleaseStateSchema>;
export type StateTransition = z.infer<typeof StateTransitionSchema>;
