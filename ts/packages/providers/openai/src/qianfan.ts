import { OpenAI } from 'openai';

export const QIANFAN_BASE_URL = 'https://qianfan.baidubce.com/v2/';

export type QianfanConfigOptions = {
  apiKey: string;
  appid?: string;
  baseURL?: string;
  defaultHeaders?: Record<string, string>;
};

export function createQianfanConfig(options: QianfanConfigOptions) {
  const defaultHeaders = { ...(options.defaultHeaders ?? {}) };

  if (options.appid) {
    defaultHeaders.appid = options.appid;
  }

  return {
    apiKey: options.apiKey,
    baseURL: options.baseURL ?? QIANFAN_BASE_URL,
    defaultHeaders,
  };
}

export function createQianfanClient(options: QianfanConfigOptions) {
  return new OpenAI(createQianfanConfig(options));
}
