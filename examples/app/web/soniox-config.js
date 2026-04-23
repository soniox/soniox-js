// Fetch Soniox connection config (temporary API key) from our backend.
// The SDK passes a ConfigContext with `usage` so the server can mint a
// scoped temporary key for STT (`transcribe_websocket`) or TTS (`tts_rt`).
//
// We also forward the region / base_domain that the server is using, so the
// browser SDK connects to the matching regional endpoints (e.g. the EU key
// must be used against `stt-rt.eu.soniox.com` / `tts-rt.eu.soniox.com`). Without
// this, the browser would fall back to the default US endpoints and auth would
// fail whenever the server is running in a non-US region.
export async function getSonioxConfig(context) {
  const res = await fetch('/tmp-key', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ usage_type: context?.usage ?? 'transcribe_websocket' }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to fetch temporary API key');
  }
  const { apiKey, region, baseDomain } = await res.json();
  return {
    api_key: apiKey,
    ...(region ? { region } : {}),
    ...(baseDomain ? { base_domain: baseDomain } : {}),
  };
}
