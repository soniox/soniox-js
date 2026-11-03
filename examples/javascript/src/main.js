import { MicrophoneSource, SonioxClient } from '@soniox/client';

document.querySelector('#app').innerHTML = `
  <div class="w-full max-w-xl flex flex-col gap-6">
    <h1 class="text-xl font-semibold text-gray-800">Soniox Web SDK – Vanilla JS</h1>

    <input
      id="apiKeyInput"
      type="password"
      placeholder="Enter your Soniox API key"
      class="w-full rounded-lg border border-gray-300 px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
    />

    <section class="flex flex-col gap-3">
      <h2 class="text-base font-semibold text-gray-700">Real-time transcription</h2>

      <div class="flex flex-wrap gap-2">
        <button id="startBtn" class="rounded-lg border border-blue-600 bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-40">
          Start
        </button>
        <button id="stopBtn" class="rounded-lg border border-gray-400 px-4 py-2 text-sm hover:bg-gray-100 disabled:opacity-40" disabled>
          Stop
        </button>
        <button id="pauseBtn" class="rounded-lg border border-amber-500 px-4 py-2 text-sm text-amber-700 hover:bg-amber-50 disabled:opacity-40 hidden">
          Pause
        </button>
        <button id="resumeBtn" class="rounded-lg border border-green-500 px-4 py-2 text-sm text-green-700 hover:bg-green-50 disabled:opacity-40 hidden">
          Resume
        </button>
        <button id="cancelBtn" class="rounded-lg border border-red-400 px-4 py-2 text-sm text-red-600 hover:bg-red-50 disabled:opacity-40" disabled>
          Cancel
        </button>
      </div>

      <div class="flex items-center gap-3 text-sm">
        <span class="text-gray-500">State:</span>
        <span id="stateLabel" class="rounded-full bg-gray-200 px-3 py-0.5 text-xs font-medium text-gray-600">idle</span>
        <span id="muteWarning" class="hidden rounded-full bg-red-100 px-3 py-0.5 text-xs font-medium text-red-600">
          ⚠ Mic muted
        </span>
      </div>

      <div class="rounded-lg border border-gray-300 px-4 py-3 min-h-[10rem] text-sm leading-relaxed">
        <span id="finalTokens" class="text-gray-900"></span>
        <span id="partialTokens" class="text-gray-400"></span>
      </div>
    </section>


    <section class="flex flex-col gap-3 border-t border-gray-200 pt-6">
      <h2 class="text-base font-semibold text-gray-700">Voice agent (agent text + echo cancellation)</h2>

      <p class="text-xs leading-relaxed text-gray-500">
        Open the mic, then make the agent speak out loud. Two things keep the agent's own
        voice out of the transcript: the browser's echo canceller removes it from the mic
        signal, and <code>sendAgentText()</code> tells Soniox what was said, so those words
        are recognized when you say them back instead of being attributed to you.
        <strong>Use speakers, not headphones</strong> - with headphones there is no echo to cancel.
      </p>

      <div class="flex flex-wrap gap-2">
        <button id="agentStartBtn" class="rounded-lg border border-teal-600 bg-teal-600 px-4 py-2 text-sm text-white hover:bg-teal-700 disabled:opacity-40">
          Open mic
        </button>
        <button id="agentSpeakBtn" class="rounded-lg border border-teal-400 px-4 py-2 text-sm text-teal-700 hover:bg-teal-50 disabled:opacity-40" disabled>
          Speak
        </button>
        <button id="agentBargeBtn" class="rounded-lg border border-red-400 px-4 py-2 text-sm text-red-600 hover:bg-red-50 disabled:opacity-40" disabled>
          Barge in
        </button>
        <button id="agentStopBtn" class="rounded-lg border border-gray-400 px-4 py-2 text-sm hover:bg-gray-100 disabled:opacity-40" disabled>
          Close mic
        </button>
      </div>

      <input
        id="agentLine"
        type="text"
        value="We have a flat white and a cortado today."
        class="w-full rounded-lg border border-gray-300 px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
      />

      <label class="flex items-center gap-2 text-xs text-gray-600">
        <input id="agentEchoCancel" type="checkbox" checked class="rounded border-gray-300" />
        echoCancellation on the mic track (uncheck to hear what it is doing for you)
      </label>

      <div class="rounded-lg border border-gray-300 px-4 py-3 min-h-[6rem] text-sm leading-relaxed">
        <span id="agentFinalTokens" class="text-gray-900"></span>
        <span id="agentPartialTokens" class="text-gray-400"></span>
      </div>

      <div class="flex items-center gap-3 text-sm">
        <span class="text-gray-500">Sent as agent text:</span>
        <span id="agentSentText" class="text-gray-700">-</span>
      </div>
    </section>
    <section class="flex flex-col gap-3 border-t border-gray-200 pt-6">
      <h2 class="text-base font-semibold text-gray-700">Text-to-speech</h2>

      <textarea
        id="ttsText"
        rows="3"
        placeholder="Text to synthesize"
        class="w-full rounded-lg border border-gray-300 px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      >Hello from the Soniox Web SDK vanilla JS example.</textarea>

      <div class="flex items-center gap-2">
        <label class="text-xs font-medium text-gray-500" for="ttsVoice">Voice</label>
        <input
          id="ttsVoice"
          type="text"
          value="Adrian"
          class="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <label class="text-xs font-medium text-gray-500" for="ttsLanguage">Language</label>
        <input
          id="ttsLanguage"
          type="text"
          value="en"
          placeholder="e.g. en, es, fr"
          class="w-28 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <div class="flex flex-wrap gap-2">
        <button id="ttsRestBtn" class="rounded-lg border border-indigo-600 bg-indigo-600 px-4 py-2 text-sm text-white hover:bg-indigo-700 disabled:opacity-40">
          Generate (REST)
        </button>
        <button id="ttsRealtimeBtn" class="rounded-lg border border-indigo-400 px-4 py-2 text-sm text-indigo-700 hover:bg-indigo-50 disabled:opacity-40">
          Generate (Realtime)
        </button>
      </div>

      <div class="flex items-center gap-3 text-sm">
        <span class="text-gray-500">Status:</span>
        <span id="ttsStatus" class="text-gray-700">idle</span>
      </div>

      <audio id="ttsAudio" controls class="w-full hidden"></audio>
    </section>
  </div>
`;

