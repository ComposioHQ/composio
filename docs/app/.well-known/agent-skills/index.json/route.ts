import { createHash } from 'crypto';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { NextResponse } from 'next/server';
import { AGENT_SKILLS_SCHEMA, agentSkills } from '@/lib/agent-discovery';

async function digestSkill(name: string) {
  const filePath = join(
    process.cwd(),
    'public',
    '.well-known',
    'agent-skills',
    name,
    'SKILL.md'
  );
  const raw = await readFile(filePath);
  return `sha256:${createHash('sha256').update(raw).digest('hex')}`;
}

export async function GET() {
  const skills = await Promise.all(
    agentSkills.map(async (skill) => ({
      ...skill,
      type: 'skill-md',
      url: `/.well-known/agent-skills/${skill.name}/SKILL.md`,
      digest: await digestSkill(skill.name),
    }))
  );

  return NextResponse.json(
    {
      $schema: AGENT_SKILLS_SCHEMA,
      skills,
    },
    {
      headers: {
        'Cache-Control': 'public, max-age=300, stale-while-revalidate=3600',
      },
    }
  );
}
