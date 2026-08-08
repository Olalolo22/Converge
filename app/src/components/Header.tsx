import React from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import type { AppMode } from '../types/converge';

interface HeaderProps {
  mode: AppMode;
  onModeChange: (mode: AppMode) => void;
  onLogoClick: () => void;
}

export function Header({ mode, onModeChange, onLogoClick }: HeaderProps) {
  const { connected } = useWallet();

  return (
    <header className="header">
      <div className="header__inner">
        {/* Logo */}
        <div className="header__logo" onClick={onLogoClick}>
          <div className="header__logo-mark">C</div>
          <span className="header__logo-name">Converge</span>
        </div>

        {/* ER status pill */}
        <div className="badge badge-er" style={{ fontSize: '0.7rem' }}>
          <span className="pulse-dot pulse-dot--purple" />
          {mode === 'real' ? 'MagicBlock ER · Devnet' : 'Simulator Mode'}
        </div>

        <div className="header__spacer" />

        <div className="header__actions">
          {/* Mode toggle */}
          <div className="mode-toggle">
            <button
              id="mode-btn-real"
              className={`mode-toggle__btn ${mode === 'real' ? 'mode-toggle__btn--active' : ''}`}
              onClick={() => onModeChange('real')}
              title="Use real MagicBlock ER endpoints (primary demo path)"
            >
              🔗 Real ER
            </button>
            <button
              id="mode-btn-sim"
              className={`mode-toggle__btn ${mode === 'simulator' ? 'mode-toggle__btn--active' : ''}`}
              onClick={() => onModeChange('simulator')}
              title="In-memory simulator for offline demo"
            >
              🧪 Sim
            </button>
          </div>

          {/* Wallet connect */}
          <WalletMultiButton />
        </div>
      </div>
    </header>
  );
}
