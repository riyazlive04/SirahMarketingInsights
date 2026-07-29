'use client';

import React, { useState } from 'react';
import {
  ChartColumn,
  Images,
  LayoutDashboard,
  Menu,
  MessageSquare,
  Settings,
  X,
} from 'lucide-react';

const NAV_ITEMS = [
  { label: 'Overview', icon: LayoutDashboard, active: true },
  { label: 'Campaigns', icon: ChartColumn, active: false },
  { label: 'Creatives', icon: Images, active: false },
  { label: 'AI Assistant', icon: MessageSquare, active: false },
  { label: 'Settings', icon: Settings, active: false },
];

/**
 * Core dashboard layout: a persistent left-hand navigation column on `lg` and up,
 * collapsing to an off-canvas drawer on smaller frames (PRD §6, Step 1).
 */
export function DashboardShell({ children }: { children: React.ReactNode }) {
  const [navOpen, setNavOpen] = useState(false);

  return (
    <div className="flex min-h-screen bg-slate-50 text-slate-900">
      {/* Backdrop for the mobile drawer */}
      {navOpen && (
        <button
          type="button"
          aria-label="Close navigation"
          onClick={() => setNavOpen(false)}
          className="fixed inset-0 z-30 bg-slate-900/40 lg:hidden"
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-slate-200 bg-white transition-transform duration-200 lg:static lg:translate-x-0 ${
          navOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <p className="text-sm font-semibold">Meta Ads MCP</p>
            <p className="text-xs text-slate-500">Insights Console</p>
          </div>
          <button
            type="button"
            aria-label="Close navigation"
            onClick={() => setNavOpen(false)}
            className="text-slate-400 hover:text-slate-900 lg:hidden"
          >
            <X className="size-4" />
          </button>
        </div>

        <nav className="flex-1 space-y-1 p-3">
          {NAV_ITEMS.map(({ label, icon: Icon, active }) => (
            <button
              key={label}
              type="button"
              className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                active
                  ? 'bg-slate-900 font-medium text-white'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <Icon className="size-4" />
              {label}
            </button>
          ))}
        </nav>

        <div className="border-t border-slate-200 px-5 py-4">
          <p className="text-xs text-slate-500">App A · Developer Mode</p>
          <p className="text-xs text-slate-400">Read-only reporting (V1)</p>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-3 lg:px-8">
          <button
            type="button"
            aria-label="Open navigation"
            onClick={() => setNavOpen(true)}
            className="text-slate-500 hover:text-slate-900 lg:hidden"
          >
            <Menu className="size-5" />
          </button>
          <div>
            <h1 className="text-base font-semibold">Performance Overview</h1>
            <p className="text-xs text-slate-500">Last 25 days · All active campaigns</p>
          </div>
        </header>

        <main className="min-w-0 flex-1 p-4 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