const $ = (id) => document.getElementById(id);

const apiKeyInput = $('apiKeyInput');
const finalTokens = $('finalTokens');
const partialTokens = $('partialTokens');
const stateLabel = $('stateLabel');
const muteWarning = $('muteWarning');
const startBtn = $('startBtn');
const stopBtn = $('stopBtn');
const pauseBtn = $('pauseBtn');
const resumeBtn = $('resumeBtn');
const cancelBtn = $('cancelBtn');
const ttsText = $('ttsText');
const ttsVoice = $('ttsVoice');
const ttsLanguage = $('ttsLanguage');
const ttsRestBtn = $('ttsRestBtn');
const ttsRealtimeBtn = $('ttsRealtimeBtn');
const ttsStatus = $('ttsStatus');
const ttsAudio = $('ttsAudio');

// New config style: pass `config` (sync object or async function that returns
// a SonioxConnectionConfig) instead of the deprecated `api_key` prop.
// The function is called once per session, so it's safe to fetch a fresh
// temporary API key from your backend here.
const client = new SonioxClient({
  config: async () => {
    const apiKey = apiKeyInput.value.trim();
    if (!apiKey) {
      throw new Error('Please enter your API key.');
    }
    // VITE_SONIOX_BASE_DOMAIN points every endpoint at another deployment, for
    // trying a model before it reaches production. Unset means production.
    const baseDomain = import.meta.env.VITE_SONIOX_BASE_DOMAIN;
    return baseDomain ? { api_key: apiKey, base_domain: baseDomain } : { api_key: apiKey };
  },
});

let recording = null;
let lastAudioUrl = null;

