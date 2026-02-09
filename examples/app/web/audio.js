export const TARGET_SAMPLE_RATE = 16000;

export function floatTo16BitPCM(float32) {
  const buffer = new Int16Array(float32.length);
  for (let i = 0; i < float32.length; i++) {
    const sample = Math.max(-1, Math.min(1, float32[i]));
    buffer[i] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
  }
  return buffer;
}

export function downsampleBuffer(buffer, inputSampleRate, outputSampleRate) {
  if (outputSampleRate >= inputSampleRate) {
    return floatTo16BitPCM(buffer);
  }
  const ratio = inputSampleRate / outputSampleRate;
  const newLength = Math.round(buffer.length / ratio);
  const result = new Int16Array(newLength);
  let offsetResult = 0,
    offsetBuffer = 0;
  while (offsetResult < result.length) {
    const nextOffset = Math.round((offsetResult + 1) * ratio);
    let accum = 0,
      count = 0;
    for (let i = offsetBuffer; i < nextOffset && i < buffer.length; i++) {
      accum += buffer[i];
      count++;
    }
    const sample = Math.max(-1, Math.min(1, accum / count));
    result[offsetResult] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
    offsetResult++;
    offsetBuffer = nextOffset;
  }
  return result;
}
