import { useState } from 'preact/hooks';
import { useRecording, useAudioLevel, useMicrophonePermission } from '@soniox/react';
import {
  AudioPermissionError,
  AudioDeviceError,
  AudioUnavailableError,
  AuthError,
  QuotaError,
  ConnectionError,
} from '@soniox/client';
import { Input, Select, Checkbox, Button, Panel, formatTime } from './components';

function PermissionGate({ children }) {
  const mic = useMicrophonePermission({ autoCheck: true });

  if (!mic.isSupported) {
    return (
      <div className="mt-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg text-yellow-800">
        Microphone permission checking is not available in this browser. Recording may still work — try starting a
        session.
      </div>
    );
  }

  if (mic.status === 'unknown') {
    return <div className="mt-6 text-gray-500">Checking microphone permission...</div>;
  }

  if (mic.isDenied) {
    return (
      <div className="mt-6 p-4 bg-red-50 border border-red-200 rounded-lg">
        <p className="text-red-700 font-semibold">Microphone access denied</p>
        {!mic.canRequest ? (
          <p className="text-red-600 text-sm mt-1">
            Permission is permanently blocked. Please enable microphone access in your browser settings and reload.
          </p>
        ) : (
          <div className="mt-2">
            <Button onClick={mic.check}>Request permission</Button>
          </div>
        )}
      </div>
    );
  }

  return children;
}

function classifyError(error) {
  if (error instanceof AudioPermissionError) return 'Microphone permission denied';
  if (error instanceof AudioDeviceError) return 'No microphone device found';
  if (error instanceof AudioUnavailableError) return 'Audio capture not supported in this browser';
  if (error instanceof AuthError) return 'Authentication failed — check your API key';
  if (error instanceof QuotaError) return 'Quota exceeded — check your Soniox plan';
  if (error instanceof ConnectionError) return 'Connection failed — check your network';
  return error.message;
}

function VolumeBar({ active }) {
  const { volume, bands } = useAudioLevel({ active, bands: 8, fftSize: 512, smoothing: 0.8 });

  if (!active) return null;

  return (
    <div className="flex items-center gap-3">
      <div className="flex items-end gap-0.5 h-6">
        {bands.map((level, i) => (
          <div
            key={i}
            className="w-1.5 bg-green-500 rounded-t transition-all duration-75"
            style={{ height: `${Math.max(2, level * 24)}px` }}
          />
        ))}
      </div>
      <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
        <div
          className="h-full bg-green-500 rounded-full transition-all duration-75"
          style={{ width: `${volume * 100}%` }}
        />
      </div>
    </div>
  );
}

