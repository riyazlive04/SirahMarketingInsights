'use client';

import React, { useState } from 'react';
import { AynMark } from '@/components/AynLogo';
import { useMcpChat as useChat } from '@/hooks/useMcpChat';

export type CopilotStatus = 'signed-out' | 'needs-connection' | 'ready';

interface FloatingChatProps {
  /**
   * Which company's ad data to query. Deliberately NOT the Meta access token: the
   * token stays sealed in `meta_credentials` and is decrypted server-side by the
   * gateway route, so it never reaches client JS. See README "Token handling".
   */
  companyId: string | null;
  /**
   * What the copilot can actually do right now. The gateway would answer 401/409 in
   * the first two cases; saying so up front, with the fix one click away, beats letting
   * someone type a question and get an error back.
   */
  status: CopilotStatus;
  workspaceName?: string;
}

/** Staggered typing dots. Tailwind's `delay-*` sets transition-delay, which has no
 *  effect on `animate-bounce` — the delay has to be an animation-delay. */
const DOT_DELAYS = ['0ms', '150ms', '300ms'];

const SUGGESTIONS = [
  'How did spend and ROAS move this week?',
  'Which campaigns spent without converting?',
  'Which creative format is performing best?',
];

/**
 * Basira AI Copilot — present on every screen, signed in or not.
 */
export const FloatingChatPanel: React.FC<FloatingChatProps> = ({
  companyId,
  status,
  workspaceName,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const { messages, input, setInput, handleInputChange, handleSubmit, isLoading } = useChat({
    api: '/api/mcp-chat',
    body: { companyId },
  });

  const ready = status === 'ready' && Boolean(companyId);

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end font-sans">

      {/* 1. FLOATING CHATBOX EXPANDED STATE */}
      {isOpen && (
        <div className="w-[400px] max-w-[calc(100vw-3rem)] h-[550px] max-h-[calc(100vh-8rem)] mb-4 bg-white border border-slate-200 rounded-2xl shadow-2xl flex flex-col overflow-hidden transition-all duration-300 transform scale-100 origin-bottom-right">

          {/* Panel Header Banner */}
          <div className="bg-slate-900 px-4 py-3 text-white flex justify-between items-center gap-2 shadow-sm">
            <div className="flex min-w-0 items-center gap-2.5">
              {/* The mark on the dark header ties the copilot back to Ayn without
                  renaming it — the product is Ayn, the assistant is Basira. */}
              <AynMark className="h-7 w-auto shrink-0" />
              <div className="min-w-0">
                <h3 className="font-bold text-sm tracking-wide">Basira AI Copilot</h3>
                <p className="truncate text-xs text-slate-400">
                  {ready && workspaceName ? workspaceName : 'Meta Ads MCP analytics'}
                </p>
              </div>
            </div>

            {/* Close Toggle Action Button */}
            <button
              onClick={() => setIsOpen(false)}
              className="text-slate-400 hover:text-white transition-colors p-1 rounded-lg hover:bg-slate-800"
              aria-label="Close chat panel"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Core Dynamic Content Message Body */}
          <div className="flex-1 p-4 overflow-y-auto space-y-4 bg-slate-50/50">
            {messages.length === 0 && (
              <div className="text-center py-8 px-4">
                <div className="bg-blue-50 text-blue-600 rounded-full h-12 w-12 flex items-center justify-center mx-auto mb-3">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                  </svg>
                </div>

                {ready ? (
                  <>
                    <h4 className="text-sm font-semibold text-slate-800">Ask about your ad account</h4>
                    <p className="text-xs text-slate-500 mt-1 max-w-[240px] mx-auto">
                      Answers come from your own live Meta data — not an estimate.
                    </p>

                    <div className="mt-4 space-y-1.5">
                      {SUGGESTIONS.map((suggestion) => (
                        <button
                          key={suggestion}
                          type="button"
                          onClick={() => setInput(suggestion)}
                          className="block w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-left text-[11px] leading-snug text-slate-600 transition-colors hover:border-slate-300 hover:text-slate-900"
                        >
                          {suggestion}
                        </button>
                      ))}
                    </div>
                  </>
                ) : (
                  <>
                    <h4 className="text-sm font-semibold text-slate-800">
                      {status === 'signed-out'
                        ? 'Sign in to ask about your ads'
                        : 'Connect an ad account first'}
                    </h4>
                    <p className="text-xs text-slate-500 mt-1 max-w-[250px] mx-auto leading-relaxed">
                      {status === 'signed-out'
                        ? 'The copilot answers from your own Meta ad data, so it needs to know whose account to read.'
                        : 'Add a Meta access token and the copilot can query your live campaigns, spend and creatives.'}
                    </p>

                    <a
                      href={status === 'signed-out' ? '/api/auth/google' : '/setup'}
                      className="mt-4 inline-flex rounded-xl bg-slate-900 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-slate-800"
                    >
                      {status === 'signed-out' ? 'Continue with Google' : 'Connect ad account'}
                    </a>
                  </>
                )}
              </div>
            )}

            {messages.map((msg) => (
              <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] px-3.5 py-2.5 rounded-2xl text-xs leading-relaxed ${
                  msg.role === 'user'
                    ? 'bg-blue-600 text-white shadow-sm rounded-tr-none'
                    : 'bg-white text-slate-800 border border-slate-200/80 shadow-sm rounded-tl-none'
                }`}>
                  <p className="whitespace-pre-wrap">{msg.content}</p>
                </div>
              </div>
            ))}

            {isLoading && (
              <div className="flex justify-start items-center space-x-2">
                <div className="bg-white border border-slate-200 px-3.5 py-2.5 rounded-2xl rounded-tl-none shadow-sm flex items-center space-x-1.5">
                  {DOT_DELAYS.map((delay) => (
                    <span
                      key={delay}
                      className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce"
                      style={{ animationDelay: delay }}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Secure Context Input Controls Container */}
          <form onSubmit={handleSubmit} className="border-t border-slate-100 p-3 flex gap-2 bg-white">
            <input
              value={input}
              onChange={handleInputChange}
              disabled={!ready}
              placeholder={
                ready
                  ? 'Query creative assets or spend flags...'
                  : status === 'signed-out'
                    ? 'Sign in to start asking'
                    : 'Connect an ad account to start asking'
              }
              className="flex-1 px-3.5 py-2 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all disabled:bg-slate-50 disabled:text-slate-400"
            />
            <button
              type="submit"
              disabled={!ready || isLoading || !input.trim()}
              className="bg-slate-900 text-white font-medium text-xs px-3.5 py-2 rounded-xl hover:bg-slate-800 transition-all disabled:opacity-40 shadow-sm"
            >
              Ask
            </button>
          </form>
        </div>
      )}

      {/* 2. CIRCULAR MAIN FLOATING ACTION TRIGGER TOGGLE BUTTON */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`h-14 w-14 rounded-full flex items-center justify-center shadow-xl text-white transform hover:scale-105 active:scale-95 transition-all duration-200 ${
          isOpen ? 'bg-slate-800 rotate-180' : 'bg-slate-950'
        }`}
        aria-label="Toggle Basira AI Copilot"
        aria-expanded={isOpen}
      >
        {isOpen ? (
          /* Downwards Minimize Vector */
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
          </svg>
        ) : (
          /* Modern Tech Messages Vector Bubble */
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
        )
        }
      </button>

    </div>
  );
};
