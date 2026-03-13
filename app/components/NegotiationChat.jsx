'use client';
import { useState, useRef, useEffect, useCallback } from 'react';

export default function NegotiationChat({ analysisContext, isOpen, onClose }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (isOpen && !minimized) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen, minimized]);

  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text || loading) return;

    const userMessage = { role: 'user', content: text };
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInput('');
    setLoading(true);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: newMessages,
          analysisContext,
        }),
      });

      const data = await res.json();
      if (data.error) {
        setMessages([...newMessages, { role: 'assistant', content: `Error: ${data.error}` }]);
      } else {
        setMessages([...newMessages, { role: 'assistant', content: data.response }]);
      }
    } catch (err) {
      setMessages([...newMessages, { role: 'assistant', content: `Connection error: ${err.message}` }]);
    } finally {
      setLoading(false);
    }
  }, [input, messages, loading, analysisContext]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const clearChat = () => {
    setMessages([]);
  };

  if (!isOpen) return null;

  const quickActions = [
    { label: 'Funder pushing back', prompt: 'The funder says our reduction is too aggressive and the term is too long. What are my counter-arguments?' },
    { label: 'COJ threat received', prompt: 'This funder just threatened to file a Confession of Judgment. What should I tell them?' },
    { label: 'Account freeze threat', prompt: 'The funder is threatening to freeze our bank account. What is our position and what should I say?' },
    { label: 'Counter-offer math', prompt: 'The funder wants to counter with a higher weekly payment. Help me evaluate if their counter is reasonable and what our range should be.' },
    { label: 'Reconciliation request', prompt: 'I need to draft a reconciliation request for this funder based on the contract terms. What should I include?' },
    { label: 'Why should they accept?', prompt: 'Give me the top 3 reasons this funder should accept our proposal, with specific numbers from the analysis.' },
  ];

  return (
    <div style={{
      position: 'fixed',
      bottom: 20,
      right: 20,
      width: minimized ? 280 : 420,
      height: minimized ? 48 : 600,
      maxHeight: '80vh',
      background: 'rgba(15, 15, 25, 0.98)',
      border: '1px solid rgba(0, 229, 255, 0.25)',
      borderRadius: 16,
      display: 'flex',
      flexDirection: 'column',
      zIndex: 9999,
      boxShadow: '0 8px 32px rgba(0, 0, 0, 0.6), 0 0 60px rgba(0, 229, 255, 0.08)',
      fontFamily: 'inherit',
      overflow: 'hidden',
      transition: 'all 0.3s ease',
    }}>
      {/* Header */}
      <div style={{
        padding: '12px 16px',
        background: 'rgba(0, 229, 255, 0.08)',
        borderBottom: minimized ? 'none' : '1px solid rgba(0, 229, 255, 0.15)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        cursor: 'pointer',
      }} onClick={() => setMinimized(!minimized)}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#4caf50', animation: loading ? 'pulse 1s infinite' : 'none' }} />
          <span style={{ fontSize: 13, fontWeight: 700, color: '#00e5ff' }}>Negotiation Advisor</span>
          {messages.length > 0 && <span style={{ fontSize: 10, color: 'rgba(232,232,240,0.4)' }}>({messages.filter(m => m.role === 'user').length} messages)</span>}
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {!minimized && messages.length > 0 && (
            <button onClick={(e) => { e.stopPropagation(); clearChat(); }} style={{ background: 'transparent', border: 'none', color: 'rgba(232,232,240,0.4)', cursor: 'pointer', fontSize: 11, padding: '2px 6px' }}>Clear</button>
          )}
          <button onClick={(e) => { e.stopPropagation(); setMinimized(!minimized); }} style={{ background: 'transparent', border: 'none', color: 'rgba(232,232,240,0.5)', cursor: 'pointer', fontSize: 16, padding: '0 4px', lineHeight: 1 }}>{minimized ? '△' : '▽'}</button>
          <button onClick={(e) => { e.stopPropagation(); onClose(); }} style={{ background: 'transparent', border: 'none', color: 'rgba(239,83,80,0.7)', cursor: 'pointer', fontSize: 16, padding: '0 4px', lineHeight: 1 }}>×</button>
        </div>
      </div>

      {!minimized && (
        <>
          {/* Messages */}
          <div style={{
            flex: 1,
            overflowY: 'auto',
            padding: 12,
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
          }}>
            {messages.length === 0 && (
              <div style={{ textAlign: 'center', padding: '20px 12px' }}>
                <div style={{ fontSize: 28, marginBottom: 8 }}>💬</div>
                <div style={{ fontSize: 13, color: 'rgba(232,232,240,0.5)', marginBottom: 16 }}>
                  Ask me anything about this deal — funder strategies, counter-arguments, talking points, or deal math.
                </div>
                <div style={{ fontSize: 10, color: 'rgba(232,232,240,0.3)', marginBottom: 16, textTransform: 'uppercase', letterSpacing: 0.5 }}>Quick Actions</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center' }}>
                  {quickActions.map((qa, i) => (
                    <button key={i} onClick={() => { setInput(qa.prompt); setTimeout(() => inputRef.current?.focus(), 50); }}
                      style={{
                        padding: '6px 10px', borderRadius: 6, fontSize: 11,
                        background: 'rgba(0,229,255,0.06)', border: '1px solid rgba(0,229,255,0.15)',
                        color: 'rgba(232,232,240,0.6)', cursor: 'pointer', fontFamily: 'inherit',
                        transition: 'all 0.15s ease',
                      }}
                      onMouseEnter={e => { e.target.style.background = 'rgba(0,229,255,0.12)'; e.target.style.color = '#00e5ff'; }}
                      onMouseLeave={e => { e.target.style.background = 'rgba(0,229,255,0.06)'; e.target.style.color = 'rgba(232,232,240,0.6)'; }}
                    >{qa.label}</button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((msg, i) => (
              <div key={i} style={{
                alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                maxWidth: '85%',
                padding: '10px 14px',
                borderRadius: msg.role === 'user' ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
                background: msg.role === 'user' ? 'rgba(0, 229, 255, 0.12)' : 'rgba(255, 255, 255, 0.05)',
                border: msg.role === 'user' ? '1px solid rgba(0, 229, 255, 0.2)' : '1px solid rgba(255, 255, 255, 0.08)',
                fontSize: 12,
                lineHeight: 1.7,
                color: msg.role === 'user' ? '#e8e8f0' : 'rgba(232, 232, 240, 0.85)',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}>
                {msg.content}
              </div>
            ))}

            {loading && (
              <div style={{
                alignSelf: 'flex-start',
                padding: '10px 14px',
                borderRadius: '14px 14px 14px 4px',
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                fontSize: 12,
                color: 'rgba(232, 232, 240, 0.4)',
              }}>
                <span style={{ animation: 'pulse 1s infinite' }}>Thinking...</span>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div style={{
            padding: '10px 12px',
            borderTop: '1px solid rgba(255, 255, 255, 0.06)',
            background: 'rgba(0, 0, 0, 0.2)',
          }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
              <textarea
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={loading ? 'Waiting for response...' : 'Ask about this deal... (Enter to send)'}
                disabled={loading}
                rows={1}
                style={{
                  flex: 1,
                  padding: '8px 12px',
                  borderRadius: 8,
                  border: '1px solid rgba(0, 229, 255, 0.2)',
                  background: 'rgba(0, 0, 0, 0.3)',
                  color: '#e8e8f0',
                  fontSize: 12,
                  fontFamily: 'inherit',
                  resize: 'none',
                  outline: 'none',
                  minHeight: 36,
                  maxHeight: 100,
                  lineHeight: 1.4,
                }}
                onInput={e => {
                  e.target.style.height = '36px';
                  e.target.style.height = Math.min(e.target.scrollHeight, 100) + 'px';
                }}
              />
              <button
                onClick={sendMessage}
                disabled={loading || !input.trim()}
                style={{
                  padding: '8px 14px',
                  borderRadius: 8,
                  border: 'none',
                  background: loading || !input.trim() ? 'rgba(0, 229, 255, 0.05)' : 'rgba(0, 229, 255, 0.2)',
                  color: loading || !input.trim() ? 'rgba(232,232,240,0.3)' : '#00e5ff',
                  fontSize: 12,
                  cursor: loading || !input.trim() ? 'not-allowed' : 'pointer',
                  fontFamily: 'inherit',
                  fontWeight: 600,
                  whiteSpace: 'nowrap',
                  transition: 'all 0.15s ease',
                }}
              >
                Send
              </button>
            </div>
            <div style={{ fontSize: 9, color: 'rgba(232,232,240,0.25)', marginTop: 4, textAlign: 'center' }}>
              Powered by Claude · References your full deal analysis in real-time
            </div>
          </div>
        </>
      )}

      <style>{`@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }`}</style>
    </div>
  );
}