function RecordingUI() {
  const [model, setModel] = useState('stt-rt-v4');
  const [language, setLanguage] = useState('');
  const [diarization, setDiarization] = useState(false);
  const [endpointEnabled, setEndpointEnabled] = useState(true);
  const [groupBy, setGroupBy] = useState('');
  const [translationEnabled, setTranslationEnabled] = useState(false);
  const [targetLanguage, setTargetLanguage] = useState('es');

  const translationConfig =
    translationEnabled && targetLanguage.trim()
      ? { type: 'one_way', target_language: targetLanguage.trim() }
      : undefined;

  const effectiveGroupBy = translationEnabled ? undefined : groupBy || undefined;

  const recording = useRecording({
    model: model.trim() || 'stt-rt-v4',
    language_hints: language.trim() ? [language.trim()] : undefined,
    enable_speaker_diarization: diarization,
    enable_endpoint_detection: endpointEnabled,
    enable_language_identification: true,
    translation: translationConfig,
    groupBy: effectiveGroupBy,
    onError: (err) => console.error('[ClientTab] Recording error:', err),
  });

  const hasGroups = Object.keys(recording.groups).length > 0;

  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mt-6 items-end">
        <Input label="Model" value={model} onChange={setModel} />
        <Input label="Language hint" value={language} onChange={setLanguage} placeholder="en" />
        <Select
          label="Group By"
          value={groupBy}
          onChange={setGroupBy}
          options={[
            { value: '', label: 'None (auto for translation)' },
            { value: 'speaker', label: 'Speaker' },
            { value: 'language', label: 'Language' },
          ]}
        />
      </div>

      <div className="flex flex-wrap gap-4 mt-4 items-end">
        <Checkbox label="Endpoint detection" checked={endpointEnabled} onChange={setEndpointEnabled} />
        <Checkbox label="Speaker diarization" checked={diarization} onChange={setDiarization} />
        <Checkbox label="Translation" checked={translationEnabled} onChange={setTranslationEnabled} />
        {translationEnabled && (
          <Input
            label="Target language"
            value={targetLanguage}
            onChange={setTargetLanguage}
            placeholder="es"
            className="w-28"
          />
        )}
      </div>

      {/* Controls */}
      <div className="flex flex-wrap gap-3 mt-4 items-center">
        <Button onClick={recording.start} disabled={recording.isActive}>
          Start
        </Button>
        <Button onClick={recording.stop} disabled={!recording.isActive} variant="secondary">
          Stop
        </Button>
        {recording.isActive && (
          <Button onClick={recording.isPaused ? recording.resume : recording.pause} variant="secondary">
            {recording.isPaused ? 'Resume' : 'Pause'}
          </Button>
        )}
        {recording.isActive && (
          <Button onClick={() => recording.finalize()} variant="secondary">
            Finalize
          </Button>
        )}
        <Button onClick={recording.clearTranscript} variant="secondary">
          Clear
        </Button>
      </div>

      {/* State indicators */}
      <div className="flex flex-wrap gap-6 items-center p-3 bg-gray-50 rounded-lg mt-4 text-sm">
        <div className="flex items-center gap-2">
          <span
            className={`w-2.5 h-2.5 rounded-full ${
              recording.isRecording
                ? 'bg-green-500 animate-pulse'
                : recording.isActive
                  ? 'bg-amber-500 animate-pulse'
                  : 'bg-gray-400'
            }`}
          />
          <span>
            State: <strong>{recording.state}</strong>
          </span>
        </div>
        {recording.isPaused && <span className="text-amber-600 font-semibold">Paused</span>}
        {recording.isSourceMuted && <span className="text-red-600 font-semibold">Mic muted (external)</span>}
        {!recording.isSupported && (
          <span className="text-red-600 text-xs">MicrophoneSource unavailable: {recording.unsupportedReason}</span>
        )}
      </div>

      {/* Audio level visualization */}
      <div className="mt-3">
        <VolumeBar active={recording.isActive} />
      </div>

      {/* Error display */}
      {recording.error && (
        <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg text-sm">
          <span className="text-red-700 font-semibold">{classifyError(recording.error)}</span>
          {recording.error.message !== classifyError(recording.error) && (
            <span className="text-red-500 ml-2">({recording.error.message})</span>
          )}
        </div>
      )}

      {/* Live transcript */}
      <Panel title="Live transcript">
        <div className="whitespace-pre-wrap break-words font-mono min-h-[2rem]">
          <span>{recording.finalText}</span>
          <span className="text-blue-600">{recording.partialText}</span>
        </div>
      </Panel>

      {/* Token groups (translation or explicit groupBy) */}
      {hasGroups && (
        <Panel title="Token groups">
          <div className="space-y-3">
            {Object.entries(recording.groups).map(([key, group]) => (
              <div key={key} className="p-2 bg-gray-50 rounded">
                <div className="text-xs text-gray-500 font-semibold mb-1 uppercase">{key}</div>
                <div className="whitespace-pre-wrap break-words font-mono">
                  <span>{group.finalText}</span>
                  <span className="text-blue-600">{group.partialText}</span>
                </div>
              </div>
            ))}
          </div>
        </Panel>
      )}

      {/* Utterances (when endpoint detection is on) */}
      {endpointEnabled && recording.utterances.length > 0 && (
        <Panel title={`Utterances (${recording.utterances.length})`}>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {recording.utterances.map((utt, i) => (
              <div key={i} className="p-2 bg-gray-100 rounded">
                <div className="text-xs text-gray-500 mb-1">
                  {[
                    utt.speaker && `Speaker: ${utt.speaker}`,
                    utt.language && `Lang: ${utt.language}`,
                    (utt.start_ms != null || utt.end_ms != null) &&
                      `${formatTime(utt.start_ms)} - ${formatTime(utt.end_ms)}`,
                  ]
                    .filter(Boolean)
                    .join(' | ') || `Utterance ${i + 1}`}
                </div>
                <div>{utt.text}</div>
              </div>
            ))}
          </div>
        </Panel>
      )}

      {/* Segments */}
      {recording.segments.length > 0 && (
        <Panel title={`Segments (${recording.segments.length})`}>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {recording.segments.map((seg, i) => (
              <div key={i} className="p-2 bg-gray-100 rounded">
                <div className="text-xs text-gray-500 mb-1">
                  {[
                    seg.speaker && `Speaker: ${seg.speaker}`,
                    seg.language && `Lang: ${seg.language}`,
                    (seg.start_ms != null || seg.end_ms != null) &&
                      `${formatTime(seg.start_ms)} - ${formatTime(seg.end_ms)}`,
                  ]
                    .filter(Boolean)
                    .join(' | ') || 'No metadata'}
                </div>
                <div>{seg.text}</div>
              </div>
            ))}
          </div>
        </Panel>
      )}
    </>
  );
}

export function ClientTab() {
  return (
    <div className="mt-2">
      <p className="text-sm text-gray-500 mt-4">
        Client-side real-time transcription using <code className="bg-gray-100 px-1 rounded">@soniox/react</code> and{' '}
        <code className="bg-gray-100 px-1 rounded">@soniox/client</code>. Audio is captured in the browser and streamed
        directly to Soniox — no server proxy.
      </p>

      <PermissionGate>
        <RecordingUI />
      </PermissionGate>
    </div>
  );
}
