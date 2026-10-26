import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { upgradeHashUrl } from './router';
import './styles.css';

// An old #part/key URL becomes /part/key before the app reads the address.
upgradeHashUrl();

// Non-null assertion: index.html always has <div id="root">.
createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
        <App />
    </React.StrictMode>,
);
