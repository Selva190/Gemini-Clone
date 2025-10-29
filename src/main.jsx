import React from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.jsx';
import ContextProvider from './context/Context.jsx';

const container = document.getElementById('root');
if (!container) {
  throw new Error('Root container with id "root" not found in index.html');
}
const root = createRoot(container);
root.render(
  <React.StrictMode>
    <ContextProvider>
      <App />
    </ContextProvider>
  </React.StrictMode>
);