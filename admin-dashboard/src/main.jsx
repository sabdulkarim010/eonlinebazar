import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './index.css';

try {
  const raw = localStorage.getItem('admin-theme');
  if (raw) {
    const parsed = JSON.parse(raw);
    if (parsed?.state?.darkMode) {
      document.documentElement.classList.add('dark');
    }
  }
} catch {
  // ignore
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter basename="/chat-admin">
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
