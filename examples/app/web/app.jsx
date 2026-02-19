import { render } from 'preact';
import { useState, useEffect, useCallback } from 'preact/hooks';
import { SonioxProvider } from '@soniox/react';
import { ClientTab } from './client-tab';
import { TranscriptionTab } from './realtime-tab';
import { AgentTab } from './agent-tab';
import { AsyncTab } from './async-tab';
import { Button } from './components';

function ApiTokenBar({ onTokenChange }) {
  const [source, setSource] = useState(null); // 'custom' | 'env' | 'none' | null (loading)
  const [apiKey, setApiKey] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch('/api-token/status');
      const data = await res.json();
      setSource(data.source);
    } catch {
      setSource('none');
    }
  }, []);

  useEffect(() => {
    fetchStatus();
  }, []);

  const saveToken = useCallback(async () => {
    if (!apiKey.trim()) return;
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ api_key: apiKey.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save');
      setSource(data.source);
      setApiKey('');
      onTokenChange();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }, [apiKey, onTokenChange]);

  const clearToken = useCallback(async () => {
    setError('');
    try {
      const res = await fetch('/api-token', { method: 'DELETE' });
      const data = await res.json();
      setSource(data.source);
      onTokenChange();
    } catch (err) {
      setError(err.message);
    }
  }, [onTokenChange]);

  if (source === null) return null; // still loading

  const badge =
    source === 'custom'
      ? { text: 'Using custom token', color: 'bg-blue-100 text-blue-700' }
      : source === 'env'
        ? { text: 'Using ENV token', color: 'bg-green-100 text-green-700' }
        : { text: 'No API key configured', color: 'bg-red-100 text-red-700' };

  return (
    <div className="mb-6 p-4 border border-gray-200 rounded-lg bg-gray-50">
      <div className="flex items-center gap-3 flex-wrap">
        <span className={`px-2.5 py-1 text-xs font-semibold rounded-full ${badge.color}`}>{badge.text}</span>

        {source === 'custom' ? (
          <Button onClick={clearToken} variant="secondary">
            Clear custom token
          </Button>
        ) : (
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <input
              type="password"
              className="flex-1 min-w-0 px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Enter your Soniox API key"
              value={apiKey}
              onInput={(e) => setApiKey(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && saveToken()}
            />
            <Button onClick={saveToken} disabled={saving || !apiKey.trim()}>
              {saving ? 'Saving...' : 'Save'}
            </Button>
          </div>
        )}
      </div>
      {error && <div className="mt-2 text-sm text-red-600">{error}</div>}
    </div>
  );
}

function App() {
  const [activeTab, setActiveTab] = useState('client');
  const [tokenVersion, setTokenVersion] = useState(0);

  const handleTokenChange = useCallback(() => {
    setTokenVersion((v) => v + 1);
  }, []);

  const tabs = [
    { id: 'client', label: 'Client SDK' },
    { id: 'realtime', label: 'Realtime' },
    { id: 'async', label: 'Async' },
    { id: 'agent', label: 'Voice Agent' },
  ];

  return (
    <div className="max-w-4xl mx-auto p-6">
      <h1 className="text-3xl font-bold">Soniox SDK Demo</h1>
      <p className="text-gray-500 mt-1">Explore Soniox speech-to-text capabilities.</p>

      <div className="mt-4">
        <ApiTokenBar onTokenChange={handleTokenChange} />
      </div>

      <SonioxProvider
        key={tokenVersion}
        apiKey={async () => {
          const res = await fetch('/tmp-key');
          if (!res.ok) throw new Error('Failed to fetch temporary API key');
          const data = await res.json();
          return data.api_key;
        }}
      >
        <div className="flex mt-2 border-b-2 border-gray-300">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              className={`px-6 py-3 font-semibold -mb-0.5 border-b-2 transition-colors ${activeTab === tab.id ? 'text-blue-600 border-blue-600' : 'text-gray-500 border-transparent hover:text-gray-700'}`}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {activeTab === 'client' && <ClientTab />}
        {activeTab === 'realtime' && <TranscriptionTab key={tokenVersion} />}
        {activeTab === 'async' && <AsyncTab key={tokenVersion} />}
        {activeTab === 'agent' && <AgentTab key={tokenVersion} />}
      </SonioxProvider>
    </div>
  );
}

render(<App />, document.getElementById('app'));
