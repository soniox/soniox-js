import fs from 'fs';
import process from 'process';
import { parseArgs } from 'node:util';
import { SonioxNodeClient } from '@soniox/node';

// Initialize the client.
// The API key is read from the SONIOX_API_KEY environment variable.
const client = new SonioxNodeClient();

// Render a SonioxTranslation result to a readable string.
function renderTranslation(result) {
  const header =
    result.mode === 'one_way'
      ? `One-way translation: ${result.from ?? '(detected)'} → ${result.to} (${result.duration_ms} ms)`
      : `Two-way translation: ${result.language_a} ↔ ${result.language_b} (${result.duration_ms} ms)`;

  const lines = [header, ''];

  for (const seg of result.segments) {
    const speaker = seg.speaker ? `Speaker ${seg.speaker} ` : '';
    const range = seg.start_ms !== undefined ? `[${seg.start_ms}–${seg.end_ms} ms] ` : '';
    lines.push(`${range}${speaker}[${seg.from}] ${seg.original_text.trim()}`);
    if (seg.translation_text) {
      lines.push(`  → [${seg.to}] ${seg.translation_text.trim()}`);
    }
  }

  if (result.mode === 'one_way') {
    lines.push('');
    lines.push(`Original (${result.from ?? 'auto'}): ${result.original_text.trim()}`);
    lines.push(`Translation (${result.to}): ${result.translation_text.trim()}`);
  }

  return lines.join('\n');
}

// Build the translate options for the requested mode.
function getTranslateOptions(mode, audioUrl, audioPath, languages) {
  if (!audioUrl && !audioPath) {
    throw new Error('Missing audio: --audio_url or --audio_path must be specified.');
  }

  const baseOptions = {
    // Identify each speaker. Each token will include a "speaker" field.
    // See: soniox.com/docs/stt/concepts/speaker-diarization
    enable_speaker_diarization: true,

    // Optional identifier to track this request (client-defined).
    client_reference_id: 'translate-example',
  };

  // Audio source: either a local file or a public URL.
  if (audioPath) {
    baseOptions.file = fs.readFileSync(audioPath);
    baseOptions.filename = audioPath;
  } else {
    baseOptions.audio_url = audioUrl;
  }

  // Translation mode.
  // See: soniox.com/docs/stt/rt/real-time-translation#translation-modes
  if (mode === 'to') {
    return { ...baseOptions, to: languages.to };
  }
  if (mode === 'from-to') {
    return { ...baseOptions, from: languages.from, to: languages.to };
  }
  if (mode === 'between') {
    return { ...baseOptions, between: [languages.languageA, languages.languageB] };
  }
  throw new Error(`Unsupported mode: ${mode}. Use one of: to, from-to, between.`);
}

async function translateFile(mode, audioUrl, audioPath, wait, languages) {
  console.log(`Starting translation (mode: ${mode}, wait: ${wait})...`);

  const options = getTranslateOptions(mode, audioUrl, audioPath, languages);
  const job = await client.stt.translate({
    ...options,
    wait,
    ...(wait && { cleanup: ['file', 'transcription'] }),
  });

  const completedJob = wait ? job : await job.wait();
  if (!wait) {
    console.log(`Started translation job ${job.id}; completed with status: ${completedJob.status}`);
  }

  const result = completedJob.translation ?? (await completedJob.fetchTranslation());
  if (!result) {
    throw new Error(`Translation did not complete successfully (status: ${completedJob.status}).`);
  }
  console.log(renderTranslation(result));

  if (!wait) {
    await completedJob.destroy();
  }
}

async function main() {
  const { values: argv } = parseArgs({
    options: {
      mode: {
        type: 'string',
        default: 'to',
        description: 'Translation mode: "to", "from-to", or "between"',
      },
      audio_url: {
        type: 'string',
        description: 'Public URL of the audio file to translate',
      },
      audio_path: {
        type: 'string',
        description: 'Path to a local audio file to translate',
      },
      wait: {
        type: 'string',
        default: 'true',
        description: 'Whether translate() should wait before returning: "true" or "false"',
      },
      to: {
        type: 'string',
        default: 'es',
        description: 'Target language for "to" and "from-to" modes',
      },
      from: {
        type: 'string',
        default: 'en',
        description: 'Source language for "from-to" mode',
      },
      language_a: {
        type: 'string',
        default: 'en',
        description: 'First language for "between" mode',
      },
      language_b: {
        type: 'string',
        default: 'es',
        description: 'Second language for "between" mode',
      },
    },
  });

  const wait = argv.wait !== 'false';
  await translateFile(argv.mode, argv.audio_url, argv.audio_path, wait, {
    to: argv.to,
    from: argv.from,
    languageA: argv.language_a,
    languageB: argv.language_b,
  });
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
