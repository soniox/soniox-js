import { useState, useRef, useEffect, useCallback } from 'preact/hooks';
import { Checkbox, Button, Panel, formatTime } from './components';

export function AsyncTab() {
  const [audioUrl, setAudioUrl] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const [diarization, setDiarization] = useState(false);
  const [languageId, setLanguageId] = useState(true);
  const [waitForCompletion, setWaitForCompletion] = useState(true);
  const [loading, setLoading] = useState(false);
  const [transcriptions, setTranscriptions] = useState([]);
  const [selectedTranscription, setSelectedTranscription] = useState(null);
  const [transcript, setTranscript] = useState(null);
  const [uploadedFiles, setUploadedFiles] = useState([]);
  const [logs, setLogs] = useState([]);

  const fileInputRef = useRef(null);

  const log = useCallback((msg) => {
    setLogs((prev) => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev.slice(0, 99)]);
  }, []);

  const fetchTranscriptions = useCallback(async () => {
    try {
      const res = await fetch('/transcriptions?limit=20');
      const data = await res.json();
      setTranscriptions(data.transcriptions || []);
      log(`Loaded ${data.transcriptions?.length || 0} transcriptions`);
    } catch (err) {
      log(`Error loading transcriptions: ${err.message}`);
    }
  }, [log]);

  const fetchFiles = useCallback(async () => {
    try {
      const res = await fetch('/files');
      const data = await res.json();
      setUploadedFiles(Array.isArray(data) ? data : []);
      log(`Loaded ${Array.isArray(data) ? data.length : 0} files`);
    } catch (err) {
      log(`Error loading files: ${err.message}`);
    }
  }, [log]);

  const deleteFile = useCallback(
    async (id) => {
      log(`Deleting file ${id}...`);
      try {
        const res = await fetch(`/files/${id}`, { method: 'DELETE' });
        if (!res.ok) throw new Error('Delete failed');
        log(`File ${id} deleted`);
        fetchFiles();
      } catch (err) {
        log(`Error: ${err.message}`);
      }
    },
    [log, fetchFiles]
  );

  useEffect(() => {
    fetchTranscriptions();
    fetchFiles();
  }, []);

  const transcribeFromUrl = useCallback(async () => {
    if (!audioUrl.trim()) {
      log('Please enter an audio URL');
      return;
    }
    setLoading(true);
    log(`Starting transcription from URL: ${audioUrl}`);
    try {
      const res = await fetch('/transcriptions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          audio_url: audioUrl.trim(),
          wait: waitForCompletion,
          enable_speaker_diarization: diarization,
          enable_language_identification: languageId,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Request failed');
      log(`Transcription created: ${data.id} (status: ${data.status})`);
      setSelectedTranscription(data);
      fetchTranscriptions();
    } catch (err) {
      log(`Error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }, [audioUrl, waitForCompletion, diarization, languageId, log, fetchTranscriptions]);

  const transcribeFromFile = useCallback(async () => {
    if (!selectedFile) {
      log('Please select a file');
      return;
    }
    setLoading(true);
    log(`Uploading file: ${selectedFile.name}`);
    try {
      // First upload the file
      const uploadRes = await fetch('/files', {
        method: 'POST',
        headers: { 'X-Filename': selectedFile.name },
        body: selectedFile,
      });
      const file = await uploadRes.json();
      if (!uploadRes.ok) throw new Error(file.error || 'Upload failed');
      log(`File uploaded: ${file.id}`);

      // Then create transcription from file_id
      const res = await fetch('/transcriptions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          file_id: file.id,
          wait: waitForCompletion,
          enable_speaker_diarization: diarization,
          enable_language_identification: languageId,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Request failed');
      log(`Transcription created: ${data.id} (status: ${data.status})`);
      setSelectedTranscription(data);
      fetchTranscriptions();
      fetchFiles();
    } catch (err) {
      log(`Error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }, [selectedFile, waitForCompletion, diarization, languageId, log, fetchTranscriptions, fetchFiles]);

  const viewTranscript = useCallback(
    async (id) => {
      log(`Loading transcript for ${id}...`);
      try {
        const res = await fetch(`/transcriptions/${id}/transcript`);
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || 'Not found');
        }
        const data = await res.json();
        setTranscript(data);
        log(`Transcript loaded: ${data.parsed?.length || 0} segments`);
      } catch (err) {
        log(`Error: ${err.message}`);
        setTranscript(null);
      }
    },
    [log]
  );

  const waitForTranscription = useCallback(
    async (id) => {
      log(`Waiting for transcription ${id}...`);
      try {
        const res = await fetch(`/transcriptions/${id}/wait`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ timeout_ms: 60000 }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Wait failed');
        log(`Transcription ${id} status: ${data.status}`);
        setSelectedTranscription(data);
        fetchTranscriptions();
        if (data.status === 'completed') {
          viewTranscript(id);
        }
      } catch (err) {
        log(`Error: ${err.message}`);
      }
    },
    [log, fetchTranscriptions, viewTranscript]
  );

  const deleteTranscription = useCallback(
    async (id) => {
      log(`Deleting transcription ${id}...`);
      try {
        const res = await fetch(`/transcriptions/${id}`, { method: 'DELETE' });
        if (!res.ok) throw new Error('Delete failed');
        log(`Transcription ${id} deleted`);
        if (selectedTranscription?.id === id) {
          setSelectedTranscription(null);
          setTranscript(null);
        }
        fetchTranscriptions();
      } catch (err) {
        log(`Error: ${err.message}`);
      }
    },
    [log, selectedTranscription, fetchTranscriptions]
  );

  const deleteAllFiles = useCallback(async () => {
    if (!confirm('Delete ALL uploaded files? This cannot be undone.')) return;
    log('Deleting all files...');
    try {
      const res = await fetch('/files/delete_all', { method: 'POST' });
      if (!res.ok) throw new Error('Delete failed');
      log(`Deleted all files`);
      setUploadedFiles([]);
    } catch (err) {
      log(`Error: ${err.message}`);
    }
  }, [log]);

  const deleteAllTranscriptions = useCallback(async () => {
    if (!confirm('Delete ALL transcriptions? This cannot be undone.')) return;
    log('Deleting all transcriptions...');
    try {
      const res = await fetch('/transcriptions/delete_all', { method: 'POST' });
      if (!res.ok) throw new Error('Delete failed');
      log(`Deleted all transcriptions`);
      setTranscriptions([]);
      setSelectedTranscription(null);
      setTranscript(null);
    } catch (err) {
      log(`Error: ${err.message}`);
    }
  }, [log]);

  const selectTranscription = useCallback(
    async (t) => {
      setSelectedTranscription(t);
      setTranscript(null);
      if (t.status === 'completed') {
        viewTranscript(t.id);
      }
    },
    [viewTranscript]
  );

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
      {/* Left column: Create transcription */}
      <div>
        <h3 className="font-semibold text-lg mb-3">Create Transcription</h3>

        <Panel title="From URL">
          <div className="space-y-3">
            <input
              type="text"
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
              placeholder="https://soniox.com/media/examples/coffee_shop.mp3"
              value={audioUrl}
              onInput={(e) => setAudioUrl(e.target.value)}
            />
            <Button onClick={transcribeFromUrl} disabled={loading || !audioUrl.trim()}>
              {loading ? 'Processing...' : 'Transcribe URL'}
            </Button>
          </div>
        </Panel>

        <Panel title="From File">
          <div className="space-y-3">
            <input
              ref={fileInputRef}
              type="file"
              accept="audio/*,video/*"
              className="w-full"
              onChange={(e) => setSelectedFile(e.target.files[0] || null)}
            />
            <Button onClick={transcribeFromFile} disabled={loading || !selectedFile}>
              {loading ? 'Processing...' : 'Upload & Transcribe'}
            </Button>
          </div>
        </Panel>

        <Panel title="Options">
          <div className="flex flex-wrap gap-4">
            <Checkbox label="Speaker Diarization" checked={diarization} onChange={setDiarization} />
            <Checkbox label="Language ID" checked={languageId} onChange={setLanguageId} />
            <Checkbox label="Wait for completion" checked={waitForCompletion} onChange={setWaitForCompletion} />
          </div>
        </Panel>

        <Panel title="Log">
          <pre className="whitespace-pre-wrap break-words font-mono text-sm max-h-32 overflow-y-auto">
            {logs.join('\n')}
          </pre>
        </Panel>
      </div>

      {/* Right column: Transcriptions list */}
      <div>
        <div className="items-center mb-3">
          <h3 className="font-semibold text-lg mb-2">Transcriptions</h3>
          <div className="flex gap-2">
            <Button onClick={fetchTranscriptions} variant="secondary">
              Refresh
            </Button>
            <Button onClick={deleteAllTranscriptions} variant="secondary">
              Delete All Transcriptions
            </Button>
          </div>
        </div>

        <div className="border border-gray-300 rounded-lg max-h-64 overflow-y-auto">
          {transcriptions.length === 0 ? (
            <div className="p-4 text-gray-500 text-center">No transcriptions</div>
          ) : (
            transcriptions.map((t) => (
              <div
                key={t.id}
                className={`p-3 border-b border-gray-200 last:border-b-0 cursor-pointer hover:bg-gray-50 ${selectedTranscription?.id === t.id ? 'bg-blue-50' : ''}`}
                onClick={() => selectTranscription(t)}
              >
                <div className="flex justify-between items-start">
                  <div className="truncate flex-1 mr-2">
                    <div className="font-mono text-xs text-gray-500">{t.id.substring(0, 8)}...</div>
                    <div className="text-sm truncate">{t.filename || t.audio_url || 'Unknown source'}</div>
                  </div>
                  <span
                    className={`px-2 py-0.5 text-xs rounded-full ${
                      t.status === 'completed'
                        ? 'bg-green-100 text-green-700'
                        : t.status === 'error'
                          ? 'bg-red-100 text-red-700'
                          : 'bg-yellow-100 text-yellow-700'
                    }`}
                  >
                    {t.status}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>

        {selectedTranscription && (
          <Panel title="Selected Transcription">
            <div className="space-y-2 text-sm">
              <div>
                <strong>ID:</strong> <span className="font-mono">{selectedTranscription.id}</span>
              </div>
              <div>
                <strong>Status:</strong> {selectedTranscription.status}
              </div>
              <div>
                <strong>Model:</strong> {selectedTranscription.model}
              </div>
              {selectedTranscription.duration_ms && (
                <div>
                  <strong>Duration:</strong> {(selectedTranscription.duration_ms / 1000).toFixed(1)}s
                </div>
              )}
              {selectedTranscription.enable_speaker_diarization && <div>Speaker Diarization enabled</div>}
              {selectedTranscription.enable_language_identification && <div>Language ID enabled</div>}
              <div className="flex gap-2 pt-2">
                {selectedTranscription.status !== 'completed' && (
                  <Button onClick={() => waitForTranscription(selectedTranscription.id)} variant="secondary">
                    Wait
                  </Button>
                )}
                {selectedTranscription.status === 'completed' && (
                  <Button onClick={() => viewTranscript(selectedTranscription.id)} variant="secondary">
                    View Transcript
                  </Button>
                )}
                <Button onClick={() => deleteTranscription(selectedTranscription.id)} variant="secondary">
                  Delete
                </Button>
              </div>
            </div>
          </Panel>
        )}

        {transcript && (
          <Panel title="Transcript">
            <div className="mb-3 p-3 bg-gray-50 rounded">
              <div className="text-sm text-gray-500 mb-1">Full Text</div>
              <div className="whitespace-pre-wrap">{transcript.text}</div>
            </div>
            <div className="text-sm text-gray-500 mb-2">Segments ({transcript.parsed?.length || 0})</div>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {(transcript.parsed || []).map((seg, i) => (
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
              ))}
            </div>
          </Panel>
        )}

        <div className="items-center mt-6 mb-3">
          <h3 className="font-semibold text-lg mb-2">Uploaded Files</h3>
          <div className="flex gap-2">
            <Button onClick={fetchFiles} variant="secondary">
              Refresh
            </Button>
            <Button onClick={deleteAllFiles} variant="secondary">
              Delete All Files
            </Button>
          </div>
        </div>

        <div className="border border-gray-300 rounded-lg max-h-48 overflow-y-auto">
          {uploadedFiles.length === 0 ? (
            <div className="p-4 text-gray-500 text-center">No files</div>
          ) : (
            uploadedFiles.map((f) => (
              <div
                key={f.id}
                className="p-3 border-b border-gray-200 last:border-b-0 flex justify-between items-center"
              >
                <div className="truncate flex-1 mr-2">
                  <div className="text-sm font-medium truncate">{f.filename}</div>
                  <div className="text-xs text-gray-500">
                    {f.id.substring(0, 8)}... &middot; {(f.size / 1024).toFixed(1)} KB &middot;{' '}
                    {new Date(f.created_at).toLocaleString()}
                  </div>
                </div>
                <button
                  className="text-xs text-red-600 hover:text-red-800 font-semibold whitespace-nowrap"
                  onClick={() => deleteFile(f.id)}
                >
                  Delete
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
