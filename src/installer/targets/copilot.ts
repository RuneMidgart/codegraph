/**
 * GitHub Copilot CLI target.
 *
 * Copilot CLI agent skills are directories that contain a SKILL.md file.
 * GitHub documents personal skills under ~/.copilot/skills and project skills
 * under .github/skills. This target writes a CodeGraph skill that uses the
 * CLI tool bridge instead of MCP, for environments where MCP is disabled.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  AgentTarget,
  DetectionResult,
  InstallOptions,
  Location,
  WriteResult,
} from './types';
import { atomicWriteFileSync } from './shared';

const SKILL_NAME = 'codegraph';
const SKILL_MARKER = '<!-- CODEGRAPH_COPILOT_SKILL -->';

function skillsRoot(loc: Location): string {
  return loc === 'global'
    ? path.join(os.homedir(), '.copilot', 'skills')
    : path.join(process.cwd(), '.github', 'skills');
}

function skillDir(loc: Location): string {
  return path.join(skillsRoot(loc), SKILL_NAME);
}

function skillPath(loc: Location): string {
  return path.join(skillDir(loc), 'SKILL.md');
}

class GitHubCopilotTarget implements AgentTarget {
  readonly id = 'copilot' as const;
  readonly displayName = 'GitHub Copilot CLI';
  readonly docsUrl = 'https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/add-skills';

  supportsLocation(_loc: Location): boolean {
    return true;
  }

  detect(loc: Location): DetectionResult {
    const file = skillPath(loc);
    const content = readText(file);
    return {
      installed: fs.existsSync(path.dirname(skillsRoot(loc))) || fs.existsSync(skillsRoot(loc)) || fs.existsSync(file),
      alreadyConfigured: content.includes(SKILL_MARKER),
      configPath: file,
    };
  }

  install(loc: Location, _opts: InstallOptions): WriteResult {
    const file = writeSkill(loc);
    const notes = file.action === 'unchanged'
      ? ['Run /skills reload in Copilot CLI if this skill was added during an active session.']
      : ['Run /skills reload in Copilot CLI, or restart the session, to load the CodeGraph skill.'];
    return { files: [file], notes };
  }

  uninstall(loc: Location): WriteResult {
    const file = skillPath(loc);
    if (!fs.existsSync(file)) {
      return { files: [{ path: file, action: 'not-found' }] };
    }

    const content = readText(file);
    if (!content.includes(SKILL_MARKER)) {
      return { files: [{ path: file, action: 'not-found' }] };
    }

    fs.rmSync(skillDir(loc), { recursive: true, force: true });
    return { files: [{ path: skillDir(loc), action: 'removed' }] };
  }

  printConfig(loc: Location): string {
    return [
      `# Write to ${skillPath(loc)}`,
      '',
      COPILOT_SKILL_TEMPLATE,
    ].join('\n');
  }

  describePaths(loc: Location): string[] {
    return [skillPath(loc)];
  }
}

function readText(file: string): string {
  try {
    return fs.readFileSync(file, 'utf-8');
  } catch {
    return '';
  }
}

function writeSkill(loc: Location): WriteResult['files'][number] {
  const file = skillPath(loc);
  const dir = path.dirname(file);
  const existed = fs.existsSync(file);
  const existing = readText(file);

  if (existing && !existing.includes(SKILL_MARKER)) {
    return { path: file, action: 'unchanged' };
  }

  if (existing === COPILOT_SKILL_TEMPLATE) {
    return { path: file, action: 'unchanged' };
  }

  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  atomicWriteFileSync(file, COPILOT_SKILL_TEMPLATE);
  return { path: file, action: existed ? 'updated' : 'created' };
}

const COPILOT_SKILL_TEMPLATE = `---
name: codegraph
description: Use CodeGraph's local CLI for structural codebase questions when MCP tools are unavailable or disabled. Use for symbol search, callers, callees, impact analysis, call traces, focused context, symbol source, and indexed file structure.
allowed-tools: shell
---

${SKILL_MARKER}

# CodeGraph CLI Skill

Use this skill for structural code questions: where a symbol is defined, what calls it, what it calls, how one symbol reaches another, what changing a symbol affects, which files are indexed, or what context is relevant to a coding task.

CodeGraph must be initialized in the target repository. If a command reports that CodeGraph is not initialized, ask the user whether to run:

\`\`\`bash
codegraph init -i
\`\`\`

Run commands from the repository root unless the user gives a different project path. Prefer these one-shot CLI calls over grep/read loops for structural questions:

\`\`\`bash
codegraph tool context --path "$PWD" --input '{"task":"describe the task or code area","maxNodes":20,"includeCode":true}'
codegraph tool explore --path "$PWD" --input '{"query":"symbol names file names or short code terms","maxFiles":8}'
codegraph tool search --path "$PWD" --input '{"query":"SymbolName","limit":10}'
codegraph tool node --path "$PWD" --input '{"symbol":"SymbolName","includeCode":true}'
codegraph tool trace --path "$PWD" --input '{"from":"SourceSymbol","to":"DestinationSymbol"}'
codegraph tool callers --path "$PWD" --input '{"symbol":"SymbolName","limit":20}'
codegraph tool callees --path "$PWD" --input '{"symbol":"SymbolName","limit":20}'
codegraph tool impact --path "$PWD" --input '{"symbol":"SymbolName","depth":2}'
codegraph tool files --path "$PWD" --input '{"format":"tree","includeMetadata":true,"maxDepth":3}'
codegraph tool status --path "$PWD"
\`\`\`

Rules of thumb:

- For architecture, feature, or bug-context questions, call \`codegraph tool context\` first.
- For a specific flow from one symbol to another, call \`codegraph tool trace\` first.
- Use \`codegraph tool explore\` after context when you need source for several related symbols or files.
- Use native text search for literal strings, comments, log messages, or when CodeGraph returns no structural match.
- Keep JSON inputs focused. Do not pass large source files or command output as JSON arguments.
`;

export const copilotTarget: AgentTarget = new GitHubCopilotTarget();
