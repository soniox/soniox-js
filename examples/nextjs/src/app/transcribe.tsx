'use client';

import { useRecording } from '@soniox/react';

import { Button } from '@/components/button';

export default function Transcribe() {
  const { isActive, state, finalText, partialText, start, stop } = useRecording({
    model: 'stt-rt-v4',
    enable_language_identification: true,
    enable_speaker_diarization: true,
    enable_endpoint_detection: true,
  });

  return (
    <div className="flex flex-col gap-4 w-full">
      {/* Show current transcription */}
      <div className="rounded-lg border border-primary px-4 py-2 min-h-32 w-full">
        <span className="text-black">{finalText}</span>
        <span className="text-gray-500">{partialText}</span>
      </div>

      {state === 'error' ? <div className="text-red-500">Error occurred</div> : null}

      {isActive ? (
        <Button onClick={() => void stop()} disabled={state === 'stopping'}>
          ✋ Stop transcription
        </Button>
      ) : (
        <Button onClick={start}>🎙️ Start transcription</Button>
      )}
    </div>
  );
}
