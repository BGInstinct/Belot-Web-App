import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Send } from 'lucide-react';
import { PixelButton } from '@/components/ui';
import { useOnline } from '../store';

/** `touch`: portrait phone chat sheet — ≥44px input / send button */
export default function ChatPanel({ className = '', compact = false, touch = false }: { className?: string; compact?: boolean; touch?: boolean }) {
  const { t } = useTranslation('online');
  const chat = useOnline((s) => s.chat);
  const sendChat = useOnline((s) => s.sendChat);
  const [text, setText] = useState('');
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [chat.length]);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    void sendChat(text);
    setText('');
  }

  return (
    <div className={`flex min-h-0 flex-col gap-2 ${className}`}>
      <div
        ref={listRef}
        className={`min-h-0 flex-1 overflow-y-auto border-4 border-black bg-slate-950/80 p-2 text-[10px] leading-relaxed ${compact ? 'max-h-48' : 'min-h-40'}`}
      >
        {chat.length === 0 && <p className="text-slate-500">{t('chat.empty')}</p>}
        {chat.map((m) => (
          <p key={m.id} className={touch ? 'wrap-anywhere' : 'break-words'}>
            <span className="text-slate-500">{new Date(m.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} </span>
            <span className="text-amber-300">{m.from}:</span> <span className="text-slate-100">{m.text}</span>
          </p>
        ))}
      </div>
      <form onSubmit={onSubmit} className="flex gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={200}
          placeholder={t('chat.placeholder')}
          aria-label={t('chat.placeholder')}
          className={`min-w-0 flex-1 border-4 border-black bg-slate-900 px-2 py-1 font-pixel text-[10px] text-slate-100 outline-none placeholder:text-slate-600 focus:border-amber-400 ${touch ? 'min-h-11' : ''}`}
        />
        <PixelButton type="submit" size={touch ? 'md' : 'sm'} variant="blue" aria-label={t('chat.send')} disabled={!text.trim()} className={touch ? 'min-h-11! min-w-11 shrink-0' : ''}>
          <Send size={14} />
        </PixelButton>
      </form>
    </div>
  );
}
