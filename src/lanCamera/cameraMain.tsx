import React from 'react';
import ReactDOM from 'react-dom/client';
import '../index.css';
import '../App.css';
import CameraPage from './CameraPage';
import { applyTheme, storedTheme } from '../helpers/theme';

// The dashboard's light or dark choice, from this browser.
applyTheme(storedTheme(), document.documentElement);

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <CameraPage />
  </React.StrictMode>
);
