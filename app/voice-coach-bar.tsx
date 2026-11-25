'use client';

import { useEffect, useRef, useState } from 'react';
import { Mic, MicOff, Volume2, VolumeX } from 'lucide-react';
import { parseVoiceCommand, type VoiceCommand } from '@/lib/voice-commands';

type SpeechRecognitionEventLike = {
  results: ArrayLike<{
    isFinal?: boolean;
    0?: { transcript?: string };
  }>;
};

type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

type SpeechCtor = new () => SpeechRecognitionLike;

function getSpeechRecognitionCtor(): SpeechCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechCtor;
    webkitSpeechRecognition?: SpeechCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function speakPtBr(text: string): void {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  const clean = text.trim();
  if (!clean) return;
  try {
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(clean);
    utter.lang = 'pt-BR';
    utter.rate = 1.03;
    const voices = window.speechSynthesis.getVoices();
    const ptVoice =
      voices.find((v) => v.lang.toLowerCase() === 'pt-br') ??
      voices.find((v) => v.lang.toLowerCase().startsWith('pt'));
    if (ptVoice) utter.voice = ptVoice;
    window.speechSynthesis.speak(utter);
  } catch {
    /* speech synthesis is optional */
  }
}

type Props = {
  currentLabel: string | null;
  ttsEnabled: boolean;
  onToggleTts: (enabled: boolean) => void;
  onCommand: (command: VoiceCommand, transcript: string) => string;
  disabled?: boolean;
};

export default function VoiceCoachBar({
  currentLabel,
  ttsEnabled,
  onToggleTts,
  onCommand,
  disabled = false,
}: Props) {
  const [supported] = useState(() => !!getSpeechRecognitionCtor());
  const [listening, setListening] = useState(false);
  const [lastFeedback, setLastFeedback] = useState('');
  const recRef = useRef<SpeechRecognitionLike | null>(null);
  const onCommandRef = useRef(onCommand);

  useEffect(() => {
    onCommandRef.current = onCommand;
  }, [onCommand]);

  useEffect(() => {
    return () => {
      try {
        recRef.current?.stop();
      } catch {
        /* noop */
      }
      recRef.current = null;
    };
  }, []);

  function stopListening() {
    try {
      recRef.current?.stop();
    } catch {
      /* noop */
    }
    recRef.current = null;
    setListening(false);
  }

  function toggleListening() {
    if (disabled) return;
    if (listening) {
      stopListening();
      return;
    }
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) {
      setLastFeedback('Seu navegador não suporta comando de voz.');
      return;
    }
    try {
      const rec = new Ctor();
      rec.lang = 'pt-BR';
      rec.continuous = false;
      rec.interimResults = false;
      rec.maxAlternatives = 1;
      rec.onresult = (event) => {
        const lastIdx = event.results.length - 1;
        const transcript = (event.results[lastIdx]?.[0]?.transcript ?? '').trim();
        if (!transcript) return;
        const command = parseVoiceCommand(transcript);
        const reply = onCommandRef.current(command, transcript);
        setLastFeedback(`"${transcript}" → ${reply}`);
      };
      rec.onerror = (event) => {
        if (event.error === 'not-allowed') {
          setLastFeedback('Permita o microfone no navegador para usar voz.');
        } else if (event.error && event.error !== 'no-speech' && event.error !== 'aborted') {
          setLastFeedback('Não entendi o áudio. Tente falar mais perto.');
        }
        setListening(false);
        recRef.current = null;
      };
      rec.onend = () => {
        setListening(false);
        recRef.current = null;
      };
      recRef.current = rec;
      setListening(true);
      setLastFeedback('Ouvindo… fale por ex. "feita", "40 quilos 12 reps" ou "pular descanso".');
      rec.start();
    } catch {
      setListening(false);
      setLastFeedback('Não foi possível abrir o microfone agora.');
    }
  }

  return (
    <div className="voice-bar" role="region" aria-label="Controle por voz do treino">
      <div className="voice-bar-main">
        <div className="voice-bar-copy">
          <strong>{currentLabel ?? 'Todas as séries concluídas'}</strong>
          <small>
            {lastFeedback ||
              'Sem digitar: toque para falar "feita", "45 kg 12 reps", "pular descanso" ou "como faz".'}
          </small>
        </div>
        <div className="voice-bar-actions">
          {supported && (
            <button
              type="button"
              className={listening ? 'primary voice-mic-btn listening' : 'secondary voice-mic-btn'}
              disabled={disabled}
              onClick={toggleListening}
            >
              {listening ? <MicOff size={17} /> : <Mic size={17} />}
              <span>{listening ? 'Ouvindo…' : 'Falar'}</span>
            </button>
          )}
          <button
            type="button"
            className={`secondary voice-tts-btn${ttsEnabled ? ' active' : ''}`}
            aria-pressed={ttsEnabled}
            onClick={() => onToggleTts(!ttsEnabled)}
            title="Avisar por voz no fone quando o descanso terminar"
          >
            {ttsEnabled ? <Volume2 size={17} /> : <VolumeX size={17} />}
            <span>{ttsEnabled ? 'Voz ativa' : 'Voz off'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
