import { Film, Play, Video } from 'lucide-react';
import { WorkflowPage } from '../../components/layout/WorkflowPage';

/**
 * LTX 2.5 — text to video, image to video, first/last frame.
 *
 * Three pages in one file because they differ in two lines each: which graph
 * runs and what it needs dropped in. Split across three files they would drift,
 * which is what happened to the 2.3 pages and why their settings rows do not
 * quite match each other.
 *
 * Size comes from a ResolutionSelector, not width and height. It takes an
 * aspect ratio and a megapixel budget and computes the pair, rounded to a
 * multiple of 32 - so exposing sliders for width and height would be offering
 * control over a number the graph recomputes.
 *
 * No prompt-enhance toggle. The graph carries an LLM that rewrites the prompt
 * before encoding, left off, because this app already has a prompt assistant
 * and two of them would fight over the same sentence.
 */

const RATIOS = [
  '1:1 (Square)', '2:3 (Portrait Photo)', '3:2 (Photo)', '3:4 (Portrait Standard)',
  '4:3 (Standard)', '9:16 (Portrait Widescreen)', '16:9 (Widescreen)', '21:9 (Ultrawide)',
];

const SIZE = [
  {
    kind: 'chips' as const,
    key: 'aspect_ratio',
    label: 'Aspect Ratio',
    defaultValue: '9:16 (Portrait Widescreen)',
    options: RATIOS.map((r) => ({ label: r.split(' ')[0], value: r })),
  },
  {
    kind: 'slider' as const,
    key: 'megapixels',
    label: 'Megapixels',
    min: 0.5,
    max: 2.5,
    step: 0.1,
    defaultValue: 1.6,
    hint: 'The pixel budget. Aspect ratio decides the shape; this decides how big.',
  },
  { kind: 'slider' as const, key: 'duration', label: 'Duration (s)', min: 2, max: 15, defaultValue: 5 },
  { kind: 'slider' as const, key: 'frame_rate', label: 'Frame Rate', min: 16, max: 30, defaultValue: 24 },
  { kind: 'seed' as const, key: 'seed' },
];

const NEGATIVE = 'blurry, out of focus, overexposed, underexposed, distorted, low quality';

export const Ltx25Txt2VidPage = () => (
  <WorkflowPage
    workflowId="ltx25-txt2vid"
    family="LTX 2.5"
    capability="Text to Video"
    description="A clip with synced audio, from a prompt."
    icon={Play}
    output="video"
    inputs={[]}
    prompt={{
      context: 'ltx-txt2vid',
      label: 'Prompt',
      placeholder: 'Describe the shot — what is in frame, what moves, what the camera does…',
      negative: { placeholder: NEGATIVE },
      rows: 4,
    }}
    settings={SIZE}
    generateLabel="Generate Video"
    generatingLabel="Generating video…"
    readyMessage="Video ready"
  />
);

export const Ltx25Img2VidPage = () => (
  <WorkflowPage
    workflowId="ltx25-img2vid"
    family="LTX 2.5"
    capability="Image to Video"
    description="Animate a still, audio included."
    icon={Video}
    output="video"
    inputs={[{ key: 'image', kind: 'image', label: 'Source', hint: 'The still to animate' }]}
    prompt={{
      context: 'ltx-img2vid',
      label: 'Motion Prompt',
      placeholder: 'Describe what moves…',
      negative: { placeholder: NEGATIVE },
      rows: 4,
    }}
    settings={[
      ...SIZE,
      {
        kind: 'slider',
        key: 'strength',
        label: 'Motion Strength',
        min: 0.1,
        max: 1,
        step: 0.05,
        defaultValue: 0.7,
        hint: 'How far the clip may travel from the still. Low stays close to it.',
      },
    ]}
    generateLabel="Animate"
    generatingLabel="Animating…"
    readyMessage="Video ready"
  />
);

export const Ltx25FflfPage = () => (
  <WorkflowPage
    workflowId="ltx25-fflf"
    family="LTX 2.5"
    capability="First / Last Frame"
    description="Two frames in, the motion between them out."
    icon={Film}
    output="video"
    inputs={[
      { key: 'image', kind: 'image', label: 'First Frame', hint: 'Where the clip starts' },
      { key: 'image2', kind: 'image', label: 'Last Frame', hint: 'Where it ends' },
    ]}
    prompt={{
      context: 'ltx-img2vid',
      label: 'Motion Prompt',
      placeholder: 'Describe how it gets from the first frame to the last…',
      negative: { placeholder: NEGATIVE },
      rows: 4,
    }}
    settings={SIZE}
    generateLabel="Generate Video"
    generatingLabel="Generating video…"
    readyMessage="Video ready"
  />
);