function updateUI(state) {
  stateLabel.textContent = state;

  const isIdle = ['idle', 'stopped', 'canceled', 'error'].includes(state);
  const isActive = !isIdle;
  const isRecording = state === 'recording';
  const isPaused = state === 'paused';

  startBtn.disabled = !isIdle;
  stopBtn.disabled = !(isRecording || isPaused || state === 'connecting' || state === 'starting');
  cancelBtn.disabled = !isActive;

  pauseBtn.classList.toggle('hidden', !isRecording);
  resumeBtn.classList.toggle('hidden', !isPaused);

  const colors = {
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
  stateLabel.className = `rounded-full px-3 py-0.5 text-xs font-medium ${colors[state] || 'bg-gray-200 text-gray-600'}`;
}

startBtn.onclick = () => {
  const apiKey = apiKeyInput.value.trim();
  if (!apiKey) {
    alert('Please enter your API key.');
    return;
  }

  recording?.cancel();
  finalTokens.textContent = '';
  partialTokens.textContent = '';
  muteWarning.classList.add('hidden');

  recording = client.realtime.record({
    model: 'stt-rt-v6',
  });

  recording.on('result', (result) => {
    let partial = '';
    for (const token of result.tokens) {
      if (token.is_final) {
        finalTokens.textContent += token.text;
      } else {
        partial += token.text;
      }
    }
    partialTokens.textContent = partial;
  });

  recording.on('state_change', ({ new_state }) => {
    updateUI(new_state);
  });

  recording.on('source_muted', () => {
    muteWarning.classList.remove('hidden');
  });

  recording.on('source_unmuted', () => {
    muteWarning.classList.add('hidden');
  });

  recording.on('error', (error) => {
    console.error('Recording error:', error);
  });
};

stopBtn.onclick = () => recording?.stop();
pauseBtn.onclick = () => recording?.pause();
resumeBtn.onclick = () => recording?.resume();
cancelBtn.onclick = () => recording?.cancel();

// TTS helpers

function playAudioBlob(bytes) {
  if (lastAudioUrl) {
    URL.revokeObjectURL(lastAudioUrl);
    lastAudioUrl = null;
  }
  const blob = new Blob([bytes], { type: 'audio/wav' });
  lastAudioUrl = URL.createObjectURL(blob);
  ttsAudio.src = lastAudioUrl;
  ttsAudio.classList.remove('hidden');
  void ttsAudio.play().catch(() => {});
}

function combineChunks(chunks, totalBytes) {
  const combined = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return combined;
}

function setTtsBusy(busy) {
  ttsRestBtn.disabled = busy;
  ttsRealtimeBtn.disabled = busy;
}

// REST TTS: one request, one audio buffer back.
ttsRestBtn.onclick = async () => {
  const text = ttsText.value.trim();
  const voice = ttsVoice.value.trim() || 'Adrian';
  const language = ttsLanguage.value.trim() || 'en';
  if (!text) {
    alert('Please enter some text to synthesize.');
    return;
  }

  setTtsBusy(true);
  ttsStatus.textContent = 'Generating via REST...';
  try {
    const audio = await client.tts.generate({
      text,
      voice,
      model: 'tts-rt-v2',
      language,
      audio_format: 'wav',
    });
    ttsStatus.textContent = `Received ${audio.byteLength} bytes.`;
    playAudioBlob(audio);
  } catch (err) {
    console.error('TTS REST error:', err);
    ttsStatus.textContent = `Error: ${err.message || err}`;
  } finally {
    setTtsBusy(false);
  }
};

// Realtime TTS: open a WebSocket stream, send the text, collect audio chunks
// as they arrive, then play once the server terminates the stream.
ttsRealtimeBtn.onclick = async () => {
  const text = ttsText.value.trim();
  const voice = ttsVoice.value.trim() || 'Adrian';
  const language = ttsLanguage.value.trim() || 'en';
  if (!text) {
    alert('Please enter some text to synthesize.');
    return;
  }

  setTtsBusy(true);
  ttsStatus.textContent = 'Connecting to realtime TTS...';
  try {
    const stream = await client.realtime.tts({
      voice,
      model: 'tts-rt-v2',
      language,
      audio_format: 'wav',
    });

    stream.sendText(text, { end: true });

    const chunks = [];
    let totalBytes = 0;
    for await (const chunk of stream) {
      chunks.push(chunk);
      totalBytes += chunk.byteLength;
      ttsStatus.textContent = `Received ${totalBytes} bytes...`;
    }

    ttsStatus.textContent = `Done. Received ${totalBytes} bytes.`;
    playAudioBlob(combineChunks(chunks, totalBytes));
  } catch (err) {
    console.error('TTS realtime error:', err);
    ttsStatus.textContent = `Error: ${err.message || err}`;
  } finally {
    setTtsBusy(false);
  }
};

// --- Voice agent: agent text + echo cancellation -------------------------
//
// The loop every voice agent has: the mic is always open while the agent talks
// out loud. Two different mechanisms keep the agent out of the transcript.
//
// 1. `echoCancellation` on the mic track. The browser knows what it is playing
//    and subtracts it from what the mic hears. It is off by default in
//    MicrophoneSource because it hurts accuracy when there is nothing to
//    cancel; for an agent with a speaker you want it on.
// 2. `sendAgentText()`. Cancellation is never perfect, and the user will often
//    repeat the agent's words back ("the cortado, please"). Telling Soniox what
//    the agent said covers both: those words are recognized when the user says
//    them, and the leaked copy is not transcribed as the user.
//
// Agent text carries no timestamps: Soniox places each piece where it sits
// among the audio frames. So follow the playback, not the Text-to-Speech, which
// generates audio faster than real time - send each piece LEAD_SEC before the
// caller hears it. Realtime TTS supplies the alignment with `return_timestamps`,
// and character times run from the start of the stream, so with the
// AudioContext clock we know exactly when each character reaches the speaker.

const AGENT_MODEL = 'stt-rt-v6'; // must report supports_agent_text_input
const TTS_SAMPLE_RATE = 24000;
const LEAD_SEC = 0.7; // send each piece 700ms before it is heard
// Whatever the voice does not say should not reach the Text-to-Speech, or agent
// text ends up carrying characters the caller never heard: SSML, which Soniox
// reads out loud word by word ("less than break time equals..."); bold, which is
// inaudible but still gets timestamps as if it were spoken; and audio tags like
// `[laughs]`, which tts-rt-v2 performs as a sound, so their characters are never
// voiced. The double space a removed tag leaves is harmless - Soniox collapses
// runs of whitespace before it speaks.
const MARKUP = /<[^>]+>|\[[^\]]*\]|\*\*|__/g;
const TICK_MS = 50; // how often we look for text that is now due
const QUEUE_SLACK_SEC = 0.15; // so the first chunk is not already late

