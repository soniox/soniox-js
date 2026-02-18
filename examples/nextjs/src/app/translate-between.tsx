'use client';

import { useRecording } from '@soniox/react';
import { useState } from 'react';

import { Button } from '@/components/button';
import { LANGUAGES } from '@/lib/utils';

const STATE_COLORS: Record<string, string> = {
  idle: 'bg-gray-200 text-gray-600',
  starting: 'bg-yellow-100 text-yellow-700',
  connecting: 'bg-yellow-100 text-yellow-700',
  recording: 'bg-green-100 text-green-700',
  paused: 'bg-amber-100 text-amber-700',
  stopping: 'bg-gray-200 text-gray-600',
  stopped: 'bg-gray-200 text-gray-600',
  error: 'bg-red-100 text-red-600',
  canceled: 'bg-gray-200 text-gray-600',
};

export default function TranslateBetween() {
  const [languageA, setLanguageA] = useState('en');
  const [languageB, setLanguageB] = useState('es');

  const { isActive, state, finalTokens, partialTokens, isPaused, isSourceMuted, start, stop, pause, resume } =
    useRecording({
      model: 'stt-rt-v4',
      enable_language_identification: true,
      enable_speaker_diarization: true,
      enable_endpoint_detection: true,
      translation: {
        type: 'two_way',
        language_a: languageA,
        language_b: languageB,
      },
    });

  const labelA = LANGUAGES.find((l) => l.code === languageA)?.label ?? languageA;
  const labelB = LANGUAGES.find((l) => l.code === languageB)?.label ?? languageB;

  // Render a panel: merge consecutive same-style tokens into runs,
  // skip the other panel's language, badge 3rd-language runs once.
  function renderPanel(panelLang: string, otherLang: string) {
    const runs: { text: string; lang: string; partial: boolean }[] = [];

    function push(text: string, lang: string, partial: boolean) {
      if (lang === otherLang) return;
      const last = runs.at(-1);
      if (last && last.lang === lang && last.partial === partial) {
        last.text += text;
      } else {
        runs.push({ text, lang, partial });
      }
    }

    for (const t of finalTokens) push(t.text, t.language ?? 'unknown', false);
    for (const t of partialTokens) push(t.text, t.language ?? 'unknown', true);

    return runs.map((run, i) => {
      if (run.lang !== panelLang) {
        return (
          <span key={i} className={run.partial ? 'text-amber-400' : 'text-amber-600'}>
            <span className="text-xs font-mono bg-amber-100 rounded px-1 mr-0.5">{run.lang}</span>
            {run.text}
          </span>
        );
      }
      return (
        <span key={i} className={run.partial ? 'text-gray-500' : ''}>
          {run.text}
        </span>
      );
    });
  }

  return (
    <div className="flex flex-col gap-4 w-full">
      <div className="flex items-center gap-3 flex-wrap">
        <label className="text-sm text-gray-600">Language A:</label>
        <select
          value={languageA}
          onChange={(e) => setLanguageA(e.target.value)}
          disabled={isActive}
          className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm disabled:opacity-50"
        >
          {LANGUAGES.map((lang) => (
            <option key={lang.code} value={lang.code}>
              {lang.label}
            </option>
          ))}
        </select>
        <label className="text-sm text-gray-600 ml-2">Language B:</label>
        <select
          value={languageB}
          onChange={(e) => setLanguageB(e.target.value)}
          disabled={isActive}
          className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm disabled:opacity-50"
        >
          {LANGUAGES.map((lang) => (
            <option key={lang.code} value={lang.code}>
              {lang.label}
            </option>
          ))}
        </select>
      </div>

      <div className="text-sm font-medium text-gray-700">{labelA}</div>
      <div className="rounded-lg border border-primary px-4 py-2 min-h-32 w-full">
        {renderPanel(languageA, languageB)}
      </div>

      <div className="text-sm font-medium text-gray-700">{labelB}</div>
      <div className="rounded-lg border border-primary px-4 py-2 min-h-32 w-full">
        {renderPanel(languageB, languageA)}
      </div>

      <div className="flex items-center gap-3 text-sm">
        <span
          className={`rounded-full px-3 py-0.5 text-xs font-medium ${STATE_COLORS[state] ?? 'bg-gray-200 text-gray-600'}`}
        >
          {state}
        </span>
        {isSourceMuted && (
          <span className="rounded-full bg-red-100 px-3 py-0.5 text-xs font-medium text-red-600">⚠ Mic muted</span>
        )}
      </div>

      {state === 'error' && <div className="text-red-500 text-sm">Error occurred</div>}

      <div className="flex gap-2">
        {isActive ? (
          <>
            <Button onClick={() => void stop()} disabled={state === 'stopping'}>
              Stop
            </Button>
            {isPaused ? (
              <Button onClick={resume}>Resume</Button>
            ) : state === 'recording' ? (
              <Button onClick={pause}>Pause</Button>
            ) : null}
          </>
        ) : (
          <Button onClick={start}>Start translation</Button>
        )}
      </div>
    </div>
  );
}
