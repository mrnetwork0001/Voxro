import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.tsx';
import { I18nProvider } from './i18n.tsx';
import './styles.css';
import { ThemeProvider } from './theme.tsx';
import { initTelegram } from './telegram.ts';
import { WalletProvider } from './wallet/wallet.tsx';
import { OkxPrompt } from './components/OkxPrompt.tsx';

initTelegram();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <I18nProvider>
        <WalletProvider>
          <App />
          <OkxPrompt />
        </WalletProvider>
      </I18nProvider>
    </ThemeProvider>
  </StrictMode>,
);