const agentStartBtn = $('agentStartBtn');
const agentSpeakBtn = $('agentSpeakBtn');
const agentBargeBtn = $('agentBargeBtn');
const agentStopBtn = $('agentStopBtn');
const agentLine = $('agentLine');
const agentEchoCancel = $('agentEchoCancel');
const agentFinalTokens = $('agentFinalTokens');
const agentPartialTokens = $('agentPartialTokens');
const agentSentText = $('agentSentText');

let agentRecording = null;
let audioContext = null;
let playing = [];
let dueTimer = null;
let agentStream = null;
// Bumped whenever a turn ends, so audio and text still in flight from a turn
// the caller barged in on are ignored rather than played and sent.
let turnId = 0;

/** The reply being spoken: what the speaker has, and what Soniox has. */
function newReply() {
  return { characters: [], startTimes: [], startsAt: 0, endsAt: 0, sent: 0 };
}

let reply = newReply();

function setAgentButtons({ micOpen, speaking }) {
  agentStartBtn.disabled = micOpen;
  agentStopBtn.disabled = !micOpen;
  agentSpeakBtn.disabled = !micOpen || speaking;
  agentBargeBtn.disabled = !speaking;
}

/** Play one PCM chunk at `startAt` on the AudioContext clock; return its end. */
function playPcmChunk(chunk, startAt) {
  const samples = new Int16Array(chunk.buffer, chunk.byteOffset, chunk.byteLength / 2);
  const buffer = audioContext.createBuffer(1, samples.length, TTS_SAMPLE_RATE);
  const channel = buffer.getChannelData(0);
  for (let i = 0; i < samples.length; i++) {
    channel[i] = samples[i] / 32768;
  }

  const source = audioContext.createBufferSource();
  source.buffer = buffer;
  source.connect(audioContext.destination);
  source.start(startAt);
  playing.push(source);

  return startAt + buffer.duration;
}

