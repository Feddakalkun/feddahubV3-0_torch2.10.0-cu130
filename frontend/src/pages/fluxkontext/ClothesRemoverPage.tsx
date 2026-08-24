import { Shirt } from 'lucide-react';
import { usePersistentState } from '../../hooks/usePersistentState';
import { WorkflowPage } from '../../components/layout/WorkflowPage';

/**
 * FLUX.1-Kontext clothes remover.
 *
 * The precision chip picks a whole different graph rather than a setting - the
 * fp8 checkpoint and the Q8_0 GGUF are separate workflows, the same as LTX and
 * WAN - so storageKey is pinned to keep the prompt and settings across a
 * switch. The exported graph carried both loaders with only one wired, which
 * looked like a switch and was not: nothing read the GGUF node, so it never ran.
 *
 * LoRAs stack after the remover, which is what makes slider LoRAs useful here.
 * They have to be FLUX.1-dev family: the collections trained on FLUX.2-klein-9B
 * are a different architecture with a different text encoder, and load with the
 * same dimension errors the Klein page warns about in the other direction.
 */
export const ClothesRemoverPage = () => {
  const [precision, setPrecision] = usePersistentState<'gguf' | 'fp8'>(
    'clothes_remover_precision', 'fp8');

  return (
    <WorkflowPage
      workflowId={precision === 'gguf'
        ? 'flux-kontext-clothes-remover-gguf'
        : 'flux-kontext-clothes-remover'}
      storageKey="flux-kontext-clothes-remover"
      family="FLUX.1 KONTEXT"
      capability="Clothes Remover"
      description="Take the clothes off a photo."
      icon={Shirt}
      output="image"
      inputs={[{ key: 'image', kind: 'image', label: 'Source', hint: 'The photo to edit' }]}
      prompt={{
        context: 'flux-kontext',
        label: 'Prompt',
        placeholder: 'remove clothes, make the woman naked.',
        rows: 3,
      }}
      // Only FLUX.1-dev LoRAs - see the note above on why klein sliders do not
      // belong here - and the source image is what the builder reads.
      promptBuilder={{ loraPrefix: 'FLUX', imageKey: 'image' }}
      // Three slots because sliders are meant to be combined - chest and waist
      // and buttocks at once - and workflow_service stacks up to five.
      //
      // `match` orders rather than filters, by design: a library filed by
      // character instead of by base model would otherwise lose every entry.
      // "flux/" ranks this workflow's own folder first and leaves flux2klein/
      // further down, which matters because those are a different architecture
      // and load with dimension errors here.
      loraArrayKey="loras"
      loras={[
        { key: 'slider1', label: 'LoRA', match: ['flux/'] },
        { key: 'slider2', label: 'LoRA 2', match: ['flux/'] },
        { key: 'slider3', label: 'LoRA 3', match: ['flux/'] },
      ]}
      settings={[
        { kind: 'slider', key: 'steps', label: 'Steps', min: 4, max: 40, defaultValue: 20 },
        { kind: 'slider', key: 'guidance', label: 'Guidance', min: 1, max: 6, step: 0.1, defaultValue: 2.5 },
        {
          kind: 'slider',
          key: 'remover_strength',
          label: 'Remover Strength',
          min: 0,
          max: 1.5,
          step: 0.05,
          defaultValue: 1,
        },
        { kind: 'slider', key: 'width', label: 'Width', min: 512, max: 2048, step: 64, defaultValue: 1024 },
        { kind: 'slider', key: 'height', label: 'Height', min: 512, max: 2048, step: 64, defaultValue: 1024 },
        { kind: 'seed', key: 'seed' },
        { kind: 'slider', key: 'cfg', label: 'CFG', min: 1, max: 8, step: 0.5, defaultValue: 1, advanced: true },
        { kind: 'slider', key: 'denoise', label: 'Denoise', min: 0.1, max: 1, step: 0.05, defaultValue: 1, advanced: true },
      ]}
      // Owned by the page, not a setting: it chooses which graph runs, so it has
      // to take effect on click rather than at generate time.
      extraSections={(
        <div className="workflow-section">
          <div className="workflow-section-header">
            <div className="workflow-section-title">Model precision</div>
          </div>
          <div className="flex gap-1.5">
            {([['fp8', 'FP8 - sharper'], ['gguf', 'GGUF - lighter']] as const).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setPrecision(value)}
                className={`rounded-md border px-3 py-1.5 text-[11px] font-semibold transition ${
                  precision === value
                    ? 'border-white/30 bg-white/10 text-white'
                    : 'border-white/10 text-white/45 hover:text-white/80'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      )}
      generateLabel="Generate"
      generatingLabel="Working…"
      readyMessage="Image ready"
    />
  );
};
