'use client';

import { useRecording } from '@soniox/react';

import { Button } from '@/components/button';

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

export default function Transcribe() {
  const { isActive, state, finalText, partialText, isPaused, isSourceMuted, start, stop, pause, resume } = useRecording(
    {
      model: 'stt-rt-v4',
      enable_language_identification: true,
      enable_speaker_diarization: true,
      enable_endpoint_detection: true,
    }
  );

  return (
    <div className="flex flex-col gap-4 w-full">
      <div className="rounded-lg border border-primary px-4 py-2 min-h-32 w-full">
        <span className="text-black">{finalText}</span>
        <span className="text-gray-500">{partialText}</span>
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
          <Button onClick={start}>Start transcription</Button>
        )}
      </div>
    </div>
  );
}
