import { useState, useRef, useEffect, useCallback } from 'preact/hooks';
import { Input, Select, Button, Panel } from './components';
import { downsampleBuffer, TARGET_SAMPLE_RATE } from './audio';

export function AgentTab() {
  const [model, setModel] = useState('stt-rt-v4');
  const [language, setLanguage] = useState('');
  const [mode, setMode] = useState('auto'); // 'auto' or 'ptt' (push-to-talk)
  const [agentState, setAgentState] = useState('idle');
  const [sttActive, setSttActive] = useState(false);
  const [recording, setRecording] = useState(false); // PTT recording state
  const [finalizing, setFinalizing] = useState(false); // PTT finalizing state
  const [partial, setPartial] = useState('');
  const [messages, setMessages] = useState([]);
  const [logs, setLogs] = useState([]);
  const [streamingContent, setStreamingContent] = useState('');

  const wsRef = useRef(null);
  const audioRef = useRef({ ctx: null, stream: null, processor: null, source: null, gain: null });
  const chatRef = useRef(null);
  const modeRef = useRef('auto');

  const log = useCallback((msg) => {
    setLogs((prev) => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev.slice(0, 99)]);
  }, []);

  const handleMessage = useCallback(
    (data) => {
      const msg = JSON.parse(data);
      switch (msg.type) {
        // Auto mode (agent) messages
        case 'state':
          setAgentState(msg.state);
          log(`State: ${msg.state}`);
          break;
        case 'stt_paused':
          setSttActive(false);
          log('STT paused');
          break;
        case 'stt_resumed':
          setSttActive(true);
          log('STT resumed');
          break;
        case 'partial':
          setPartial(msg.text);
          break;
        case 'user_message':
          setPartial('');
          setMessages((prev) => [...prev, { role: 'user', content: msg.text }]);
          log(`User: "${msg.text.substring(0, 50)}..."`);
          break;
        case 'assistant_chunk':
          setStreamingContent((prev) => prev + msg.text);
          break;
        case 'assistant_done':
          setMessages((prev) => [...prev, { role: 'assistant', content: msg.text }]);
          setStreamingContent('');
          log(`Assistant: "${msg.text.substring(0, 50)}..."`);
          break;
        case 'connected':
          log(`Connected - mode: ${modeRef.current}, model: ${msg.config?.sttModel || msg.config?.model}`);
          break;
        case 'history_cleared':
          setMessages([]);
          log('Conversation history cleared');
          break;
        // PTT mode messages
        case 'recording':
          setRecording(msg.active);
          if (msg.active) setFinalizing(false);
          log(`Recording: ${msg.active ? 'started' : 'stopped'}`);
          break;
        case 'finalizing':
          setFinalizing(true);
          log('Finalizing...');
          break;
        case 'utterance':
          setPartial('');
          setFinalizing(false);
          // Don't add to messages here -- the server sends a separate
          // 'user_message' event which handles chat display + agent response.
          if (msg.text) {
            log(`Utterance: "${msg.text.substring(0, 50)}${msg.text.length > 50 ? '...' : ''}"`);
          } else {
            log('Utterance: (empty)');
          }
          break;
        // Common messages
        case 'error':
          log(`Error: ${msg.error?.message || 'unknown'}`);
          break;
        case 'disconnected':
          log(`Disconnected: ${msg.reason || 'unknown'}`);
          break;
      }
    },
    [log]
  );

  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }, [messages, streamingContent]);

  const start = useCallback(async () => {
    setPartial('');
    setLogs([]);
    setStreamingContent('');
    setAgentState('connecting');
    setSttActive(false);
    setRecording(false);
    setFinalizing(false);
    modeRef.current = mode;

    const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
    // Use different endpoint based on mode
    const wsEndpoint = mode === 'ptt' ? '/push-to-talk' : '/agent';
    const url = new URL(`${protocol}://${location.host}${wsEndpoint}`);
    url.searchParams.set('model', model.trim() || 'stt-rt-v4');
    if (language.trim()) url.searchParams.set('language', language.trim());

    const ws = new WebSocket(url.toString());
    ws.binaryType = 'arraybuffer';
    wsRef.current = ws;

    ws.onopen = () => log('WebSocket connected');
    ws.onmessage = (e) => {
      try {
        handleMessage(e.data);
      } catch {
        log('Non-JSON message');
      }
    };
    ws.onclose = (e) => {
      setAgentState('idle');
      setSttActive(false);
      setRecording(false);
      log(`WebSocket closed: ${e.reason || e.code}`);
      stop(true);
    };
    ws.onerror = () => log('WebSocket error');

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

      // For PTT mode, set state to ready after connection
      if (mode === 'ptt') {
        setAgentState('ready');
      }
    } catch {
      log('Microphone permission denied');
      stop();
    }
  }, [model, language, mode, log, handleMessage]);

  const stop = useCallback((skipWsClose = false) => {
    if (!skipWsClose && wsRef.current?.readyState === WebSocket.OPEN) {
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
    setAgentState('idle');
    setSttActive(false);
    setRecording(false);
    setFinalizing(false);
  }, []);

  const clearHistory = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'clear_history' }));
    }
    setMessages([]);
  }, []);

  // PTT handlers
  const startRecording = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'start' }));
    }
  }, []);

  const stopRecording = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'stop' }));
    }
  }, []);

  const isRunning = agentState !== 'idle';
  const isPTT = modeRef.current === 'ptt';

  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 mt-6 items-end">
        <Input label="STT Model" value={model} onChange={setModel} />
        <Input label="Language" value={language} onChange={setLanguage} placeholder="en" />
        <Select
          label="Mode"
          value={mode}
          onChange={setMode}
          options={[
            { value: 'auto', label: 'Auto endpoint' },
            { value: 'ptt', label: 'Push-to-talk' },
          ]}
        />
        <Button onClick={start} disabled={isRunning}>
          Start
        </Button>
        <div className="flex gap-2">
          <Button onClick={() => stop()} disabled={!isRunning} variant="secondary">
            Stop
          </Button>
          <Button onClick={clearHistory} variant="secondary">
            Clear
          </Button>
        </div>
      </div>

      <p className="text-sm text-gray-500 mt-2">
        {mode === 'auto'
          ? 'Auto mode: Server detects when you stop speaking (uses RealtimeUtteranceBuffer with server endpoint events).'
          : 'Push-to-talk: Hold the button to speak, release to send (uses RealtimeUtteranceBuffer with manual endpoint control).'}
      </p>

      <div className="flex gap-8 items-center p-4 bg-gray-50 rounded-lg mt-4">
        <div className="flex items-center gap-2">
          <span
            className={`w-3 h-3 rounded-full ${
              agentState === 'listening' || agentState === 'ready'
                ? 'bg-green-500'
                : agentState !== 'idle'
                  ? 'bg-amber-500 animate-pulse'
                  : 'bg-gray-400'
            }`}
          ></span>
          <span>
            State: <strong>{agentState}</strong>
          </span>
        </div>
        {!isPTT && (
          <div className="flex items-center gap-2">
            <span
              className={`w-3 h-3 rounded-full ${sttActive ? 'bg-green-500 animate-pulse' : 'bg-amber-500'}`}
            ></span>
            <span>
              STT: <strong>{sttActive ? 'active' : 'paused'}</strong>
            </span>
          </div>
        )}
        {isPTT && (
          <div className="flex items-center gap-2">
            <span
              className={`w-3 h-3 rounded-full ${
                recording ? 'bg-red-500 animate-pulse' : finalizing ? 'bg-amber-500 animate-pulse' : 'bg-gray-400'
              }`}
            ></span>
            <span>
              Status: <strong>{recording ? 'recording' : finalizing ? 'finalizing...' : 'ready'}</strong>
            </span>
          </div>
        )}
      </div>

      {isPTT && isRunning && (
        <div className="mt-4 flex justify-center">
          <button
            className={`px-8 py-4 text-lg font-bold rounded-full transition-all select-none ${
              recording
                ? 'bg-red-500 text-white scale-110 shadow-lg'
                : finalizing
                  ? 'bg-amber-500 text-white cursor-wait'
                  : 'bg-blue-600 text-white hover:bg-blue-700'
            }`}
            onMouseDown={startRecording}
            onMouseUp={stopRecording}
            onMouseLeave={() => recording && stopRecording()}
            onTouchStart={(e) => {
              e.preventDefault();
              startRecording();
            }}
            onTouchEnd={(e) => {
              e.preventDefault();
              stopRecording();
            }}
            disabled={finalizing}
          >
            {recording ? 'Recording...' : finalizing ? 'Finalizing...' : 'Hold to Talk'}
          </button>
        </div>
      )}

      <Panel title="You are saying...">
        <div className="min-h-8 p-2 bg-blue-50 rounded text-blue-600">{partial}</div>
      </Panel>

      <div ref={chatRef} className="max-h-96 overflow-y-auto p-4 border border-gray-300 rounded-lg mt-4 space-y-3">
        {messages.length === 0 && (
          <div className="text-gray-400 text-center py-8">
            {isPTT ? 'Hold the button and speak...' : 'Start speaking...'}
          </div>
        )}
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`p-3 rounded-lg max-w-[85%] ${msg.role === 'user' ? 'bg-blue-600 text-white ml-auto' : 'bg-gray-100 mr-auto'}`}
          >
            <div className={`text-xs font-semibold mb-1 ${msg.role === 'user' ? 'text-blue-200' : 'text-gray-500'}`}>
              {msg.role === 'user' ? 'You' : 'Assistant'}
            </div>
            <div className="whitespace-pre-wrap">{msg.content}</div>
          </div>
        ))}
        {streamingContent && (
          <div className="p-3 rounded-lg max-w-[85%] bg-gray-100 mr-auto">
            <div className="text-xs font-semibold mb-1 text-gray-500">Assistant</div>
            <div className="whitespace-pre-wrap">
              {streamingContent}
              <span className="animate-pulse">|</span>
            </div>
          </div>
        )}
      </div>

      <Panel title="Event Log">
        <pre className="whitespace-pre-wrap break-words font-mono text-sm max-h-48 overflow-y-auto">
          {logs.join('\n')}
        </pre>
      </Panel>
    </>
  );
}
