import { window, workspace, type ExtensionContext } from 'vscode';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { CacheKey, Timeout } from './config';
import { dirname } from 'node:path';

type CacheData = Record<string, string>;

export function initCache(context: ExtensionContext) {
  function getCache() {
    return context.globalState.get<CacheData>(CacheKey, {});
  }

  function setCache(data: CacheData) {
    return context.globalState.update(CacheKey, data);
  }

  return { getCache, setCache };
}

export function genMd5(filePath: string) {
  try {
    const content = readFileSync(filePath);
    return createHash('md5').update(content).digest('hex');
  } catch {
    return undefined;
  }
}

export function getCurrentWorkspacePath() {
  if (!workspace.workspaceFolders) {
    return undefined;
  }
  const activeEditor = window.activeTextEditor;
  let workspacePath: string;

  if (activeEditor && activeEditor.document.fileName.endsWith('package.json')) {
    workspacePath = dirname(activeEditor.document.fileName);
  } else {
    workspacePath = workspace.workspaceFolders[0].uri.fsPath;
  }

  return workspacePath;
}

export function runCommand(workspacePath: string, command: string) {
  return new Promise<void>((resolve, reject) => {
    const terminal = window.createTerminal({
      name: 'Upgrade Dependencies',
      cwd: workspacePath,
    });

    terminal.sendText(command);

    let isResolved = false;

    const closeDisposable = window.onDidEndTerminalShellExecution((event) => {
      if (event.terminal === terminal && !isResolved) {
        isResolved = true;
        closeDisposable.dispose();
        terminal.dispose();
        clearTimeout(timer);
        resolve();
      }
    });

    const timer = setTimeout(() => {
      if (!isResolved) {
        isResolved = true;
        closeDisposable.dispose();
        terminal.dispose();
        clearTimeout(timer);
        reject();
      }
    }, Timeout);
  });
}
