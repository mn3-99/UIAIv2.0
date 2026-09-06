import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { ErrorBoundary } from './ErrorBoundary.tsx';
import { ComposerFocusProvider } from './components/ComposerFocusContext.tsx';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <ComposerFocusProvider>
        <App />
      </ComposerFocusProvider>
    </ErrorBoundary>
  </StrictMode>,
);

