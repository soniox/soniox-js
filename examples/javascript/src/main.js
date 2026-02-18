import { SonioxClient } from '@soniox/client';

document.querySelector('#app').innerHTML = `
  <div class="w-full max-w-xl flex flex-col gap-4">
    <h1 class="text-xl font-semibold text-gray-800">Soniox Web SDK – Vanilla JS</h1>

    <input
      id="apiKeyInput"
      type="password"
      placeholder="Enter your Soniox API key"
      class="w-full rounded-lg border border-gray-300 px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
    />

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

const client = new SonioxClient({
  api_key: async () => {
    const apiKey = apiKeyInput.value.trim();
    if (!apiKey) {
      throw new Error('Please enter your API key.');
    }
    return apiKey;
  },
});

let recording = null;

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
