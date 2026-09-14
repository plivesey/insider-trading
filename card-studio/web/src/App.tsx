import { HashRouter, Link, Route, Routes } from 'react-router-dom';
import { CardListPage } from './pages/CardListPage.js';
import { TemplateManagerPage } from './pages/TemplateManagerPage.js';
import { CardEditorPage } from './pages/CardEditorPage.js';
import { SettingsPage } from './pages/SettingsPage.js';

export function App() {
  return (
    <HashRouter>
      <div className="app-shell">
        <nav className="top-nav">
          <Link to="/">Cards</Link>
          <Link to="/templates">Templates</Link>
          <Link to="/settings">Settings</Link>
        </nav>
        <Routes>
          <Route path="/" element={<CardListPage />} />
          <Route path="/templates" element={<TemplateManagerPage />} />
          <Route path="/cards/:id" element={<CardEditorPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Routes>
      </div>
    </HashRouter>
  );
}
