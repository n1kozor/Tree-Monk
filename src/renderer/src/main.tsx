import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './i18n'
import './index.css'
import '@xyflow/react/dist/style.css'
import { initTheme } from './store/useTheme'
import { initSettings } from './store/useSettings'

initTheme()
initSettings()

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
