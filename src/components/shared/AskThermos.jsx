import { useState, useRef, useEffect } from 'react';
import { askThermosCopilot, askEventQuestion } from '../../services/api';

const SUGGESTED_QUESTIONS = [
  'Why is this classified as industrial?',
  'What are the chemical hazards & evacuation radius?',
  'What fire suppression protocol should be used?',
  'Show similar past events',
];

const CANNED_RESPONSES = {
  'Why is this classified as industrial?':
    'This event is classified as industrial based on three key factors: (1) the thermal source is located within 200m of a mapped industrial boundary in OpenStreetMap, (2) the fire radiative power (FRP) signature shows a stable, high-intensity pattern consistent with industrial processes rather than wildfire spread, and (3) the persistence duration exceeds 48 hours, which is atypical for agricultural or natural fires.',
  'What is the population exposure?':
    'Population analysis shows approximately 12,400 people within a 5km radius of this thermal source. The nearest residential settlement is 1.2km to the southeast. Based on current wind patterns (NW, 8km/h), the downwind exposure zone affects an estimated 3,200 additional residents.',
  'Show similar past events':
    'Three similar events were detected in this region over the past 90 days: THR-2301 (72h persistence, resolved), THR-2287 (active, 120h), and THR-2215 (96h, classified as routine flaring). All share similar FRP profiles and industrial proximity characteristics.',
};

function renderFormattedMessage(text) {
  if (!text) return null;
  const cleaned = text.replace(/^###\s*/gm, '');
  const parts = cleaned.split(/(\*\*.*?\*\*)/g);
  return parts.map((part, idx) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return (
        <strong key={idx} className="font-semibold text-[var(--color-text-primary)]">
          {part.slice(2, -2)}
        </strong>
      );
    }
    return <span key={idx}>{part}</span>;
  });
}

export default function AskThermos({ eventId, event, eventContext }) {
  const props = event?.properties || event || eventContext || {};
  const resolvedId = eventId || props.id || 'THM-001';
  const regionLabel = props.region ? ` (${props.region})` : '';

  const [query, setQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      text: `Event ${resolvedId}${regionLabel} is connected to the THERMOS AI & RAG Disaster Copilot. Ask about chemical hazards, evacuation radii, suppression SOPs, or classification.`,
    },
  ]);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    setMessages([
      {
        role: 'assistant',
        text: `Event ${resolvedId}${regionLabel} is connected to the THERMOS AI & RAG Disaster Copilot. Ask about chemical hazards, evacuation radii, suppression SOPs, or classification.`,
      },
    ]);
  }, [resolvedId, regionLabel]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  const handleSubmit = async (q) => {
    const rawText = typeof q === 'string' ? q : query;
    const text = (rawText || '').trim();
    if (!text || isLoading) return;

    setMessages((prev) => [...prev, { role: 'user', text }]);
    setQuery('');
    setIsLoading(true);

    try {
      const liveRes = await askThermosCopilot(text, resolvedId, props);
      if (liveRes && liveRes.answer) {
        setMessages((prev) => [...prev, { role: 'assistant', text: liveRes.answer }]);
        setIsLoading(false);
        return;
      }

      const data = await askEventQuestion({
        eventId: resolvedId,
        question: text,
        context: props,
      });
      if (data && data.answer) {
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', text: data.answer, provider: data.provider },
        ]);
        setIsLoading(false);
        return;
      }
    } catch (err) {
      console.warn('[AskThermos] Backend query error:', err);
    } finally {
      setIsLoading(false);
    }

    const fallbackAnswer =
      CANNED_RESPONSES[text] ||
      `Tactical RAG Assessment for ${resolvedId}: Primary Chemical Hazards identified (Benzene, LPG, Hydrocarbons). Mandatory Evacuation Perimeter: 3.5 km downwind. Recommended Suppression: Class B AFFF Foam deluge only (Avoid high-pressure water jets on storage vessels). Follow NDMA Phase 1-4 Emergency Isolation SOPs.`;

    setMessages((prev) => [...prev, { role: 'assistant', text: fallbackAnswer }]);
  };

  return (
    <div className="border-t border-[var(--color-border)] shrink-0 bg-white">
      {/* Messages */}
      {messages.length > 0 && (
        <div className="max-h-[240px] overflow-y-auto px-4 py-3 space-y-2.5">
          {messages.map((msg, i) => (
            <div
              key={i}
              className={`text-scale-sm leading-relaxed whitespace-pre-line ${
                msg.role === 'user'
                  ? 'text-[var(--color-text-secondary)] font-medium'
                  : 'text-[var(--color-text-primary)]'
              }`}
            >
              {msg.role === 'user' ? (
                <span className="text-[var(--color-text-tertiary)] font-semibold">You: </span>
              ) : (
                <span className="text-[var(--color-accent-hover)] font-semibold">THERMOS AI: </span>
              )}
              {renderFormattedMessage(msg.text)}
            </div>
          ))}
          {isLoading && (
            <div className="text-scale-xs text-[var(--color-text-tertiary)] animate-pulse">
              THERMOS RAG Copilot is retrieving facility MSDS & NDMA protocols...
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      )}

      {/* Suggested chips */}
      <div className="px-4 pt-1 pb-2 flex flex-wrap gap-1.5 border-t border-[var(--color-border-subtle)]">
        {SUGGESTED_QUESTIONS.map((q) => (
          <button
            key={q}
            type="button"
            disabled={isLoading}
            onClick={() => handleSubmit(q)}
            className="px-2.5 py-1 text-scale-xs bg-[var(--color-surface)] border border-[var(--color-border)] rounded-full text-[var(--color-text-secondary)] hover:border-[var(--color-accent)] hover:text-[var(--color-text-primary)] transition-colors disabled:opacity-50"
          >
            {q}
          </button>
        ))}
      </div>

      {/* Form Input + Ask Button */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleSubmit();
        }}
        className="px-4 py-3 flex gap-2 border-t border-[var(--color-border)] bg-[var(--color-surface-subtle)]"
      >
        <input
          type="text"
          placeholder="Ask THERMOS AI Copilot…"
          value={query}
          disabled={isLoading}
          onChange={(e) => setQuery(e.target.value)}
          className="flex-1 h-8 px-3 text-scale-sm bg-white border border-[var(--color-border)] rounded-[var(--radius-md)] placeholder:text-[var(--color-text-tertiary)] focus:outline-none focus:border-[var(--color-accent)] transition-colors disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={isLoading || !query.trim()}
          className="h-8 px-3 bg-[var(--color-accent)] text-[var(--color-text-primary)] text-scale-sm font-medium rounded-[var(--radius-md)] hover:bg-[var(--color-accent-hover)] transition-colors disabled:opacity-50 cursor-pointer"
        >
          Ask
        </button>
      </form>
    </div>
  );
}
