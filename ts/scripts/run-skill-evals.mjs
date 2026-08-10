#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const repoRoot = process.cwd();
const skillsRoot = path.join(repoRoot, 'skills');

const die = message => {
  console.error(message);
  process.exit(1);
};

const discoverSuites = () => {
  if (!fs.existsSync(skillsRoot)) return [];
  return fs
    .readdirSync(skillsRoot, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => {
      const skill = entry.name;
      const evalsDir = path.join(skillsRoot, skill, 'evals');
      const casesFile = path.join(evalsDir, 'cases.json');
      if (!fs.existsSync(casesFile)) return null;
      return {
        skill,
        evalsDir,
        data: JSON.parse(fs.readFileSync(casesFile, 'utf8')),
      };
    })
    .filter(Boolean);
};

const validateSuites = suites => {
  const errors = [];
  const seen = new Set();
  const fail = message => errors.push(message);

  for (const suite of suites) {
    const skillFile = path.join(skillsRoot, suite.skill, 'SKILL.md');
    if (!fs.existsSync(skillFile)) fail(`${suite.skill}: missing SKILL.md`);
    if (suite.data.version !== 1) fail(`${suite.skill}: cases.json version must be 1`);
    if (!Array.isArray(suite.data.cases) || suite.data.cases.length === 0) {
      fail(`${suite.skill}: cases must be a non-empty array`);
      continue;
    }

    for (const evalCase of suite.data.cases) {
      const prefix = `${suite.skill}/${evalCase.id ?? '<missing-id>'}`;
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(evalCase.id ?? '')) {
        fail(`${prefix}: id must be a lowercase kebab-case slug`);
      }
      if (seen.has(prefix)) fail(`${prefix}: duplicate case id`);
      seen.add(prefix);
      if (!['dry', 'live'].includes(evalCase.mode)) fail(`${prefix}: mode must be dry or live`);
      if (typeof evalCase.prompt !== 'string' || evalCase.prompt.trim().length < 10) {
        fail(`${prefix}: prompt must be at least 10 characters`);
      }
      if (
        !Number.isInteger(evalCase.repetitions) ||
        evalCase.repetitions < 1 ||
        evalCase.repetitions > 5
      ) {
        fail(`${prefix}: repetitions must be an integer from 1 to 5`);
      }
      if (evalCase.critical && evalCase.repetitions < 3) {
        fail(`${prefix}: critical cases require at least 3 repetitions`);
      }

      const assertions = [...(evalCase.mustMatch ?? []), ...(evalCase.mustNotMatch ?? [])];
      if (assertions.length === 0) fail(`${prefix}: at least one assertion is required`);
      for (const assertion of assertions) {
        if (typeof assertion.pattern !== 'string' || typeof assertion.message !== 'string') {
          fail(`${prefix}: each assertion needs pattern and message strings`);
          continue;
        }
        try {
          new RegExp(assertion.pattern, assertion.flags ?? '');
        } catch (error) {
          fail(`${prefix}: invalid regex ${JSON.stringify(assertion.pattern)}: ${error.message}`);
        }
      }

      for (const source of evalCase.sources ?? []) {
        const resolved = path.resolve(suite.evalsDir, source);
        if (!resolved.startsWith(`${suite.evalsDir}${path.sep}`) || !fs.existsSync(resolved)) {
          fail(`${prefix}: missing or out-of-tree source ${source}`);
        }
      }
    }
  }

  if (errors.length > 0) {
    die(`Skill eval validation failed:\n${errors.map(error => `- ${error}`).join('\n')}`);
  }
};

const findCase = (suites, qualifiedId) => {
  const [skill, ...idParts] = qualifiedId.split('/');
  const id = idParts.join('/');
  const suite = suites.find(candidate => candidate.skill === skill);
  const evalCase = suite?.data.cases.find(candidate => candidate.id === id);
  if (!suite || !evalCase) die(`Unknown skill eval case: ${qualifiedId}`);
  return { suite, evalCase };
};

const grade = (qualifiedId, outputFile, suites) => {
  const { evalCase } = findCase(suites, qualifiedId);
  if (!outputFile || !fs.existsSync(outputFile)) {
    die(`${qualifiedId}: missing output file ${outputFile ?? ''}`);
  }
  const output = fs.readFileSync(outputFile, 'utf8').trim();
  const failures = [];
  if (output.length < 20) failures.push('output is empty or too short');
  if (/\b(?:ck|sk)_(?!(?:REPLACE|YOUR|EXAMPLE))[A-Za-z0-9_-]{16,}\b/.test(output)) {
    failures.push('output contains a credential-like value');
  }

  for (const assertion of evalCase.mustMatch ?? []) {
    if (!new RegExp(assertion.pattern, assertion.flags ?? '').test(output)) {
      failures.push(`missing: ${assertion.message}`);
    }
  }
  for (const assertion of evalCase.mustNotMatch ?? []) {
    if (new RegExp(assertion.pattern, assertion.flags ?? '').test(output)) {
      failures.push(`forbidden: ${assertion.message}`);
    }
  }

  if (failures.length > 0) {
    die(`${qualifiedId}: FAIL\n${failures.map(failure => `- ${failure}`).join('\n')}`);
  }
  console.log(`${qualifiedId}: PASS`);
};

const renderPrompt = (qualifiedId, suites) => {
  const { suite, evalCase } = findCase(suites, qualifiedId);
  const sources = (evalCase.sources ?? []).map(source =>
    path.posix.join('skills', suite.skill, 'evals', source)
  );
  const lines = [
    '# Skill eval input',
    '',
    `Skill: ${suite.skill}`,
    `Mode: ${evalCase.mode}`,
    '',
    '## User prompt',
    '',
    evalCase.prompt,
    '',
    '## Source fixtures',
    '',
    ...(sources.length > 0 ? sources.map(source => `- ${source}`) : ['- None']),
  ];
  console.log(lines.join('\n'));
};

let suites;
try {
  suites = discoverSuites();
} catch (error) {
  die(`Could not load skill eval cases: ${error.message}`);
}

if (suites.length === 0) die('No skill eval suites found under skills/*/evals/cases.json');
validateSuites(suites);

const [command = 'validate', ...args] = process.argv.slice(2);
if (command === 'validate') {
  const caseCount = suites.reduce((total, suite) => total + suite.data.cases.length, 0);
  console.log(`Skill eval validation passed (${caseCount} cases across ${suites.length} skills).`);
} else if (command === 'matrix') {
  const include = suites.flatMap(suite =>
    suite.data.cases
      .filter(evalCase => evalCase.mode === 'dry')
      .flatMap(evalCase =>
        Array.from({ length: evalCase.repetitions }, (_, index) => ({
          skill: suite.skill,
          case: evalCase.id,
          repetition: index + 1,
        }))
      )
  );
  console.log(JSON.stringify({ include }));
} else if (command === 'has-dry-cases') {
  console.log(suites.some(suite => suite.data.cases.some(evalCase => evalCase.mode === 'dry')));
} else if (command === 'prompt') {
  renderPrompt(args[0], suites);
} else if (command === 'grade') {
  grade(args[0], args[1], suites);
} else {
  die(`Unknown command ${command}. Use validate, matrix, has-dry-cases, prompt, or grade.`);
}
