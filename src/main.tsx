import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// --- GLOBAL SAFEGUARD ---
// The application occasionally gets polluted with HTMLAudioElement refs in React state.
// This global patch intercepts all stringify calls and strips out DOM Elements and circular React fibers,
// preventing Uncaught TypeError: Converting circular structure to JSON crashes globally.
const originalStringify = JSON.stringify;
JSON.stringify = function (value: any, replacer?: any, space?: string | number): string {
  const customReplacer = (key: string, val: any) => {
    // Strip DOM elements and HTMLAudioElements safely
    if (
      (typeof Element !== 'undefined' && val instanceof Element) ||
      (val && typeof val === 'object' && Object.prototype.toString.call(val) === '[object HTMLAudioElement]')
    ) {
      return undefined;
    }
    // Strip React fibers
    if (key.startsWith('__reactFiber') || key.startsWith('__reactProps')) {
      return undefined;
    }
    // Call original replacer if provided
    if (replacer && typeof replacer === 'function') {
      return replacer(key, val);
    }
    return val;
  };

  try {
    return originalStringify(value, customReplacer, space);
  } catch (err: any) {
    if (err.message && err.message.includes('circular structure')) {
      console.warn("Circular reference detected and swallowed by global JSON.stringify patch.");
      return "{}"; // Safe fallback
    }
    throw err;
  }
};
// ------------------------

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
