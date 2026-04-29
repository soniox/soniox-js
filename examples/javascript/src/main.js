import { SonioxClient } from '@soniox/client';

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
    return { api_key: apiKey };
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
    model: 'stt-rt-v4',
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
      model: 'tts-rt-v1',
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
      model: 'tts-rt-v1',
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
