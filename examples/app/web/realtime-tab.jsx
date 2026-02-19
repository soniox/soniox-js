import { useState, useRef, useEffect, useCallback } from 'preact/hooks';
import { Input, Select, Checkbox, Button, Panel, formatTime } from './components';
import { downsampleBuffer, TARGET_SAMPLE_RATE } from './audio';

export function TranscriptionTab() {
  const [model, setModel] = useState('stt-rt-v4');
  const [language, setLanguage] = useState('');
  const [segmentMode, setSegmentMode] = useState('raw');
  const [groupBy, setGroupBy] = useState('speaker,language');
  const [endpoint, setEndpoint] = useState(true);
  const [diarization, setDiarization] = useState(false);
  const [status, setStatus] = useState('idle');
  const [partial, setPartial] = useState('');
  const [segments, setSegments] = useState([]);
  const [logs, setLogs] = useState([]);

  const wsRef = useRef(null);
  const audioRef = useRef({ ctx: null, stream: null, processor: null, source: null, gain: null });
  const modeRef = useRef('raw');
  const segmentsRef = useRef(null);
  const committedRef = useRef('');
  const prevResultTokensRef = useRef([]);

  useEffect(() => {
    if (segmentsRef.current) segmentsRef.current.scrollTop = segmentsRef.current.scrollHeight;
  }, [segments]);

  const log = useCallback((msg) => {
    setLogs((prev) => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev.slice(0, 99)]);
  }, []);

  const flushPartial = useCallback(() => {
    setPartial((prev) => {
      if (prev.trim() && modeRef.current === 'raw') {
        setSegments((segs) => [...segs, { text: prev, isRaw: true }]);
      }
      return '';
    });
  }, []);

  const handleMessage = useCallback(
    (data) => {
      const msg = JSON.parse(data);
      if (msg.type === 'result') {
        const result = msg.result || {};
        const tokens = result.tokens || [];

        // Detect tokens the server flushed from the result window.
        const prev = prevResultTokensRef.current;
        if (prev.length > 0) {
          if (tokens.length === 0) {
            for (const t of prev) {
              if (t.is_final) committedRef.current += t.text;
            }
          } else if (tokens[0].start_ms != null) {
            const windowStart = tokens[0].start_ms;
            for (const t of prev) {
              if (t.is_final && t.start_ms != null && t.start_ms < windowStart) {
                committedRef.current += t.text;
              }
            }
          }
        }
        prevResultTokensRef.current = tokens;

        const text = tokens.map((t) => t.text).join('');
        setPartial(text);
        if (modeRef.current !== 'raw' && msg.segments?.length) {
          setSegments((prev) => [...prev, ...msg.segments]);
          msg.segments.forEach((s) => log(`Segment: "${s.text.substring(0, 30)}..." (speaker=${s.speaker || '-'})`));
        }
        if (result.finished) {
          if (committedRef.current) {
            setPartial((prev) => committedRef.current + prev);
            committedRef.current = '';
          }
          flushPartial();
          log('Session finished');
        }
      } else if (msg.type === 'endpoint') {
        committedRef.current = '';
        prevResultTokensRef.current = [];
        if (modeRef.current !== 'raw' && msg.segments?.length) {
          setSegments((prev) => [...prev, ...msg.segments]);
          msg.segments.forEach((s) => log(`Segment: "${s.text.substring(0, 30)}..." (speaker=${s.speaker || '-'})`));
        }
        flushPartial();
        log('Endpoint detected');
      } else if (msg.type === 'error') {
        log(`Error: ${msg.error?.message || 'unknown'}`);
      } else if (msg.type === 'connected') {
        log(`Connected - mode: ${msg.segmentMode || 'raw'}, groupBy: ${msg.groupBy?.join(',') || 'none'}`);
      }
    },
    [log, flushPartial]
  );

  const start = useCallback(async () => {
    setPartial('');
    setSegments([]);
    setLogs([]);
    committedRef.current = '';
    prevResultTokensRef.current = [];
    modeRef.current = segmentMode;
    setStatus('connecting');

    const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
    const url = new URL(`${protocol}://${location.host}/realtime`);
    url.searchParams.set('model', model.trim() || 'stt-rt-v4');
    if (language.trim()) url.searchParams.set('language', language.trim());
    url.searchParams.set('endpoint', endpoint ? 'true' : 'false');
    url.searchParams.set('diarization', diarization ? 'true' : 'false');
    url.searchParams.set('languageId', 'true');
    url.searchParams.set('segmentMode', segmentMode);
    url.searchParams.set('groupBy', groupBy);

    const ws = new WebSocket(url.toString());
    ws.binaryType = 'arraybuffer';
    wsRef.current = ws;

    ws.onopen = () => {
      setStatus('connected');
      log('WebSocket connected');
    };
    ws.onmessage = (e) => {
      try {
        handleMessage(e.data);
      } catch {
        log('Non-JSON message');
      }
    };
    ws.onclose = (e) => {
      setStatus(`closed (${e.code})`);
      log(`WebSocket closed: ${e.reason || 'no reason'}`);
    };
    ws.onerror = () => {
      setStatus('error');
      log('WebSocket error');
    };

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const source = ctx.createMediaStreamSource(stream);
      const processor = ctx.createScriptProcessor(4096, 1, 1);
      const gain = ctx.createGain();
      gain.gain.value = 0;

      processor.onaudioprocess = (e) => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          const pcm = downsampleBuffer(e.inputBuffer.getChannelData(0), ctx.sampleRate, TARGET_SAMPLE_RATE);
          if (pcm.length > 0) wsRef.current.send(pcm.buffer);
        }
      };

      source.connect(processor);
      processor.connect(gain);
      gain.connect(ctx.destination);

      audioRef.current = { ctx, stream, processor, source, gain };
    } catch {
      setStatus('mic error');
      log('Microphone permission denied');
      stop();
    }
  }, [model, language, segmentMode, groupBy, endpoint, diarization, log, handleMessage]);

  const stop = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'finish' }));
      wsRef.current.close(1000, 'client stopped');
    }
    wsRef.current = null;
    const { ctx, stream, processor, source, gain } = audioRef.current;
    processor?.disconnect();
    source?.disconnect();
    gain?.disconnect();
    ctx?.close();
    stream?.getTracks().forEach((t) => t.stop());
    audioRef.current = { ctx: null, stream: null, processor: null, source: null, gain: null };
    setStatus('idle');
  }, []);

  const isRunning = status !== 'idle' && status !== 'error' && !status.startsWith('closed');

  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 mt-6 items-end">
        <Input label="Model" value={model} onChange={setModel} />
        <Input label="Language hint" value={language} onChange={setLanguage} placeholder="en" />
        <Select
          label="Segment Mode"
          value={segmentMode}
          onChange={setSegmentMode}
          options={[
            { value: 'raw', label: 'Raw tokens' },
            { value: 'segments', label: 'Segments (stateless)' },
            { value: 'buffer', label: 'Buffer (rolling)' },
          ]}
        />
        <Select
          label="Group By"
          value={groupBy}
          onChange={setGroupBy}
          options={[
            { value: 'speaker,language', label: 'Speaker + Language' },
            { value: 'speaker', label: 'Speaker only' },
            { value: 'language', label: 'Language only' },
            { value: '', label: 'No grouping' },
          ]}
        />
        <Checkbox label="Endpoint" checked={endpoint} onChange={setEndpoint} />
        <Checkbox label="Diarization" checked={diarization} onChange={setDiarization} />
      </div>

      <div className="flex gap-3 mt-4">
        <Button onClick={start} disabled={isRunning}>
          Start
        </Button>
        <Button onClick={stop} disabled={!isRunning} variant="secondary">
          Stop
        </Button>
      </div>

      <div className="mt-4 font-semibold">
        Status: <span className="text-blue-600">{status}</span>
      </div>

      <Panel title="Live transcript">
        <div className="whitespace-pre-wrap break-words font-mono min-h-[2rem]">
          <span>{committedRef.current}</span>
          <span className="text-blue-600">{partial}</span>
        </div>
      </Panel>

      <Panel title="Final transcript / Segments">
        <div ref={segmentsRef} className="space-y-2 max-h-64 overflow-y-auto">
          {segments.map((seg, i) =>
            seg.isRaw ? (
              <pre key={i} className="whitespace-pre-wrap break-words font-mono">
                {seg.text}
              </pre>
            ) : (
              <div key={i} className="p-2 bg-gray-100 rounded">
                <div className="text-xs text-gray-500 mb-1">
                  {[
                    seg.speaker && `Speaker: ${seg.speaker}`,
                    seg.language && `Lang: ${seg.language}`,
                    (seg.start_ms !== undefined || seg.end_ms !== undefined) &&
                      `${formatTime(seg.start_ms)} - ${formatTime(seg.end_ms)}`,
                  ]
                    .filter(Boolean)
                    .join(' | ') || 'No metadata'}
                </div>
                <div>{seg.text}</div>
              </div>
            )
          )}
        </div>
      </Panel>

      <Panel title="Log">
        <pre className="whitespace-pre-wrap break-words font-mono text-sm max-h-48 overflow-y-auto">
          {logs.join('\n')}
        </pre>
      </Panel>
    </>
  );
}
