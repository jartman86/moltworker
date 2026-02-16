import { useState } from 'react';
import BotStatus from './pages/BotStatus';
import SoulEditor from './pages/SoulEditor';
import SkillsManager from './pages/SkillsManager';
import Conversations from './pages/Conversations';
import Platforms from './pages/Platforms';
import Learning from './pages/Learning';
import './App.css';

type Tab = 'status' | 'soul' | 'skills' | 'conversations' | 'platforms' | 'learning';

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>('status');

  return (
    <div className="app">
      <header className="app-header">
        <img src="/logo-small.png" alt="Moltworker" className="header-logo" />
        <h1>Moltbot Admin</h1>
      </header>
      <nav className="tab-nav">
        {([
          ['status', 'Status'],
          ['soul', 'Soul'],
          ['skills', 'Skills'],
          ['platforms', 'Platforms'],
          ['learning', 'Learning'],
          ['conversations', 'Conversations'],
        ] as const).map(([key, label]) => (
          <button
            key={key}
            className={`tab-btn ${activeTab === key ? 'active' : ''}`}
            onClick={() => setActiveTab(key)}
          >
            {label}
          </button>
        ))}
      </nav>
      <main className="app-main">
        {activeTab === 'status' && <BotStatus />}
        {activeTab === 'soul' && <SoulEditor />}
        {activeTab === 'skills' && <SkillsManager />}
        {activeTab === 'platforms' && <Platforms />}
        {activeTab === 'learning' && <Learning />}
        {activeTab === 'conversations' && <Conversations />}
      </main>
    </div>
  );
}
