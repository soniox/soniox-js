import fs from 'fs';
import process from 'process';
import { parseArgs } from 'node:util';
import { SonioxNodeClient } from '@soniox/node';

// Initialize the client.
// The API key is read from the SONIOX_API_KEY environment variable.
const client = new SonioxNodeClient();

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

// Send all text at once and collect streamed audio chunks.
async function singleStream({ text, voice, model, language, audioFormat, sampleRate, output }) {
  console.log('Creating real-time TTS stream...');
  console.log(`  Voice: ${voice}, Model: ${model}, Language: ${language}, Format: ${audioFormat}`);

  // Open a single-stream WebSocket TTS connection.
  // See: soniox.com/docs/tts/rt/real-time-synthesis
  const stream = await client.realtime.tts({
    voice,
    model,
    language,
    audio_format: audioFormat,
    ...(sampleRate !== undefined && { sample_rate: sampleRate }),
  });

  // Send the full text and mark the end of input.
  stream.sendText(text, { end: true });

  // Receive audio chunks via async iteration.
  const chunks = [];
  let totalBytes = 0;
  for await (const chunk of stream) {
    chunks.push(chunk);
    totalBytes += chunk.byteLength;
    process.stdout.write(`\r  Received ${totalBytes} bytes...`);
  }

  writeAudio(output, chunks, totalBytes, { audioFormat, sampleRate });
}

// Stream text word-by-word to simulate LLM-style token streaming.
// `sendStream` pipes an async iterable of text chunks and auto-finishes the stream.
async function chunkedStream({ text, voice, model, language, audioFormat, sampleRate, output }) {
  console.log('Creating real-time TTS stream (chunked text input)...');
  console.log(`  Voice: ${voice}, Model: ${model}, Language: ${language}, Format: ${audioFormat}`);

  const stream = await client.realtime.tts({
    voice,
    model,
    language,
    audio_format: audioFormat,
    ...(sampleRate !== undefined && { sample_rate: sampleRate }),
  });

  const words = text.split(' ');
  async function* generateTextChunks() {
    for (let i = 0; i < words.length; i++) {
      const chunk = i === 0 ? words[i] : ' ' + words[i];
      await new Promise((resolve) => setTimeout(resolve, 50));
      yield chunk;
    }
  }

  // Pipe text chunks; audio consumption runs concurrently below.
  stream.sendStream(generateTextChunks());

  const chunks = [];
  let totalBytes = 0;
  for await (const chunk of stream) {
    chunks.push(chunk);
    totalBytes += chunk.byteLength;
    process.stdout.write(`\r  Received ${totalBytes} bytes...`);
  }

  writeAudio(output, chunks, totalBytes, { audioFormat, sampleRate });
}

// Concatenate received chunks, optionally wrap in WAV, then write to disk.
function writeAudio(output, chunks, totalBytes, { audioFormat, sampleRate }) {
  const combined = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const bytes = audioFormat === 'pcm_s16le' ? pcmS16leToWav(combined, { sampleRate }) : Buffer.from(combined);
  fs.writeFileSync(output, bytes);
  console.log(`\nWrote ${bytes.length} bytes to ${output}`);
}

async function main() {
  const { values: argv } = parseArgs({
    options: {
      text: {
        type: 'string',
        default:
          'Hello from the Soniox Node SDK real-time text-to-speech example. This demonstrates the WebSocket TTS API with streaming audio output.',
      },
      voice: { type: 'string', default: 'Adrian' },
      model: { type: 'string', default: 'tts-rt-v1-preview' },
      language: { type: 'string', default: 'en' },
      // Default to raw 16-bit PCM at 24 kHz. We wrap the bytes in a WAV
      // container before writing so the output file plays everywhere,
      // including QuickTime. TTS quality is lossless.
      audio_format: { type: 'string', default: 'pcm_s16le' },
      sample_rate: { type: 'string', default: '24000' },
      output: { type: 'string', default: 'tts_realtime_output.wav' },
      chunked: { type: 'boolean', default: false },
    },
  });

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

  if (argv.chunked) {
    await chunkedStream(params);
  } else {
    await singleStream(params);
  }
}

main().catch((err) => {
  console.error('Error:', err.message || err);
  process.exit(1);
});
