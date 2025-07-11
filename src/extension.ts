import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { t } from './locale';

type CacheData = Record<string, string>;

export function activate(context: vscode.ExtensionContext) {
    const getCacheData = (): CacheData => {
        return context.globalState.get('pnpmLockMd5Cache', {});
    };

    const setCacheData = (data: CacheData) => {
        context.globalState.update('pnpmLockMd5Cache', data);
    };

    const calculateMd5 = (filePath: string): string | null => {
        try {
            const content = fs.readFileSync(filePath);
            return crypto.createHash('md5').update(content).digest('hex');
        } catch {
            return null;
        }
    };

    const getPackageManager = (): string => {
        const config = vscode.workspace.getConfiguration('upgradeDependencies');
        return config.get('packageManager', 'pnpm');
    };

    const getAutoUpdate = (): boolean => {
        const config = vscode.workspace.getConfiguration('upgradeDependencies');
        return config.get('autoUpdate', false);
    };

    const getLockFileName = (packageManager: string): string => {
        switch (packageManager) {
            case 'npm':
                return 'package-lock.json';
            case 'yarn':
                return 'yarn.lock';
            case 'pnpm':
                return 'pnpm-lock.yaml';
            default:
                return 'pnpm-lock.yaml';
        }
    };

    const getInstallCommand = (packageManager: string): string => {
        switch (packageManager) {
            case 'npm':
                return 'npm install';
            case 'yarn':
                return 'yarn install';
            case 'pnpm':
                return 'pnpm i';
            default:
                return 'pnpm i';
        }
    };

    const runPnpmInstall = (workspacePath: string) => {
        const packageManager = getPackageManager();
        const installCommand = getInstallCommand(packageManager);
        
        return vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: t('updating.dependencies', { name: packageManager}),
            cancellable: false,
        }, async () => {
            const terminal = vscode.window.createTerminal({
                name: 'Upgrade Dependencies',
                cwd: workspacePath
            });
            // terminal.show();
            terminal.sendText(`${installCommand}`);
            
            return new Promise<void>((resolve, reject) => {
                let isResolved = false;
                
                const closeDisposable = vscode.window.onDidEndTerminalShellExecution((event) => {
                    if (event.terminal === terminal && !isResolved) {
                        closeDisposable.dispose();
                        isResolved = true;
                        terminal.dispose();
                        resolve();
                    }
                });

                setTimeout(() => {
                    if (!isResolved) {
                        closeDisposable.dispose();
                        isResolved = true;
                        terminal.dispose();
                        reject(new Error('命令执行超时'));
                    }
                }, 10 * 60 * 1000);
            });
        });
    };

    const checkAndUpgradeDependencies = async (workspacePath: string) => {
        const packageJsonPath = path.join(workspacePath, 'package.json');
        const packageManager = getPackageManager();
        const lockFileName = getLockFileName(packageManager);
        const lockFilePath = path.join(workspacePath, lockFileName);

        if (!fs.existsSync(packageJsonPath)) {
            return;
        }

        if (!fs.existsSync(lockFilePath)) {
            return;
        }

        const currentMd5 = calculateMd5(lockFilePath);
        if (!currentMd5) {
            return;
        }

        const cacheData = getCacheData();
        const cachedMd5 = cacheData[workspacePath];

        if (cachedMd5 !== currentMd5) {
            const autoUpdate = getAutoUpdate();
            let shouldUpdate = false;

            if (autoUpdate) {
                shouldUpdate = true;
                vscode.window.showInformationMessage(t('lock.file.changed.auto', { name: lockFileName}));
            } else {
                const choice = await vscode.window.showInformationMessage(
                    t('lock.file.changed', { name: lockFileName}),
                    t('update'),
                    t('later')
                );
                shouldUpdate = choice === t('update');
            }

            if (shouldUpdate) {
                try {
                    await runPnpmInstall(workspacePath);
                    vscode.window.showInformationMessage(t('update.completed'), { modal: false });

                    setTimeout(() => {
                        vscode.commands.executeCommand('workbench.action.closeNotification');
                    }, 3000);

                    cacheData[workspacePath] = currentMd5;
                    setCacheData(cacheData);
                } catch {
                    vscode.window.showErrorMessage(t('update.failed'));
                }
            }
        }
    };

    const watchWorkspace = () => {
        if (!vscode.workspace.workspaceFolders) {
            return;
        }

        vscode.workspace.workspaceFolders.forEach(folder => {
            const workspacePath = folder.uri.fsPath;
            
            checkAndUpgradeDependencies(workspacePath);

            const packageManager = getPackageManager();
            const lockFileName = getLockFileName(packageManager);

            const watcher = vscode.workspace.createFileSystemWatcher(
                new vscode.RelativePattern(folder, lockFileName)
            );

            watcher.onDidChange(() => {
                checkAndUpgradeDependencies(workspacePath);
            });

            context.subscriptions.push(watcher);
        });
    };

    const disposable = vscode.commands.registerCommand('extension.upgradeDependencies', async () => {
        if (!vscode.workspace.workspaceFolders) {
            vscode.window.showWarningMessage(t('open.workspace.first'));
            return;
        }

        const workspacePath = vscode.workspace.workspaceFolders[0].uri.fsPath;
        await checkAndUpgradeDependencies(workspacePath);
    });

    const manualUpdateDisposable = vscode.commands.registerCommand('extension.manualUpdateDependencies', async () => {
        if (!vscode.workspace.workspaceFolders) {
            vscode.window.showWarningMessage(t('open.workspace.first'));
            return;
        }

        const workspacePath = vscode.workspace.workspaceFolders[0].uri.fsPath;
        const packageManager = getPackageManager();
        
        try {
            await runPnpmInstall(workspacePath);
            vscode.window.showInformationMessage(t('update.completed'));
            
            const lockFileName = getLockFileName(packageManager);
            const lockFilePath = path.join(workspacePath, lockFileName);
            const currentMd5 = calculateMd5(lockFilePath);
            if (currentMd5) {
                const cacheData = getCacheData();
                cacheData[workspacePath] = currentMd5;
                setCacheData(cacheData);
            }
        } catch {
            vscode.window.showErrorMessage(t('update.failed'));
        }
    });

    const manualUpgradeDisposable = vscode.commands.registerCommand('extension.manualUpgradeDependencies', async () => {
        if (!vscode.workspace.workspaceFolders) {
            vscode.window.showWarningMessage(t('open.workspace.first'));
            return;
        }

        const workspacePath = vscode.workspace.workspaceFolders[0].uri.fsPath;
        const packageManager = getPackageManager();
        
        const getUpgradeCommand = (packageManager: string): string => {
            switch (packageManager) {
                case 'npm':
                    return 'npm update';
                case 'yarn':
                    return 'yarn upgrade';
                case 'pnpm':
                    return 'pnpm update';
                default:
                    return 'pnpm update';
            }
        };

        const upgradeCommand = getUpgradeCommand(packageManager);
        
        try {
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: t('upgrading.dependencies', { name: packageManager}),
                cancellable: false
            }, async () => {
                const terminal = vscode.window.createTerminal({
                    name: 'Upgrade Dependencies',
                    cwd: workspacePath
                });
                terminal.show();
                terminal.sendText(`${upgradeCommand}`);
                
                return new Promise<void>((resolve) => {
                    let isResolved = false;
                    
                    const closeDisposable = vscode.window.onDidEndTerminalShellExecution((event) => {
                        if (event.terminal === terminal && !isResolved) {
                            closeDisposable.dispose();
                            isResolved = true;
                            terminal.dispose();
                            resolve();
                        }
                    });
                });
            });
            
            vscode.window.showInformationMessage(t('upgrade.completed'));

            const lockFileName = getLockFileName(packageManager);
            const lockFilePath = path.join(workspacePath, lockFileName);
            const currentMd5 = calculateMd5(lockFilePath);
            if (currentMd5) {
                const cacheData = getCacheData();
                cacheData[workspacePath] = currentMd5;
                setCacheData(cacheData);
            }
        } catch {
            vscode.window.showErrorMessage(t('upgrade.failed'));
        }
    });

    context.subscriptions.push(disposable);
    context.subscriptions.push(manualUpdateDisposable);
    context.subscriptions.push(manualUpgradeDisposable);

    watchWorkspace();

    vscode.workspace.onDidChangeWorkspaceFolders(() => {
        watchWorkspace();
    });
}

export function deactivate() {}
