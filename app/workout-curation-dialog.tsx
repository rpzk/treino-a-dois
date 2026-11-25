'use client';

import { useState } from 'react';
import {
  Check,
  ChevronDown,
  Dumbbell,
  RefreshCw,
  SlidersHorizontal,
  Sparkles,
  Wrench,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import ExerciseDemo from './exercise-demo';
import type { EquipmentItem } from '@/lib/equipment-inventory';
import type { SuggestedItem, SuggestedWorkout } from '@/lib/workout-suggest';
import { estimateSeconds } from '@/lib/training-stats';
import type { Item, Workout } from '@/lib/training';

const FOCUS_PRESETS = [
  { label: 'Corpo inteiro (Full Body)', value: 'Corpo inteiro equilibrado (Full Body)' },
  { label: 'Superiores', value: 'Superiores: peito, costas, ombros e braços' },
  { label: 'Inferiores', value: 'Inferiores: quadríceps, posteriores, glúteos e panturrilha' },
  { label: 'Treino A · Empurrar', value: 'Treino A: peito, ombros e tríceps' },
  { label: 'Treino B · Puxar', value: 'Treino B: costas, bíceps e core' },
  { label: 'Core & Condicionamento', value: 'Core, mobilidade e condicionamento geral' },
];

const LEVELS = ['Iniciante', 'Intermediário', 'Avançado'] as const;
const DURATIONS = [30, 45, 60] as const;

type CuratedItem = SuggestedItem & {
  cid: string;
  selected: boolean;
  swapping?: boolean;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  inventory: EquipmentItem[];
  healthConsent: boolean | null;
  initialFocus?: string;
  busy: boolean;
  onSaveWorkout: (workout: Workout) => Promise<boolean>;
  onOpenInEditor: (workout: Workout) => void;
  readApiJson: <T = Record<string, unknown>>(
    r: Response,
  ) => Promise<T & { error?: string }>;
  friendlyHttpError: (status: number) => string;
  userFacingError: (e: unknown, fallback: string) => string;
};

export default function WorkoutCurationDialog(props: Props) {
  return (
    <Dialog
      open={props.open}
      onOpenChange={(next) => {
        if (!props.busy) props.onOpenChange(next);
      }}
    >
      {props.open && <WorkoutCurationContent {...props} />}
    </Dialog>
  );
}

function WorkoutCurationContent({
  onOpenChange,
  inventory,
  healthConsent,
  initialFocus = '',
  busy,
  onSaveWorkout,
  onOpenInEditor,
  readApiJson,
  friendlyHttpError,
  userFacingError,
}: Props) {
  const [step, setStep] = useState<'setup' | 'curate'>('setup');
  const [focus, setFocus] = useState(initialFocus);
  const [level, setLevel] = useState<(typeof LEVELS)[number]>('Intermediário');
  const [durationMinutes, setDurationMinutes] =
    useState<(typeof DURATIONS)[number]>(45);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [workoutName, setWorkoutName] = useState('');
  const [summary, setSummary] = useState('');
  const [items, setItems] = useState<CuratedItem[]>([]);
  const [rejectedNames, setRejectedNames] = useState<string[]>([]);
  const [expandedGuide, setExpandedGuide] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);

  const selectedItems = items.filter((item) => item.selected);
  const estimatedMin = Math.ceil(estimateSeconds(selectedItems) / 60);

  async function generatePlan(extraExcluded: string[] = []) {
    if (loading) return;
    setLoading(true);
    setError('');
    try {
      const exclude = [...new Set([...rejectedNames, ...extraExcluded])];
      const r = await fetch('/api/training/suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          focus,
          level,
          durationMinutes,
          exclude,
          equipment_inventory: inventory,
        }),
      });
      const j = await readApiJson<SuggestedWorkout>(r);
      if (!r.ok) throw new Error(j.error || friendlyHttpError(r.status));
      if (!j.name || !j.items?.length) {
        throw new Error('A sugestão veio incompleta. Tente de novo.');
      }
      const curated: CuratedItem[] = j.items.map((item) => ({
        ...item,
        cid: crypto.randomUUID(),
        selected: true,
      }));
      setWorkoutName(j.name);
      setSummary(j.summary ?? '');
      setItems(curated);
      // Open the first exercise guide by default so instructions are immediately discoverable.
      setExpandedGuide(curated[0] ? { [curated[0].cid]: true } : {});
      setStep('curate');
    } catch (e) {
      const msg = userFacingError(e, 'Não foi possível gerar o treino agora.');
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }

  function toggleItem(cid: string, checked: boolean) {
    setItems((cur) =>
      cur.map((it) => {
        if (it.cid !== cid) return it;
        if (!checked) {
          setRejectedNames((prev) =>
            prev.includes(it.name) ? prev : [...prev, it.name],
          );
        }
        return { ...it, selected: checked };
      }),
    );
  }

  async function swapItem(target: CuratedItem) {
    if (target.swapping || loading) return;
    setItems((cur) =>
      cur.map((it) => (it.cid === target.cid ? { ...it, swapping: true } : it)),
    );
    const nextRejected = rejectedNames.includes(target.name)
      ? rejectedNames
      : [...rejectedNames, target.name];
    setRejectedNames(nextRejected);

    try {
      const r = await fetch('/api/training/suggest/swap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          exerciseName: target.name,
          group: target.group,
          currentExercises: items.map((x) => x.name),
          excludedExercises: nextRejected,
          equipment_inventory: inventory,
        }),
      });
      const j = await readApiJson<{ item?: SuggestedItem }>(r);
      if (!r.ok) throw new Error(j.error || friendlyHttpError(r.status));
      if (!j.item) throw new Error('Alternativa inválida.');
      const replacement: CuratedItem = {
        ...j.item,
        cid: target.cid,
        selected: true,
        swapping: false,
      };
      setItems((cur) =>
        cur.map((it) => (it.cid === target.cid ? replacement : it)),
      );
      setExpandedGuide((prev) => ({ ...prev, [target.cid]: true }));
      toast.success(`Trocado por ${replacement.name}`);
    } catch (e) {
      setItems((cur) =>
        cur.map((it) =>
          it.cid === target.cid ? { ...it, swapping: false } : it,
        ),
      );
      toast.error(
        userFacingError(e, 'Não foi possível buscar outra opção agora.'),
      );
    }
  }

  function buildWorkoutPayload(): Workout | null {
    const chosen = selectedItems;
    if (!chosen.length) {
      toast.error('Marque pelo menos 1 exercício para montar a ficha.');
      return null;
    }
    const cleanName = workoutName.trim().slice(0, 80) || 'Treino personalizado';
    const mappedItems: Item[] = chosen.map((it) => {
      const base: Item = {
        id: crypto.randomUUID(),
        name: it.name,
        group: it.group,
        sets: it.sets,
        reps: it.reps,
        rest: it.rest,
      };
      if (it.variation) base.variation = it.variation;
      if (it.equipment) base.equipment = it.equipment;
      if (it.instructions) base.instructions = it.instructions;
      return base;
    });
    return {
      id: crypto.randomUUID(),
      name: cleanName,
      createdAt: new Date().toISOString(),
      items: mappedItems,
    };
  }

  async function handleSaveDirect() {
    const workout = buildWorkoutPayload();
    if (!workout || saving || busy) return;
    setSaving(true);
    try {
      const ok = await onSaveWorkout(workout);
      if (ok) onOpenChange(false);
    } finally {
      setSaving(false);
    }
  }

  function handleOpenEditor() {
    const workout = buildWorkoutPayload();
    if (!workout) return;
    onOpenChange(false);
    onOpenInEditor(workout);
  }

  const machineSummary = inventory.length
    ? inventory
        .slice(0, 4)
        .map((it) => it.brand_model || it.label)
        .join(', ') +
      (inventory.length > 4 ? ` +${inventory.length - 4}` : '')
    : 'Nenhum equipamento cadastrado ainda (a IA usará opções gerais).';

  return (
    <DialogContent
      className="editor-dialog curate-dialog"
      showCloseButton={!loading && !saving}
    >
        <DialogHeader>
          <DialogTitle>
            {step === 'setup'
              ? healthConsent === true
                ? 'Montar treino com modo saúde'
                : 'Montar treino com IA'
              : 'Escolha seus exercícios'}
          </DialogTitle>
          <DialogDescription>
            {step === 'setup'
              ? 'Defina o foco do treino. A IA vai propor exercícios para os seus equipamentos com instruções de execução para você escolher o que manter.'
              : 'Marque os exercícios que deseja manter, troque os que não gostar e confira como executar em cada aparelho.'}
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div className="equip-alert" role="alert">
            {error}
          </div>
        )}

        {step === 'setup' && (
          <div className="curate-setup">
            <div className="curate-equip-banner">
              <Wrench size={16} />
              <div>
                <strong>Equipamentos considerados</strong>
                <p>{machineSummary}</p>
              </div>
            </div>

            <div className="curate-section">
              <span className="eyebrow">FOCO DO TREINO</span>
              <div className="curate-presets">
                {FOCUS_PRESETS.map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    className={`curate-pill${focus === preset.value ? ' active' : ''}`}
                    onClick={() => setFocus(preset.value)}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
              <label className="field">
                Ou descreva sua preferência (opcional)
                <input
                  value={focus}
                  maxLength={120}
                  onChange={(e) => setFocus(e.target.value)}
                  placeholder="Ex.: foco em postura e pernas, sem impacto nos joelhos…"
                />
              </label>
            </div>

            <div className="curate-row">
              <div className="curate-section">
                <span className="eyebrow">NÍVEL</span>
                <div className="curate-presets">
                  {LEVELS.map((lv) => (
                    <button
                      key={lv}
                      type="button"
                      className={`curate-pill${level === lv ? ' active' : ''}`}
                      onClick={() => setLevel(lv)}
                    >
                      {lv}
                    </button>
                  ))}
                </div>
              </div>

              <div className="curate-section">
                <span className="eyebrow">DURAÇÃO</span>
                <div className="curate-presets">
                  {DURATIONS.map((mins) => (
                    <button
                      key={mins}
                      type="button"
                      className={`curate-pill${durationMinutes === mins ? ' active' : ''}`}
                      onClick={() => setDurationMinutes(mins)}
                    >
                      {mins} min
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="equip-actions">
              <button
                type="button"
                className="secondary"
                disabled={loading}
                onClick={() => onOpenChange(false)}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="primary"
                disabled={loading}
                onClick={() => void generatePlan()}
              >
                <Sparkles size={18} />
                {loading ? 'Montando opções…' : 'Gerar opções de treino'}
              </button>
            </div>
          </div>
        )}

        {step === 'curate' && (
          <div className="curate-review">
            <label className="field">
              Nome da ficha
              <input
                value={workoutName}
                maxLength={80}
                onChange={(e) => setWorkoutName(e.target.value)}
                placeholder="Ex.: Treino A · Corpo inteiro"
              />
            </label>

            {summary && <p className="curate-summary">{summary}</p>}

            <div className="curate-meta-bar">
              <span>
                <strong>{selectedItems.length}</strong> de {items.length}{' '}
                exercícios selecionados · ~{estimatedMin} min
              </span>
              <button
                type="button"
                className="equip-clear"
                disabled={loading}
                onClick={() => setStep('setup')}
              >
                Ajustar foco
              </button>
            </div>

            <div className="curate-list">
              {items.map((item) => {
                const guideOpen = !!expandedGuide[item.cid];
                return (
                  <article
                    key={item.cid}
                    className={`curate-card${item.selected ? '' : ' excluded'}`}
                  >
                    <div className="curate-card-top">
                      <label className="curate-check-wrap">
                        <Checkbox
                          checked={item.selected}
                          disabled={!!item.swapping || loading}
                          aria-label={`${item.selected ? 'Remover' : 'Incluir'} ${item.name}`}
                          onCheckedChange={(v) => toggleItem(item.cid, !!v)}
                        />
                        <div>
                          <span className="eyebrow">{item.group}</span>
                          <h3>{item.name}</h3>
                        </div>
                      </label>
                      <button
                        type="button"
                        className="secondary curate-swap-btn"
                        disabled={!!item.swapping || loading}
                        onClick={() => void swapItem(item)}
                        title="Pedir outro exercício para o mesmo grupo muscular"
                      >
                        <RefreshCw
                          size={15}
                          className={item.swapping ? 'animate-spin' : ''}
                        />
                        {item.swapping ? 'Trocando…' : 'Trocar'}
                      </button>
                    </div>

                    <div className="curate-badges">
                      <span className="curate-spec">
                        {item.sets} × {item.reps} · descanso {item.rest}s
                      </span>
                      {item.equipment && (
                        <span className="curate-equip-tag">
                          <Dumbbell size={13} />
                          {item.equipment}
                        </span>
                      )}
                      {!item.selected && (
                        <span className="curate-excluded-tag">Fora do treino</span>
                      )}
                    </div>

                    <div className="exec-guide">
                      <button
                        type="button"
                        className="exec-guide-toggle"
                        aria-expanded={guideOpen}
                        onClick={() =>
                          setExpandedGuide((prev) => ({
                            ...prev,
                            [item.cid]: !guideOpen,
                          }))
                        }
                      >
                        <span>Como executar · demonstração e vídeo</span>
                        <ChevronDown
                          size={16}
                          className={guideOpen ? 'rotated' : ''}
                        />
                      </button>
                      {guideOpen && (
                        <ExerciseDemo
                          name={item.name}
                          equipment={item.equipment}
                          instructions={item.instructions}
                          compact
                        />
                      )}
                    </div>
                  </article>
                );
              })}
            </div>

            <div className="equip-actions curate-footer">
              <button
                type="button"
                className="secondary"
                disabled={loading || saving}
                onClick={() =>
                  void generatePlan(
                    items.filter((x) => !x.selected).map((x) => x.name),
                  )
                }
              >
                <RefreshCw size={16} />
                {loading ? 'Gerando…' : 'Nova proposta'}
              </button>
              <button
                type="button"
                className="secondary"
                disabled={loading || saving || !selectedItems.length}
                onClick={handleOpenEditor}
              >
                <SlidersHorizontal size={16} />
                Ajustar no editor
              </button>
              <button
                type="button"
                className="primary"
                disabled={loading || saving || busy || !selectedItems.length}
                onClick={() => void handleSaveDirect()}
              >
                {saving || busy ? (
                  'Salvando…'
                ) : (
                  <>
                    <Check size={17} />
                    Salvar ficha ({selectedItems.length})
                  </>
                )}
              </button>
            </div>
          </div>
        )}
    </DialogContent>
  );
}
