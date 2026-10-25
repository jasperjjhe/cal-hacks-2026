// Fixed provider origins only; errors never include response bodies or tokens.
export async function providerJson(url: string, token: string, body?: unknown) {
  const parsed = new URL(url);
  if (!['https://agent.creao.ai', 'https://api.apify.com'].includes(parsed.origin))
    throw new Error('Unsupported provider origin.');
  const response = await fetch(url, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    redirect: 'error',
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error(`Provider HTTP ${response.status}.`);
  if (response.status === 204) return null;
  const reader = response.body?.getReader();
  if (!reader) throw new Error('Missing provider response.');
  const decoder = new TextDecoder();
  let text = '', bytes = 0;
  try {
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      bytes += part.value.byteLength;
      if (bytes > 1048576) throw new Error('Provider response too large.');
      text += decoder.decode(part.value, { stream: true });
    }
    return JSON.parse(text + decoder.decode());
  } finally {
    await reader.cancel();
  }
}
