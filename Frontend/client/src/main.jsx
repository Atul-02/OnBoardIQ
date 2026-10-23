import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from './auth';
import App from './App';
import './styles.css';

// StrictMode is left out on purpose: in development it runs effects twice, which would log
// every document view twice in the audit trail.
createRoot(document.getElementById('root')).render(
  <BrowserRouter>
    <AuthProvider>
      <App />
    </AuthProvider>
  </BrowserRouter>
);
