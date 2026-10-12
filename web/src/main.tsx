import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';

// Non-null assertion: index.html always has <div id="root">.
createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
        <App />
    </React.StrictMode>,
);
