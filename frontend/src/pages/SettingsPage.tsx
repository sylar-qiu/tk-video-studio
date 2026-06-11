import { NavLink, Navigate, Route, Routes } from 'react-router-dom'
import CategoriesSettings from './settings/CategoriesSettings'
import TagsSettings from './settings/TagsSettings'

export default function SettingsPage() {
  return (
    <div className="settings-page">
      <h1 className="page-title">设置</h1>

      <nav className="settings-nav">
        <NavLink to="/settings/categories" className="settings-nav-link">
          类目管理
        </NavLink>
        <NavLink to="/settings/tags" className="settings-nav-link">
          标签管理
        </NavLink>
      </nav>

      <Routes>
        <Route path="categories" element={<CategoriesSettings />} />
        <Route path="tags" element={<TagsSettings />} />
        <Route index element={<Navigate to="categories" replace />} />
      </Routes>
    </div>
  )
}
