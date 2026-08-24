import { useRef, useState } from 'react';
import { Users, X, Plus } from 'lucide-react';
import { WorkflowPage } from '../../components/layout/WorkflowPage';
import { InfoTip } from '../../components/ui/InfoTip';
import { useToast } from '../../components/ui/Toast';
import { BACKEND_API } from '../../config/api';
import { usePersistentState } from '../../hooks/usePersistentState';

/**
 * MiniMax H3 with up to eight reference pictures of the same subject.
 *
 * Only the first slot is a WorkflowPage input. The other seven live in their own
 * grid below, because WorkflowPage lays inputs out as equal columns - nine of
 * them across one row leaves each thumbnail too narrow to recognise a face in,
 * which is the entire point of the mode.
 *
 * Empty slots are safe to leave empty: workflow_service._drop_unfilled_optional_images
 * unwires any ref_images.ref_image_N whose LoadImage was not filled, so the
 * graph author's baked-in picture never sneaks into someone else's render.
 */

const EXTRA_SLOTS = 7;   // slots 2-8; slot 1 is a WorkflowPage input
const MAX_REF_IMAGES = 9;  // the node's own cap, from minimax_core.py

export const MiniMaxRef8Page = () => {
  const { toast } = useToast();
  const [extras, setExtras] = usePersistentState<string[]>(
    'mmx_ref8_extras', Array(EXTRA_SLOTS).fill(''));
  const [busy, setBusy] = useState<number | null>(null);

  const fileInput = useRef<HTMLInputElement | null>(null);
  const target = useRef<number | null>(null);

  const setAt = (i: number, v: string) =>
    setExtras((xs) => xs.map((x, j) => (j === i ? v : x)));

  const upload = async (i: number, file: File) => {
    setBusy(i);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch(`${BACKEND_API.BASE_URL}/api/upload`, { method: 'POST', body: form });
      const data = await res.json();
      if (!data.success) throw new Error(data.detail || 'Upload failed');
      setAt(i, data.filename);
    } catch (err: any) {
      toast(err.message || 'Upload failed', 'error');
    } finally {
      setBusy(null);
    }
  };

  const pick = (i: number) => {
    if (!fileInput.current) return;
    target.current = i;
    fileInput.current.value = '';
    fileInput.current.click();
  };

  const filled = extras.filter(Boolean).length;

  return (
    <>
      <input
        ref={fileInput} type="file" accept="image/*" className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          const i = target.current;
          target.current = null;
          if (f && i !== null) void upload(i, f);
        }}
      />
      <WorkflowPage
        workflowId="minimax-h3-ref8"
        storageKey="minimax-h3-ref8"
        family="MiniMax H3"
        capability="8 References"
        description="Show it the same subject from several angles and it keeps the face for the whole clip."
        icon={Users}
        output="video"
        inputs={[
          { key: 'image', kind: 'image', label: 'Reference 1',
            hint: 'The main picture of the subject' },
        ]}
        prompt={{
          context: 'minimax-h3',
          label: 'Prompt',
          placeholder: 'What the subject does, where they are, what it sounds like…',
          rows: 4,
        }}
        settings={[
          { kind: 'slider', key: 'width', label: 'Width', min: 256, max: 1536, step: 32, defaultValue: 736 },
          { kind: 'slider', key: 'height', label: 'Height', min: 256, max: 1536, step: 32, defaultValue: 1280 },
          {
            kind: 'slider', key: 'length', label: 'Frames', min: 25, max: 200, step: 1, defaultValue: 124,
            hint: 'Frames times width times height is what fills the card. Fewer frames is usually '
                + 'the cheapest way back under the line.',
          },
          { kind: 'slider', key: 'frame_rate', label: 'FPS', min: 8, max: 30, defaultValue: 24 },
          { kind: 'slider', key: 'steps', label: 'Steps', min: 4, max: 50, defaultValue: 20 },
          {
            kind: 'chips', key: 'ref_image_size', label: 'Reference detail', defaultValue: 'match',
            hint: '"Match" scales your pictures to the output size and is fast. "Max" keeps a 2048px '
                + 'short edge, which holds a likeness better and costs real time — with eight '
                + 'pictures that adds up.',
            options: [
              { label: 'Match output — fast', value: 'match' },
              { label: 'Max — holds the likeness', value: 'max' },
            ],
          },
          {
            kind: 'chips', key: 'encoder_device', label: 'Text encoder', defaultValue: 'cpu',
            hint: 'The encoder is 15 GB. On CPU it takes a few minutes to read the prompt before '
                + 'anything appears to happen — that silence is normal — but it leaves the GPU free.',
            options: [
              { label: 'CPU — slow, frees 15 GB', value: 'cpu' },
              { label: 'GPU — fast, needs headroom', value: 'default' },
            ],
          },
          { kind: 'seed', key: 'seed' },
        ]}
        extraParams={() =>
          Object.fromEntries(
            extras.map((f, i) => [`image${i + 2}`, f]).filter(([, f]) => f),
          )}
        extraSections={(
          <div className="workflow-section">
            <div className="workflow-section-header">
              <div className="workflow-section-title flex items-center gap-1.5">
                More references
                <InfoTip text={
                  'All of the same subject, from different angles or in different light. '
                  + 'They are not a storyboard — every picture is another look at one person or '
                  + 'thing, and the model averages them into a likeness it can hold. '
                  + 'Leave any of them empty.'
                } />
              </div>
              <div className="text-[11px] text-white/45">
                {filled + 1} of {MAX_REF_IMAGES} used
              </div>
            </div>

            <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-7">
              {extras.map((file, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => pick(i)}
                  className={`relative flex aspect-square items-center justify-center rounded-md border
                    text-[10px] transition ${
                    file
                      ? 'border-white/25 bg-white/[0.07] text-white/70'
                      : 'border-dashed border-white/15 text-white/35 hover:border-white/30 hover:text-white/70'}`}
                  title={file || `Reference ${i + 2}`}
                >
                  {busy === i ? (
                    <span className="animate-pulse">…</span>
                  ) : file ? (
                    <>
                      <span className="px-1 text-center leading-tight break-all">{i + 2}</span>
                      <span
                        role="button"
                        tabIndex={0}
                        onClick={(e) => { e.stopPropagation(); setAt(i, ''); }}
                        onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); setAt(i, ''); } }}
                        className="absolute right-0.5 top-0.5 text-white/40 hover:text-white"
                      >
                        <X className="h-3 w-3" />
                      </span>
                    </>
                  ) : (
                    <Plus className="h-3.5 w-3.5" />
                  )}
                </button>
              ))}
            </div>
          </div>
        )}
        generateLabel="Generate Video"
        generatingLabel="Generating video…"
        readyMessage="Video ready"
      />
    </>
  );
};
