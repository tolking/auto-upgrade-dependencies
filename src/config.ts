import { workspace } from 'vscode';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export type PackageManager = 'npm' | 'yarn' | 'pnpm';
type PackageManagerConfigKeys = 'lockFile' | 'installCommand' | 'upgradeCommand';

export const CacheKey = 'Upgrade_Dependencies_Cache';
export const Timeout = 10 * 60 * 1000;

const PackageManagerConfig: Record<PackageManager, Record<PackageManagerConfigKeys, string>> = {
  npm: {
    lockFile: 'package-lock.json',
    installCommand: 'npm install',
    upgradeCommand: 'npm update',
  },
  yarn: {
    lockFile: 'yarn.lock',
    installCommand: 'yarn install',
    upgradeCommand: 'yarn upgrade',
  },
  pnpm: {
    lockFile: 'pnpm-lock.yaml',
    installCommand: 'pnpm i',
    upgradeCommand: 'pnpm update',
  },
};

export function initConfig(workspacePath: string) {
  const config = workspace.getConfiguration('upgradeDependencies');
  const autoUpdate = config.get('autoUpdate', false);
  let packageManager: PackageManager = config.get('packageManager', 'npm');
  const detectedFromLock = detectPackageManagerFromLockFiles(workspacePath);
  
  if (detectedFromLock) {
    packageManager = detectedFromLock;
  } else {
    const detectedFromPackageJson = getPackageManagerFromPackageJson(workspacePath);

    if (detectedFromPackageJson) {
      packageManager = detectedFromPackageJson;
    }
  }

  return {
    ...PackageManagerConfig[packageManager],
    packageManager,
    autoUpdate,
  };
}

function detectPackageManagerFromLockFiles(workspacePath: string) {
  const lockFiles = Object.entries(PackageManagerConfig).filter(([, config]) => {
    const lockFilePath = join(workspacePath, config.lockFile);
    return existsSync(lockFilePath);
  });

  if (lockFiles.length === 1) {
    return lockFiles[0][0] as PackageManager;
  }

  return undefined;
}

function getPackageManagerFromPackageJson(workspacePath: string) {
  const packageJsonPath = join(workspacePath, 'package.json');
  
  if (!existsSync(packageJsonPath)) {
    return undefined;
  }

  try {
    const packageJsonContent = readFileSync(packageJsonPath, 'utf-8');
    const content = JSON.parse(packageJsonContent);
    
    if (content.packageManager) {
      const packageManager = content.packageManager.split('@')[0] as PackageManager;

      if (packageManager in PackageManagerConfig) {
        return packageManager;
      }
    }
  } catch {
    // Ignore JSON parse errors
  }

  return undefined;
}
