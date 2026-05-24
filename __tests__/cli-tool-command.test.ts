import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  executeCliTool,
  formatToolResultForCli,
  normalizeCliToolName,
  parseCliToolArgs,
} from '../src/cli/tool-command';

const tmpDirs: string[] = [];

function mkTmpProject(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cg-cli-tool-'));
  tmpDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tmpDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('CLI tool command helpers', () => {
  it('normalizes short and fully-qualified tool names', () => {
    expect(normalizeCliToolName('context')).toBe('codegraph_context');
    expect(normalizeCliToolName('codegraph_trace')).toBe('codegraph_trace');
  });

  it('rejects unknown tool names with the known tool list', () => {
    expect(() => normalizeCliToolName('bogus')).toThrow(/Unknown CodeGraph tool "bogus"/);
    expect(() => normalizeCliToolName('bogus')).toThrow(/context/);
  });

  it('parses a JSON object input and rejects arrays', () => {
    expect(parseCliToolArgs({ input: '{"task":"map installer"}' })).toEqual({ task: 'map installer' });
    expect(() => parseCliToolArgs({ input: '[]' })).toThrow(/must be a JSON object/);
  });

  it('rejects multiple input sources', () => {
    const file = path.join(mkTmpProject(), 'args.json');
    fs.writeFileSync(file, '{}\n');
    expect(() => parseCliToolArgs({ input: '{}', inputFile: file })).toThrow(/Use only one/);
  });

  it('formats plain text and raw JSON output', () => {
    const result = { content: [{ type: 'text' as const, text: 'hello' }] };
    expect(formatToolResultForCli(result, false)).toEqual({ stdout: 'hello\n', exitCode: 0 });
    expect(formatToolResultForCli({ ...result, isError: true }, false)).toEqual({ stdout: 'hello\n', exitCode: 1 });
    expect(formatToolResultForCli(result, true).stdout).toContain('"content"');
  });
});

describe('executeCliTool', () => {
  it('returns ToolHandler errors through the CLI path', async () => {
    const project = mkTmpProject();

    const result = await executeCliTool({
      tool: 'status',
      path: project,
      args: {},
      rawJson: false,
    });

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain('CodeGraph not initialized');
  });
});
