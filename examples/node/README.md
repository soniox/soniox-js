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
