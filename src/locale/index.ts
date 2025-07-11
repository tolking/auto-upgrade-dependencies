import { env } from 'vscode';
import En from './en';
import ZhCn from './zh-cn';

type TranslateKeys = keyof typeof En['en'];

export function t(key: TranslateKeys, option?: Record<string, string | number>) {
  const localeConfig = Object.assign({}, En, ZhCn);
  const lang = env.language as keyof typeof localeConfig;
  const locale = localeConfig[lang] || localeConfig['en'];
  
  return locale[key].replace(
    /\{(\w+)\}/g,
    (_, key) => `${option?.[key] ?? `{${key}}`}`
  );
}
