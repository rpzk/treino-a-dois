'use client';

import { useEffect, useState } from 'react';
import { ExternalLink, Pause, Play, Video } from 'lucide-react';
import { resolveExerciseMedia } from '@/lib/exercise-media';

type Props = {
  name: string;
  equipment?: string;
  instructions?: string;
  compact?: boolean;
};

export default function ExerciseDemo({
  name,
  equipment,
  instructions,
  compact = false,
}: Props) {
  const media = resolveExerciseMedia(name, equipment);
  const [frame, setFrame] = useState<0 | 1>(0);
  const [playing, setPlaying] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!media.visual || !playing || failed) return;
    if (
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    ) {
      return;
    }
    const id = window.setInterval(() => {
      setFrame((cur) => (cur === 0 ? 1 : 0));
    }, 1250);
    return () => window.clearInterval(id);
  }, [media.visual, playing, failed]);

  const lines = (instructions ?? '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  return (
    <div className={`exec-demo${compact ? ' exec-demo-compact' : ''}`}>
      {media.visual && !failed && (
        <div className="exec-demo-stage">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={media.visual.frames[frame]}
            alt={`Demonstração de ${name} — ${frame === 0 ? 'posição inicial' : 'execução'}`}
            loading="lazy"
            onError={() => setFailed(true)}
          />
          <div className="exec-demo-controls">
            <span className="exec-demo-phase">
              {frame === 0 ? '1 · Posição inicial' : '2 · Execução'}
            </span>
            <div className="exec-demo-btns">
              <button
                type="button"
                className="exec-demo-btn"
                aria-label={playing ? 'Pausar demonstração' : 'Reproduzir demonstração'}
                onClick={() => setPlaying((p) => !p)}
              >
                {playing ? <Pause size={13} /> : <Play size={13} />}
              </button>
              <button
                type="button"
                className="exec-demo-btn"
                onClick={() => {
                  setPlaying(false);
                  setFrame((f) => (f === 0 ? 1 : 0));
                }}
              >
                {frame === 0 ? 'Ver passo 2' : 'Ver passo 1'}
              </button>
            </div>
          </div>
        </div>
      )}

      {lines.length > 0 && (
        <div className="exec-guide-body">
          {lines.map((line, idx) => (
            <p key={idx}>{line}</p>
          ))}
        </div>
      )}

      <div className="exec-video-links">
        {media.machineVideoSearchUrl && media.machineLabel && (
          <a
            href={media.machineVideoSearchUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="exec-video-link primary-link"
          >
            <Video size={14} />
            <span>Vídeo curto · {media.machineLabel}</span>
            <ExternalLink size={12} />
          </a>
        )}
        <a
          href={media.videoSearchUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="exec-video-link"
        >
          <Video size={14} />
          <span>Ver vídeo curto de execução</span>
          <ExternalLink size={12} />
        </a>
      </div>
    </div>
  );
}
