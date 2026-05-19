# Soniox Node SDK Examples

## Set environment variable

```sh
export SONIOX_API_KEY=<your_soniox_api_key>
```

## Install dependencies

```sh
npm install
```

## Real-time examples

```sh
node soniox_realtime.js --audio_path ../../audio_samples/coffee_shop.mp3
node soniox_realtime.js --audio_path ../../audio_samples/coffee_shop.pcm_s16le --audio_format pcm_s16le
node soniox_realtime.js --audio_path ../../audio_samples/coffee_shop.mp3 --translation one_way
node soniox_realtime.js --audio_path ../../audio_samples/two_way_translation.mp3 --translation two_way
```

## Async examples

```sh
# Process audio from the link
node soniox_async.js --audio_url "https://soniox.com/media/examples/coffee_shop.mp3"

# Process local audio file
node soniox_async.js --audio_path ../../audio_samples/coffee_shop.mp3

# Delete all files from your account
node soniox_async.js --delete_all_files

# Delete all transcriptions from your account
node soniox_async.js --delete_all_transcriptions
```

## Async translate examples

```sh
# One-way translation: detect any source language, translate to Spanish
node soniox_translate.js --audio_url "https://soniox.com/media/examples/coffee_shop.mp3" --mode to --to es

# One-way translation with explicit source language: en → es
node soniox_translate.js --audio_path ../../audio_samples/coffee_shop.mp3 --mode from-to --from en --to es

# Two-way bidirectional translation between en and es
node soniox_translate.js --audio_path ../../audio_samples/two_way_translation.mp3 --mode between --language_a en --language_b es

# Start a translation job first, then wait/fetch the translation explicitly
node soniox_translate.js --audio_url "https://soniox.com/media/examples/coffee_shop.mp3" --mode to --to es --wait false
```

## Real-time TTS examples

```sh
# Generate speech and write to a file via the WebSocket TTS API
node soniox_tts_realtime.js --text "Hello from Soniox."

# Simulate LLM-style token streaming by sending text chunks over time
node soniox_tts_realtime.js --text "Hello from Soniox." --chunked
```

## REST TTS examples

```sh
# Generate speech and write directly to a file
node soniox_tts_rest.js --text "Hello from Soniox."

# Generate speech via the streaming REST API
node soniox_tts_rest.js --text "Hello from Soniox." --stream

# List available TTS models and their voices
node soniox_tts_rest.js --list_models
```
