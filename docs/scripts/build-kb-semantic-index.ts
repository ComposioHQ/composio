import { existsSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { getAlgoliaSearchDocuments } from '@/lib/search-index';
import { embedTexts } from '@/lib/knowledge/embeddings';
import {
  buildSemanticArtifact,
  docsContentHashFromRecords,
  semanticRecordFromSearchRecord,
  validateSemanticArtifact,
  type KnowledgeSemanticArtifact,
} from '@/lib/knowledge/semantic-artifact';
import type { KbManifest } from '@/lib/kb/types';

const artifactPath = join(process.cwd(), 'kb', 'semantic-index.json');
const manifest = JSON.parse(
  readFileSync(join(process.cwd(), 'kb', 'manifest.json'), 'utf8'),
) as KbManifest;
if (manifest.source.repository !== 'ComposioHQ/support-knowledge') {
  throw new Error(
    `Refusing to build embeddings for transitional source ${manifest.source.repository}; import support-knowledge first`,
  );
}

const records = (await getAlgoliaSearchDocuments())
  .filter(record => record.source_type === 'kb' || record.source_type === 'docs')
  .sort((left, right) => left.objectID.localeCompare(right.objectID));
const contentHashes = new Map(
  records.map(record => {
    const semantic = semanticRecordFromSearchRecord(record);
    return [semantic.objectID, semantic.contentHash];
  }),
);
const docsContentHash = docsContentHashFromRecords(
  records.map(semanticRecordFromSearchRecord),
);

if (process.argv.includes('--check')) {
  if (!existsSync(artifactPath)) throw new Error('KB semantic artifact is missing');
  const artifact = JSON.parse(readFileSync(artifactPath, 'utf8')) as KnowledgeSemanticArtifact;
  validateSemanticArtifact(artifact, {
    supportKnowledgeCommit: manifest.source.commit,
    docsContentHash,
    contentHashes,
  });
  console.log(`KB semantic artifact is current: ${artifact.records.length} records.`);
  process.exit(0);
}

const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) throw new Error('OPENAI_API_KEY is required to build the KB semantic artifact');
const previousArtifact = existsSync(artifactPath)
  ? JSON.parse(readFileSync(artifactPath, 'utf8')) as KnowledgeSemanticArtifact
  : undefined;

const artifact = await buildSemanticArtifact({
  records,
  supportKnowledgeCommit: manifest.source.commit,
  docsContentHash,
  builtAt: new Date().toISOString(),
  previousArtifact,
  embed: async texts => {
    const vectors: number[][] = [];
    for (let start = 0; start < texts.length; start += 64) {
      vectors.push(...await embedTexts(texts.slice(start, start + 64), { apiKey }));
    }
    return vectors;
  },
});

const temporaryPath = `${artifactPath}.tmp-${process.pid}`;
try {
  writeFileSync(temporaryPath, `${JSON.stringify(artifact)}\n`, 'utf8');
  renameSync(temporaryPath, artifactPath);
} finally {
  rmSync(temporaryPath, { force: true });
}
console.log(`Built KB semantic artifact: ${artifact.records.length} records.`);
