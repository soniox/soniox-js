import { SonioxClient } from '@soniox/client';

document.querySelector('#app').innerHTML = `
  <div>
    <div>
      <input id="apiKeyInput" type="password" placeholder="Enter your Soniox API key" style="width: 320px;" />
    </div>
    <br />
    <div>
      <button id="startButton">Start</button>
      <button id="stopButton">Stop</button>
      <button id="cancelButton">Cancel</button>
    </div>
    <br />
    <div class="output">
      <div>Output:</div>
      <br />
      <span id="finalTokens"></span>
      <span id="nonFinalTokens" style="color: blue"></span>
    </div>
  </div>
`;

const apiKeyInput = document.getElementById('apiKeyInput');
const finalTokens = document.getElementById('finalTokens');
const nonFinalTokens = document.getElementById('nonFinalTokens');

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

document.getElementById('startButton').onclick = () => {
  const apiKey = apiKeyInput.value.trim();
  if (!apiKey) {
    alert('Please enter your API key.');
    return;
  }

  recording?.cancel();
  finalTokens.textContent = '';
  nonFinalTokens.textContent = '';

  recording = client.realtime.record({
    model: 'stt-rt-v4',
  });

  recording.on('result', (result) => {
    let newNonFinalTokens = '';

    for (const token of result.tokens) {
      if (token.is_final) {
        finalTokens.textContent += token.text;
      } else {
        newNonFinalTokens += token.text;
      }
    }

    nonFinalTokens.textContent = newNonFinalTokens;
  });

  recording.on('error', (error) => {
    console.error('Error occurred', error);
  });
};

document.getElementById('stopButton').onclick = () => {
  recording?.stop();
};

document.getElementById('cancelButton').onclick = () => {
  recording?.cancel();
};