/** Strip the markup and audio tags the voice does not say. */
function stripMarkup(text) {
  return text.replace(MARKUP, '');
}

/** How much of the reply the caller has heard, in seconds. */
function playbackPosition() {
  // Never count more than the audio actually queued, so the text cannot run
  // ahead when the Text-to-Speech falls behind.
  return Math.min(audioContext.currentTime, reply.endsAt) - reply.startsAt;
}

/** Send the characters the caller is about to hear, and nothing beyond them. */
function sendDueAgentText() {
  if (!agentRecording || !reply.characters.length) return;
  // The SDK drops agent text unless its session is connected, so advancing the
  // cursor while it is not would lose those words silently. Recording state is
  // the coarser signal available out here: it also waits out a pause.
  if (agentRecording.state !== 'recording') return;

  const horizon = playbackPosition() + LEAD_SEC;
  let due = reply.sent;
  while (due < reply.characters.length && reply.startTimes[due] <= horizon) due++;
  if (due === reply.sent) return;

  const text = reply.characters.slice(reply.sent, due).join('');
  reply.sent = due;
  agentRecording.sendAgentText(text); // mid-turn by default
  agentSentText.textContent += text;
}

/**
 * Close the turn with whatever the caller heard but we have not sent.
 *
 * Also what to call on a barge-in, right after stopping playback: the rest of
 * the reply is dropped, because the caller never heard it. Text already sent
 * ahead of the interruption stays where it is.
 */
function endAgentTurn() {
  // Nothing more of this turn is played or sent, whoever is still mid-flight.
  turnId++;
  agentStream?.cancel();

  if (agentRecording) {
    const position = reply.characters.length ? playbackPosition() : 0;
    let heard = reply.sent;
    while (heard < reply.characters.length && reply.startTimes[heard] <= position) heard++;

    const text = reply.characters.slice(reply.sent, heard).join('');
    agentRecording.sendAgentText(text, { end_of_segment: true });
    agentSentText.textContent += `${text} | turn closed`;
  }
  reply = newReply();
}

function stopPlayback() {
  for (const source of playing) {
    source.onended = null;
    source.stop();
  }
  playing = [];
}

agentStartBtn.onclick = () => {
  agentFinalTokens.textContent = '';
  agentPartialTokens.textContent = '';
  agentSentText.textContent = '-';

  agentRecording = client.realtime.record({
    model: AGENT_MODEL,
    enable_agent_text_input: true,
    enable_endpoint_detection: true,
    source: new MicrophoneSource({
      constraints: { echoCancellation: agentEchoCancel.checked, channelCount: 1 },
    }),
  });

  agentRecording.on('result', (result) => {
    let partial = '';
    for (const token of result.tokens) {
      if (token.is_final) {
        agentFinalTokens.textContent += token.text;
      } else {
        partial += token.text;
      }
    }
    agentPartialTokens.textContent = partial;
  });

  agentRecording.on('error', (error) => {
    clearInterval(dueTimer);
    stopPlayback();
    agentStream?.cancel();
    agentRecording = null;
    setAgentButtons({ micOpen: false, speaking: false });
    console.error('Agent recording error:', error);
  });

  reply = newReply();
  playing = [];

  // The docs suggest sending due text right after each chunk of caller audio,
  // or on a timer every 50ms or so. The mic chunks are inside the SDK, so a
  // timer it is.
  dueTimer = setInterval(sendDueAgentText, TICK_MS);

  setAgentButtons({ micOpen: true, speaking: false });
};

