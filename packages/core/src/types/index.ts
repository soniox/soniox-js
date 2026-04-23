export type { RealtimeErrorCode, SonioxErrorCode, HttpErrorCode, HttpErrorDetails, HttpMethod } from './errors.js';

export type {
  AudioData,
  AudioFormat,
  RealtimeEvent,
  RealtimeResult,
  RealtimeSegment,
  RealtimeSegmentBufferOptions,
  RealtimeSegmentOptions,
  RealtimeToken,
  RealtimeUtterance,
  RealtimeUtteranceBufferOptions,
  SegmentGroupKey,
  SendStreamOptions,
  StateChangeReason,
  SttSessionConfig,
  SttSessionEvents,
  SttSessionOptions,
  SttSessionState,
  TranscriptionContext,
  TranslationConfig,
} from './realtime.js';

export type {
  ContextGeneralEntry,
  ContextTranslationTerm,
  OneWayTranslationConfig,
  TwoWayTranslationConfig,
} from './transcriptions.js';

export type {
  GenerateSpeechOptions,
  TtsAudioFormat,
  TtsConnectionEvents,
  TtsConnectionOptions,
  TtsEvent,
  TtsModel,
  TtsStreamConfig,
  TtsStreamEvents,
  TtsStreamInput,
  TtsStreamState,
  TtsVoice,
} from './tts.js';
