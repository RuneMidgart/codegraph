import * as fs from 'fs';
import * as path from 'path';
import { findNearestCodeGraphRoot } from '../directory';
import { ToolHandler, ToolResult, tools } from '../mcp/tools';

export interface ParseCliToolArgsOptions {
  input?: string;
  inputFile?: string;
  stdin?: boolean;
  readStdin?: () => string;
}

export interface ExecuteCliToolOptions {
  tool: string;
  path?: string;
  args: Record<string, unknown>;
  rawJson?: boolean;
}

export interface CliToolOutput {
  stdout: string;
  exitCode: number;
}

const TOOL_NAMES = new Set(tools.map((tool) => tool.name));

export function normalizeCliToolName(tool: string): string {
  const normalized = tool.startsWith('codegraph_') ? tool : `codegraph_${tool}`;
  if (TOOL_NAMES.has(normalized)) {
    return normalized;
  }
  const known = tools
    .map((t) => t.name.replace(/^codegraph_/, ''))
    .sort()
    .join(', ');
  throw new Error(`Unknown CodeGraph tool "${tool}". Known tools: ${known}`);
}

export function parseCliToolArgs(opts: ParseCliToolArgsOptions): Record<string, unknown> {
  const sources = [
    opts.input !== undefined,
    opts.inputFile !== undefined,
    opts.stdin === true,
  ].filter(Boolean).length;

  if (sources > 1) {
    throw new Error('Use only one of --input, --input-file, or --stdin.');
  }

  let raw: string | undefined;
  if (opts.input !== undefined) {
    raw = opts.input;
  } else if (opts.inputFile !== undefined) {
    raw = opts.inputFile === '-'
      ? readStdin(opts)
      : fs.readFileSync(path.resolve(opts.inputFile), 'utf-8');
  } else if (opts.stdin) {
    raw = readStdin(opts);
  }

  if (raw === undefined || raw.trim() === '') {
    return {};
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Invalid JSON input: ${msg}`);
  }

  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('CodeGraph tool input must be a JSON object.');
  }

  return parsed as Record<string, unknown>;
}

export async function executeCliTool(opts: ExecuteCliToolOptions): Promise<CliToolOutput> {
  const toolName = normalizeCliToolName(opts.tool);
  const args = { ...opts.args };
  if (args.projectPath == null) {
    args.projectPath = resolveCliProjectPath(opts.path);
  }

  const handler = new ToolHandler(null);
  try {
    const result = await handler.execute(toolName, args);
    return formatToolResultForCli(result, opts.rawJson === true);
  } finally {
    handler.closeAll();
  }
}

export function formatToolResultForCli(result: ToolResult, rawJson: boolean): CliToolOutput {
  const exitCode = result.isError ? 1 : 0;
  if (rawJson) {
    return {
      stdout: JSON.stringify(result, null, 2) + '\n',
      exitCode,
    };
  }

  const text = result.content.map((part) => part.text).join('\n');
  return {
    stdout: text.endsWith('\n') ? text : text + '\n',
    exitCode,
  };
}

function resolveCliProjectPath(pathArg?: string): string {
  const absolute = path.resolve(pathArg || process.cwd());
  return findNearestCodeGraphRoot(absolute) ?? absolute;
}

function readStdin(opts: ParseCliToolArgsOptions): string {
  if (opts.readStdin) {
    return opts.readStdin();
  }
  return fs.readFileSync(0, 'utf-8');
}
