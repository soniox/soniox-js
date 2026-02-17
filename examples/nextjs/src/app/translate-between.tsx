'use client';

import { useRecording } from '@soniox/react';

import { Button } from '@/components/button';

const language_a = 'en';
const language_b = 'es';

export default function TranslateBetween() {
  const { isActive, state, groups, start, stop } = useRecording({
    model: 'stt-rt-v4',
    enable_language_identification: true,
    enable_speaker_diarization: true,
    enable_endpoint_detection: true,
    // Translate everything from English to Spanish and from Spanish to English
    translation: {
      type: 'two_way',
      language_a,
      language_b,
    },
    groupBy: 'language',
  });

  return (
    <div className="flex flex-col gap-4 w-full">
      {/* Language a */}
      <div>English</div>
      <div className="rounded-lg border border-primary px-4 py-2 min-h-32 w-full">
        <span className="text-black">{groups[language_a]?.finalText}</span>
        <span className="text-gray-500">{groups[language_a]?.partialText}</span>
      </div>

      {/* Language b */}
      <div>Spanish</div>
      <div className="rounded-lg border border-primary px-4 py-2 min-h-32 w-full">
        <span className="text-black">{groups[language_b]?.finalText}</span>
        <span className="text-gray-500">{groups[language_b]?.partialText}</span>
      </div>

      {state === 'error' ? <div className="text-red-500">Error occurred</div> : null}

      {isActive ? (
        <Button onClick={() => void stop()} disabled={state === 'stopping'}>
          ✋ Stop translation
        </Button>
      ) : (
        <Button onClick={start}>🎙️ Start translation</Button>
      )}
    </div>
  );
}
