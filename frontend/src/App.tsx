import { NavLink, Route, Routes } from 'react-router-dom'
import AssetsPage from './pages/AssetsPage'
import ClipPage from './pages/ClipPage'
import ShotsPage from './pages/ShotsPage'
import ScriptsPage from './pages/ScriptsPage'
import ScriptEditorPage from './pages/ScriptEditorPage'
import CrossGenPage from './pages/CrossGenPage'
import ConcatPage from './pages/ConcatPage'
import WorksPage from './pages/WorksPage'
import ExportsPage from './pages/ExportsPage'
import ProductsPage from './pages/ProductsPage'
import SettingsPage from './pages/SettingsPage'
import LoginPage, { AuthGate } from './pages/LoginPage'

function AppShell() {
  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="logo">WJ Studio</div>
        <nav className="nav">
          <NavLink to="/products">产品</NavLink>
          <NavLink to="/" end>素材上传</NavLink>
          <NavLink to="/shots">素材库</NavLink>
          <NavLink to="/scripts">脚本</NavLink>
          <NavLink to="/works">作品</NavLink>
        </nav>
        <div className="topbar-actions">
          <NavLink to="/settings" className="btn btn-secondary btn-sm topbar-settings">
            设置
          </NavLink>
        </div>
      </header>
      <main className="main">
        <Routes>
          <Route path="/products" element={<ProductsPage />} />
          <Route path="/settings/*" element={<SettingsPage />} />
          <Route path="/" element={<AssetsPage />} />
          <Route path="/clip/:assetId" element={<ClipPage />} />
          <Route path="/shots" element={<ShotsPage />} />
          <Route path="/scripts" element={<ScriptsPage />} />
          <Route path="/scripts/cross-gen" element={<CrossGenPage />} />
          <Route path="/scripts/batch/new" element={<ScriptEditorPage />} />
          <Route path="/scripts/new" element={<ScriptEditorPage />} />
          <Route path="/scripts/:projectId" element={<ScriptEditorPage />} />
          <Route path="/concat" element={<ConcatPage />} />
          <Route path="/concat/:projectId" element={<ConcatPage />} />
          <Route path="/works" element={<WorksPage />} />
          <Route path="/exports" element={<ExportsPage />} />
        </Routes>
      </main>
    </div>
  )
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/*"
        element={
          <AuthGate>
            <AppShell />
          </AuthGate>
        }
      />
    </Routes>
  )
}
