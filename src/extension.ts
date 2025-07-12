import * as vscode from 'vscode';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { t } from './locale';
import { initConfig, type PackageManager } from './config';
import { genMd5, getCurrentWorkspacePath, initCache, runCommand } from './utils';

export function activate(context: vscode.ExtensionContext) {
  const { getCache, setCache } = initCache(context);

  const manualInstallDisposable = vscode.commands.registerCommand(
    'extension.manualInstallDependencies',
    async () => {
      const workspacePath = getCurrentWorkspacePath();
      
      if (!workspacePath) {
        return vscode.window.showWarningMessage(t('open.workspace.first'));
      }
      const { lockFile, packageManager, installCommand } = initConfig(workspacePath);

      upgradeDependencies(workspacePath, installCommand, packageManager, lockFile);
    },
  );

  const manualUpgradeDisposable = vscode.commands.registerCommand(
    'extension.manualUpgradeDependencies',
    async () => {
      const workspacePath = getCurrentWorkspacePath();
      
      if (!workspacePath) {
        return vscode.window.showWarningMessage(t('open.workspace.first'));
      }
      const { packageManager, lockFile, upgradeCommand } = initConfig(workspacePath);

      upgradeDependencies(workspacePath, upgradeCommand, packageManager, lockFile);
    },
  );

  function watchWorkspace() {
    if (!vscode.workspace.workspaceFolders) {
      return;
    }

    vscode.workspace.workspaceFolders.forEach((folder) => {
      const workspacePath = folder.uri.fsPath;
      const { lockFile } = initConfig(workspacePath);

      checkAndUpgradeDependencies(workspacePath);

      const watcher = vscode.workspace.createFileSystemWatcher(
        new vscode.RelativePattern(folder, lockFile),
      );

      watcher.onDidChange(() => {
        checkAndUpgradeDependencies(workspacePath);
      });

      context.subscriptions.push(watcher);
    });
  };

  async function checkAndUpgradeDependencies(workspacePath: string) {
    const { autoUpdate, packageManager, lockFile, installCommand } = initConfig(workspacePath);
    const packageJsonPath = join(workspacePath, 'package.json');
    const lockFilePath = join(workspacePath, lockFile);

    if (!existsSync(packageJsonPath) || !existsSync(lockFilePath)) {
      return;
    }

    const currentMd5 = genMd5(lockFilePath);
    if (!currentMd5) {
      return;
    }

    const cacheData = getCache();
    const cachedMd5 = cacheData[workspacePath];

    if (cachedMd5 !== currentMd5) {
      let shouldUpdate = autoUpdate;

      if (!autoUpdate) {
        const choice = await vscode.window.showInformationMessage(
          t('lock.file.changed', { name: lockFile }),
          t('update'),
          t('later'),
        );
        shouldUpdate = choice === t('update');
      }

      if (shouldUpdate) {
        upgradeDependencies(workspacePath, installCommand, packageManager, lockFile);
      }
    }
  };

  async function upgradeDependencies(workspacePath: string, command: string, packageManager: PackageManager, lockFile: string) {
    try {
      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: t('updating.dependencies', { name: packageManager }),
          cancellable: false,
        },
        () => runCommand(workspacePath, command),
      );

      vscode.window.showInformationMessage(t('upgrade.completed'), { modal: false });

      const lockFilePath = join(workspacePath, lockFile);
      const currentMd5 = genMd5(lockFilePath);

      if (currentMd5) {
        const cacheData = getCache();
        cacheData[workspacePath] = currentMd5;
        setCache(cacheData);
      }
    } catch {
      vscode.window.showErrorMessage(t('upgrade.failed'));
    }
  }

  context.subscriptions.push(manualInstallDisposable);
  context.subscriptions.push(manualUpgradeDisposable);

  watchWorkspace();

  vscode.workspace.onDidChangeWorkspaceFolders(() => {
    watchWorkspace();
  });
}
