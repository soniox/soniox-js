import { render } from 'preact';
import { useState } from 'preact/hooks';
import { TranscriptionTab } from './realtime-tab';
import { AgentTab } from './agent-tab';
import { AsyncTab } from './async-tab';

function App() {
  const [activeTab, setActiveTab] = useState('realtime');

  const tabs = [
    { id: 'realtime', label: 'Realtime' },
    { id: 'async', label: 'Async' },
    { id: 'agent', label: 'Voice Agent' },
  ];

  return (
    <div className="max-w-4xl mx-auto p-6">
      <h1 className="text-3xl font-bold">Soniox SDK Demo</h1>
      <p className="text-gray-500 mt-1">Explore Soniox speech-to-text capabilities.</p>

      <div className="flex mt-6 border-b-2 border-gray-300">
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

      {activeTab === 'realtime' && <TranscriptionTab />}
      {activeTab === 'async' && <AsyncTab />}
      {activeTab === 'agent' && <AgentTab />}
    </div>
  );
}

render(<App />, document.getElementById('app'));
