import fs from 'fs';
import path from 'path';
import process from 'process';
import { parseArgs } from 'node:util';
import { SonioxNodeClient } from '@soniox/node';

// A caller asks about a package and pauses. The agent looks the package up,
// answers out loud through Text-to-Speech, and tells Soniox what it is saying -
// so the model knows the words the caller is about to hear, and does not take
// the agent's own voice for the caller's when it leaks back into the microphone.
// See: soniox.com/docs/stt/rt/agent-text-input
const DEMO_FILE = path.join(import.meta.dirname, '../../audio_samples/package_lookup.mp3');
const { values: argv } = parseArgs({ options: { audio_path: { type: 'string' } } });
const AUDIO_PATH = argv.audio_path ?? DEMO_FILE;
const POST_ID = '235235'; // your model would pull this out of the transcript as a tool call
const USERS = { 235235: 'John Döe' }; // stands in for your database
const LLM_LATENCY_MS = 800; // your model will not answer instantly either

const client = new SonioxNodeClient();

/** Say `text` out loud, feeding each piece back into Speech-to-Text. */
async function speakAgentReply(session, text) {
  const stream = await client.realtime.tts({
    model: 'tts-rt-v2',
    voice: 'Adrian',
    language: 'en',
    audio_format: 'pcm_s16le',
    sample_rate: 24000,
    return_timestamps: true,
  });

  let said = '';
  stream.on('audio', (_chunk, timestamps) => {
    if (!timestamps) return;
    const spoken = timestamps.characters.join('');
    said += spoken;
    session.sendAgentText(spoken);
    console.log(`agent_text_input: ${JSON.stringify(spoken)}`);
  });

  const finished = new Promise((resolve) => {
    stream.on('terminated', resolve);
    stream.on('error', (err) => resolve(err));
  });
  stream.sendText(text, { end: true });
  const failure = await finished;
  stream.close();

  if (!said) {
    // The voice never spoke, so there is no turn to close. A TTS error can
    // arrive with an empty stream_id, which the SDK drops without an event
    // (soniox-js#20), so an empty reply is the only signal left.
    console.log(`agent_text_input: nothing was spoken${failure ? `: ${failure.message}` : ''}`);
    return;
  }
  session.sendAgentText('', { end_of_segment: true });
  console.log('agent_text_input: end of turn');
}

async function main() {
  const session = client.realtime.stt({
    model: 'stt-rt-v6', // a model whose supports_agent_text_input is true
    enable_endpoint_detection: true,
    enable_agent_text_input: true,
  });

  let heard = '';
  session.on('result', (result) => {
    for (const token of result.tokens) {
      if (token.is_final) heard += token.text;
    }
  });

  session.on('endpoint', async () => {
    console.log(`caller: ${heard.trim()}`);
    heard = '';
    const user = USERS[POST_ID];
    console.log(`lookup: ${POST_ID} -> ${user}`);
    await new Promise((resolve) => setTimeout(resolve, LLM_LATENCY_MS));
    const reply = `Hi ${user}, your package is out for delivery.`; // your model
    console.log(`llm: ${reply}`);
    await speakAgentReply(session, reply);
    await session.finish();
  });

  session.on('error', (err) => console.error('error:', err.message));

  await session.connect();

  // Soniox places agent text by where it sits among the audio frames, so the
  // clip streams at the pace it was spoken. `finish` stays off: it would end
  // the session as soon as the clip ran out, before the agent has replied.
  await session.sendStream(fs.createReadStream(AUDIO_PATH, { highWaterMark: 4096 }), {
    pace_ms: 510,
  });
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
