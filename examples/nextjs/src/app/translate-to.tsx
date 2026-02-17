'use client';

import { useRecording } from '@soniox/react';

import { Button } from '@/components/button';

export default function TranslateTo() {
  const { isActive, state, groups, start, stop } = useRecording({
    model: 'stt-rt-v4',
    enable_language_identification: true,
    enable_speaker_diarization: true,
    enable_endpoint_detection: true,
    // Translate everything to Spanish
    translation: {
      type: 'one_way',
      target_language: 'es',
    },
    groupBy: 'translation',
  });

  return (
    <div className="flex flex-col gap-4 w-full">
      {/* Show current transcription */}
      <div>Transcription</div>
      <div className="rounded-lg border border-primary px-4 py-2 min-h-32 w-full">
        <span className="text-black">{groups.original?.finalText}</span>
        <span className="text-gray-500">{groups.original?.partialText}</span>
      </div>

      {/* Show translation */}
      <div>Translation</div>
      <div className="rounded-lg border border-primary px-4 py-2 min-h-32 w-full">
        <span className="text-black">{groups.translation?.finalText}</span>
        <span className="text-gray-500">{groups.translation?.partialText}</span>
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
