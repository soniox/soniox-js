import { useState, useEffect, useMemo } from 'preact/hooks';

// Hardcoded real-time STT model used across the demo tabs.
export const RT_MODEL = 'stt-rt-v5';

/**
 * Fetches the available STT models from the backend (`/models` proxy) and
 * derives language-hint and translation-target options for a given model.
 *
 * `languageOptions` always starts with an "Auto (no hint)" entry. Translation
 * targets come from the model's `translation_targets`, or from every supported
 * language when the model advertises `one_way_translation === 'all_languages'`.
 */
export function useSttLanguages(modelId = RT_MODEL) {
  const [model, setModel] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/models');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        const models = Array.isArray(data) ? data : (data.models ?? []);
        const found =
          models.find((m) => m.id === modelId) ?? models.find((m) => m.transcription_mode === 'real_time') ?? null;
        if (!cancelled) setModel(found);
      } catch (err) {
        if (!cancelled) setError(err.message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [modelId]);

  const languageOptions = useMemo(() => {
    const langs = model?.languages ?? [];
    return [
      { value: '', label: 'Auto (no hint)' },
      ...langs.map((l) => ({ value: l.code, label: `${l.name} (${l.code})` })),
    ];
  }, [model]);

  const translationTargets = useMemo(() => {
    if (!model) return [];
    const nameByCode = new Map((model.languages ?? []).map((l) => [l.code, l.name]));
    const codes =
      model.one_way_translation === 'all_languages'
        ? (model.languages ?? []).map((l) => l.code)
        : (model.translation_targets ?? []).map((t) => t.target_language);
    return codes.map((code) => ({
      value: code,
      label: nameByCode.has(code) ? `${nameByCode.get(code)} (${code})` : code,
    }));
  }, [model]);

  return { model, languageOptions, translationTargets, error };
}
