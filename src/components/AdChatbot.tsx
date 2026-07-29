'use client';

import React from 'react';
import { useMcpChat as useChat } from '@/hooks/useMcpChat';

interface ChatbotProps {
  /** Company to scope the query to. The Meta token stays sealed server-side. */
  companyId: string;
}

export const AdChatbot: React.FC<ChatbotProps> = ({ companyId }) => {
  const { messages, input, handleInputChange, handleSubmit, isLoading } = useChat({
    api: '/api/mcp-chat',
    body: { companyId },
  });

  return (
    <div className="flex flex-col h-[600px] w-full border border-slate-200 rounded-xl bg-white shadow-sm overflow-hidden">
      {/* Header element */}
      <div className="bg-slate-900 px-4 py-3 text-white">
        <h3 className="font-semibold text-sm">Basira AI Copilot</h3>
        <p className="text-xs text-slate-400">Powered by Meta Remote MCP Server</p>
      </div>

      {/* Message Output Frame */}
      <div className="flex-1 p-4 overflow-y-auto space-y-4 bg-slate-50">
        {messages.map((msg) => (
          <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] p-3 rounded-xl text-sm ${msg.role === 'user' ? 'bg-blue-600 text-white' : 'bg-white text-slate-800 border border-slate-200'}`}>
              <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-white text-slate-400 border border-slate-200 p-3 rounded-xl text-xs animate-pulse">
              Querying Meta Ad Insights...
            </div>
          </div>
        )}
      </div>

      {/* Fixed Submission Bar */}
      <form onSubmit={handleSubmit} className="border-t border-slate-200 p-3 flex gap-2 bg-white">
        <input
          value={input}
          onChange={handleInputChange}
          placeholder="Ask something like: Why did my campaign ROAS drop yesterday?"
          className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button type="submit" disabled={isLoading} className="bg-slate-900 text-white font-medium text-sm px-4 py-2 rounded-lg hover:bg-slate-800 disabled:opacity-50">
          Send
        </button>
      </form>
    </div>
  );
};