agentStopBtn.onclick = async () => {
  setAgentButtons({ micOpen: true, speaking: false });
  clearInterval(dueTimer);
  stopPlayback();
  // Close the turn while the session can still carry it, and stop the
  // Text-to-Speech, or it keeps talking into a session that has gone.
  endAgentTurn();
  await agentRecording?.stop();
  agentRecording = null;
  setAgentButtons({ micOpen: false, speaking: false });
};

agentBargeBtn.onclick = () => {
  // The caller cut in: stop the speaker, stop the Text-to-Speech, then close the
  // turn with what they had already heard. The rest of the reply is dropped -
  // they never heard it. Text sent ahead of the interruption stays where it is.
  stopPlayback();
  endAgentTurn();
  setAgentButtons({ micOpen: true, speaking: false });
};

agentSpeakBtn.onclick = async () => {
  const line = agentLine.value.trim();
  if (!line || !agentRecording) return;

  setAgentButtons({ micOpen: true, speaking: true });
  agentSentText.textContent = '';
  audioContext ??= new AudioContext({ sampleRate: TTS_SAMPLE_RATE });
  await audioContext.resume();
  reply = newReply();

  const turn = ++turnId;
  let stream;
  try {
    stream = await client.realtime.tts({
      model: 'tts-rt-v2',
      voice: ttsVoice.value.trim() || 'Adrian',
      language: ttsLanguage.value.trim() || 'en',
      audio_format: 'pcm_s16le',
      sample_rate: TTS_SAMPLE_RATE,
      return_timestamps: true,
    });
  } catch (error) {
    console.error('Text-to-Speech failed:', error);
    endAgentTurn();
    setAgentButtons({ micOpen: Boolean(agentRecording), speaking: false });
    return;
  }

  if (turn !== turnId) {
    // Barge in or Close mic landed while the stream was still opening, so this
    // reply is already over: nobody is going to hear it.
    stream.close();
    setAgentButtons({ micOpen: Boolean(agentRecording), speaking: false });
    return;
  }
  agentStream = stream;

  // Each chunk is queued on the AudioContext clock and its characters are
  // appended with the times they will be heard at. The timer does the sending.
  stream.on('audio', (chunk, timestamps) => {
    if (turn !== turnId) return; // the caller barged in; they never hear this

    if (!reply.endsAt) {
      reply.startsAt = audioContext.currentTime + QUEUE_SLACK_SEC;
      reply.endsAt = reply.startsAt;
    }
    // If the Text-to-Speech fell behind, the queue ran dry and the gap was
    // silence, not playback: move the origin so positions stay honest.
    const startAt = Math.max(reply.endsAt, audioContext.currentTime);
    reply.startsAt += startAt - reply.endsAt;
    reply.endsAt = playPcmChunk(chunk, startAt);

    if (timestamps) {
      reply.characters.push(...timestamps.characters);
      reply.startTimes.push(...timestamps.character_start_times_seconds);
    }
  });

  // `terminated` does not arrive when the stream errors or the socket drops,
  // so settle on those too rather than waiting forever.
  const generated = new Promise((resolve) => {
    stream.on('terminated', resolve);
    stream.on('error', resolve);
  });
  stream.sendText(stripMarkup(line), { end: true });
  await generated;

  if (turn !== turnId) {
    // A barge-in or Close mic already ended this turn; nothing here is ours.
    stream.close();
    return;
  }

  // The server is done generating, but the speaker is still working through
  // the queue. Wait for the voice to actually stop, then close the turn.
  await new Promise((resolve) => setTimeout(resolve, (reply.endsAt - audioContext.currentTime) * 1000 + 50));
  if (turn === turnId) endAgentTurn();

  stream.close();
  if (agentStream === stream) agentStream = null;
  playing = [];
  setAgentButtons({ micOpen: Boolean(agentRecording), speaking: false });
};
