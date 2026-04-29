import fs from 'fs';
import process from 'process';
import { parseArgs } from 'node:util';
import { SonioxNodeClient } from '@soniox/node';

// Initialize the client.
// The API key is read from the SONIOX_API_KEY environment variable.
const client = new SonioxNodeClient();

// List available TTS models and their voices.
async function listModels() {
  console.log('Fetching TTS models...');
  const models = await client.tts.listModels();
  for (const model of models) {
    const voices = model.voices.map((v) => v.id).join(', ');
    console.log(`  ${model.id} (${model.name}): ${voices}`);
  }
}

function pcmS16leToWav(pcm, { sampleRate, numChannels = 1 }) {
  const bitsPerSample = 16;
  const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
  const blockAlign = numChannels * (bitsPerSample / 8);
  const dataSize = pcm.byteLength;
  const header = Buffer.alloc(44);
  header.write('RIFF', 0, 'ascii');
  header.writeUInt32LE(36 + dataSize, 4);
  header.write('WAVE', 8, 'ascii');
  header.write('fmt ', 12, 'ascii');
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(numChannels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write('data', 36, 'ascii');
  header.writeUInt32LE(dataSize, 40);
  return Buffer.concat([header, Buffer.from(pcm)]);
}

// Write the server-returned audio to disk. For raw `pcm_s16le` output we wrap
// the bytes in a WAV container so the file is immediately playable.
function writeAudio(output, bytes, { audioFormat, sampleRate }) {
  if (audioFormat === 'pcm_s16le') {
    const wav = pcmS16leToWav(bytes, { sampleRate });
    fs.writeFileSync(output, wav);
    return wav.length;
  }
  fs.writeFileSync(output, bytes);
  return bytes.length;
}

// Generate speech using the REST API and write it to a file.
async function generateToFile({ text, voice, model, language, audioFormat, sampleRate, output }) {
  console.log('Generating speech to file...');
  console.log(`  Voice: ${voice}, Model: ${model}, Language: ${language}, Format: ${audioFormat}`);

  const audio = await client.tts.generate({
    text,
    voice,
    model,
    language,
    audio_format: audioFormat,
    ...(sampleRate !== undefined && { sample_rate: sampleRate }),
  });

  const bytesWritten = writeAudio(output, audio, { audioFormat, sampleRate });
  console.log(`Wrote ${bytesWritten} bytes to ${output}`);
}

// Generate speech using the REST streaming API.
//
// Note: mid-stream errors on REST TTS are reported via HTTP trailers and may
// be silently swallowed by the runtime. For reliable error detection prefer
// the WebSocket TTS example (soniox_tts_realtime.js).
async function generateStreaming({ text, voice, model, language, audioFormat, sampleRate, output }) {
  console.log('Generating speech (streaming)...');
  console.log(`  Voice: ${voice}, Model: ${model}, Language: ${language}, Format: ${audioFormat}`);

  const chunks = [];
  let totalBytes = 0;

  for await (const chunk of client.tts.generateStream({
    text,
    voice,
    model,
    language,
    audio_format: audioFormat,
    ...(sampleRate !== undefined && { sample_rate: sampleRate }),
  })) {
    chunks.push(chunk);
    totalBytes += chunk.byteLength;
    process.stdout.write(`\r  Received ${totalBytes} bytes...`);
  }

  const combined = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }

  const bytesWritten = writeAudio(output, combined, { audioFormat, sampleRate });
  console.log(`\nWrote ${bytesWritten} bytes to ${output}`);
}

async function main() {
  const { values: argv } = parseArgs({
    options: {
      text: {
        type: 'string',
        default: 'Hello from the Soniox Node SDK text-to-speech example.',
      },
      voice: { type: 'string', default: 'Adrian' },
      model: { type: 'string', default: 'tts-rt-v1' },
      language: { type: 'string', default: 'en' },
      // Default to raw 16-bit PCM at 24 kHz. We wrap the bytes in a WAV
      // container below so the output file plays everywhere, including
      // QuickTime. TTS quality is lossless.
      audio_format: { type: 'string', default: 'pcm_s16le' },
      sample_rate: { type: 'string', default: '24000' },
      output: { type: 'string', default: 'tts_rest_output.wav' },
      stream: { type: 'boolean', default: false },
      list_models: { type: 'boolean', default: false },
    },
  });

  if (argv.list_models) {
    await listModels();
    return;
  }

  const sampleRate = argv.sample_rate ? Number(argv.sample_rate) : undefined;

  const params = {
    text: argv.text,
    voice: argv.voice,
    model: argv.model,
    language: argv.language,
    audioFormat: argv.audio_format,
    sampleRate,
    output: argv.output,
  };

  if (argv.stream) {
    await generateStreaming(params);
  } else {
    await generateToFile(params);
  }
}

main().catch((err) => {
  console.error('Error:', err.message || err);
  process.exit(1);
});
