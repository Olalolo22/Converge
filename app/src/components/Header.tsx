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
  return (
    <header className="header">
      <div className="header__inner">
        {/* Brand */}
        <div className="header__brand" onClick={onLogoClick}>
          <div className="header__logo-mark">C</div>
          <span className="header__brand-name">Converge</span>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-muted)', borderLeft: '1px solid var(--border-subtle)', paddingLeft: '0.75rem' }}>
            MagicBlock ER
          </span>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          {/* Mode switch */}
          <div className="mode-switch">
            <button
              id="mode-btn-real"
              className={`mode-switch__btn ${mode === 'real' ? 'mode-switch__btn--active' : ''}`}
              onClick={() => onModeChange('real')}
              title="Use real MagicBlock Ephemeral Rollup endpoint"
            >
              Real ER
            </button>
            <button
              id="mode-btn-sim"
              className={`mode-switch__btn ${mode === 'simulator' ? 'mode-switch__btn--active' : ''}`}
              onClick={() => onModeChange('simulator')}
              title="In-memory simulator mode"
            >
              Simulator
            </button>
          </div>

          {/* Wallet button */}
          <WalletMultiButton />
        </div>
      </div>
    </header>
  );
}
