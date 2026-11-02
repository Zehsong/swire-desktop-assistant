import { z } from 'zod';
// Only main-process configuration is accepted. Never return credentials or raw errors.
export type ProviderConfig = { endpoint: string; model: string; key?: string };
export function providerConfig(
  env: NodeJS.ProcessEnv,
): ProviderConfig | undefined {
  if (!env.SWIRE_AI_ENDPOINT || !env.SWIRE_AI_MODEL) return;
  try {
    const url = new URL(env.SWIRE_AI_ENDPOINT);
    if (url.username || url.password || url.search || url.hash) return;
    if (
      url.protocol !== 'https:' &&
      !(
        url.protocol === 'http:' &&
        ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)
      )
    )
      return;
    return {
      endpoint: url.href,
      model: z.string().trim().min(1).max(200).parse(env.SWIRE_AI_MODEL),
      key: env.SWIRE_AI_KEY,
    };
  } catch {
    return;
  }
}
export async function requestReply(
  config: ProviderConfig | undefined,
  text: string,
  signal: AbortSignal,
  request: typeof fetch = fetch,
): Promise<string> {
  if (!config)
    throw new Error('AI 未配置。请按设置页配置桌面 provider 并重启。');
  const content = z.string().trim().min(1).max(4000).parse(text);
  try {
    const response = await request(config.endpoint, {
      method: 'POST',
      redirect: 'error',
      signal,
      headers: {
        'Content-Type': 'application/json',
        ...(config.key ? { Authorization: `Bearer ${config.key}` } : {}),
      },
      body: JSON.stringify({
        model: config.model,
        messages: [{ role: 'user', content }],
        stream: false,
      }),
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error('provider failure');
    }
    // Bound response memory even when a provider sends an oversized/error body.
    const reader = response.body?.getReader();
    if (!reader) throw new Error('empty response');
    const chunks: Uint8Array[] = [];
    let length = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        length += value.length;
        if (length > 256000) throw new Error('response too large');
        chunks.push(value);
      }
    } finally {
      await reader.cancel();
    }
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    return z
      .string()
      .trim()
      .min(1)
      .max(16000)
      .parse(body.choices?.[0]?.message?.content);
  } catch {
    throw new Error(
      signal.aborted
        ? '请求已取消或超时。'
        : 'AI 请求失败。请检查 provider 配置或网络后重试。',
    );
  }
}
