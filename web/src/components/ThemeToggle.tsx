import { useState } from 'react';
import { Icon } from './Icons';

export type Theme = 'light' | 'dark';
const KEY = 'rsxTheme';

/** The theme index.html applied before the first paint: light unless this browser saved dark. */
export function currentTheme(): Theme {
    return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
}

function applyTheme(t: Theme) {
    document.documentElement.dataset.theme = t;
    const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    if (meta) meta.content = t === 'dark' ? '#14181d' : '#eef0f2';
    try {
        localStorage.setItem(KEY, t);
    } catch {
        // Storage can be blocked (private windows); the toggle still works for this visit.
    }
}

// Light/dark switch in the header. Light is the default; the choice is remembered in this browser.
export default function ThemeToggle() {
    const [theme, setTheme] = useState<Theme>(currentTheme);
    const dark = theme === 'dark';
    return (
        <button
            className="themebtn"
            type="button"
            title={dark ? 'Light mode' : 'Dark mode'}
            aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
            onClick={() => {
                const t: Theme = dark ? 'light' : 'dark';
                applyTheme(t);
                setTheme(t);
            }}
        >
            {dark ? <Icon.sun /> : <Icon.moon />}
        </button>
    );
}
