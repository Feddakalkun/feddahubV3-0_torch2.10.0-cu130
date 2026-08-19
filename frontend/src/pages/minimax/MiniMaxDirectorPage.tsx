import { useMemo, useRef, useState } from 'react';
import {
  Clapperboard, Plus, Trash2, Copy,
  Image as ImageIcon, Film, Music, X, Flag,
} from 'lucide-react';
import { WorkflowPage } from '../../components/layout/WorkflowPage';
import { InfoTip } from '../../components/ui/InfoTip';
import { useToast } from '../../components/ui/Toast';
import { BACKEND_API } from '../../config/api';
import { usePersistentState } from '../../hooks/usePersistentState';
import { DirectorTimeline } from '../../components/workflows/DirectorTimeline';

/**
 * MiniMax H3 Director - a storyboard, not a prompt box.
 *
 * The node takes one JSON string, `timeline_data`, holding the whole editor
 * state, plus `local_prompts` and `segment_lengths` as flattened views of the
 * same shots. All three are built here from one source of truth, because
 * letting them drift is how a render silently uses last week's shot list.
 *
 * The prompt box above is the global prompt: style, scene, who is in it. It is
 * written into timeline_data rather than sent as a param - the node declares
 * `global_prompt` as force_input and reads the value out of the timeline
 * instead, so a param would go nowhere.
 */

// --- what the node accepts, from minimax_core.py ---------------------------
const MAX_REF_VIDEOS = 3;
const MAX_REF_AUDIOS = 3;
const MAX_REF_FILES = 12;
const REF_VIDEO_TOTAL_SEC = 15;
const TRAINED_MIN_FRAMES = 96;
const TRAINED_MAX_FRAMES = 360;

/**
 * H3 generates on a 17k+5 frame grid and rounds *up* to reach it. A timeline of
 * 120 frames renders 124, which is a fifth of a second nobody asked for at the
 * end of the last shot - worth showing rather than discovering in the file.
 */
const snapUp = (n: number) => (n <= 5 ? 5 : Math.ceil((n - 5) / 17) * 17 + 5);

type Segment = {
  id: string;
  prompt: string;
  length: number;
  type: 'text' | 'image';
  imageFile?: string;
  fileName?: string;
  isEndFrame?: boolean;
};

type Clip = { id: string; file: string; start: number; length: number };

type Subject = {
  shortName: string;
  description: string;
  kind: 'person' | 'animal' | 'object' | 'place';
  retention: 'fully_preserved' | 'loosely_referenced';
  images: string[];
};

const SUBJECT_KINDS = ['person', 'animal', 'object', 'place'] as const;

const newId = () => `seg${Math.random().toString(36).slice(2, 9)}`;

const emptySubject = (): Subject => ({
  shortName: '', description: '', kind: 'person',
  retention: 'fully_preserved', images: [],
});

/**
 * Two shots of 62 frames is 124 - over the 96 H3 was trained on, and exactly on
 * the 17k+5 grid so nothing is rounded up. The page used to open on 82, which
 * tripped its own "below what H3 was trained on" notice before anyone touched
 * anything.
 */
const DEFAULT_SEGMENTS: Segment[] = [
  { id: 'seg0', type: 'text', length: 41,
    prompt: 'wide establishing shot: the rider crests the dune, engine roaring, '
          + 'sand spraying off the rear wheel into the low sun' },
  { id: 'seg1', type: 'text', length: 41,
    prompt: 'cut to a low tracking shot alongside the bike, heat haze rippling, '
          + 'the horizon tilting as she leans into the turn' },
  { id: 'seg2', type: 'text', length: 41,
    prompt: 'cut to a close-up on her visor, the dunes reflected in it, '
          + 'she exhales and the engine note drops away' },
];

const EXAMPLE_PROMPT =
  'Cinematic desert chase, late afternoon golden hour, anamorphic lens, '
  + 'shallow depth of field, fine film grain.';
const EXAMPLE_SOUNDSCAPE = 'wind over open sand, a distant engine';

/** The shapes H3 is actually run at, as one question instead of two sliders. */
const SHAPES = {
  landscape: { width: 1344, height: 768 },
  portrait: { width: 768, height: 1344 },
  square: { width: 1024, height: 1024 },
} as const;

const fmt = (frames: number, fps: number) => `${(frames / fps).toFixed(2)}s`;

export const MiniMaxDirectorPage = () => {
  const { toast } = useToast();

  const [segments, setSegments] = usePersistentState<Segment[]>(
    'mmx_director_segments_v2', DEFAULT_SEGMENTS);
  const [selected, setSelected] = useState(0);
  const [motion, setMotion] = usePersistentState<Clip[]>('mmx_director_motion', []);
  const [audio, setAudio] = usePersistentState<Clip[]>('mmx_director_audio', []);
  const [subjects, setSubjects] = usePersistentState<Subject[]>(
    'mmx_director_subjects', [emptySubject()]);
  const [fps, setFps] = usePersistentState('mmx_director_fps', 24);
  const [refsOn, setRefsOn] = usePersistentState('mmx_director_refs', false);
  const [soundscape, setSoundscape] = usePersistentState('mmx_director_soundscape_v2', EXAMPLE_SOUNDSCAPE);
  const [music, setMusic] = usePersistentState('mmx_director_music', '');
  const [showChars, setShowChars] = useState(false);
  const [showMore, setShowMore] = useState(false);

  const fileInput = useRef<HTMLInputElement | null>(null);
  const pending = useRef<((filename: string) => void) | null>(null);

  const totalFrames = useMemo(
    () => segments.reduce((n, s) => n + Math.max(1, s.length), 0), [segments]);
  const rendered = snapUp(totalFrames);

  /** Uploads and returns the name ComfyUI knows the file by, or null. */
  const uploadFile = async (file: File): Promise<string | null> => {
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch(`${BACKEND_API.BASE_URL}/api/upload`, { method: 'POST', body: form });
      const data = await res.json();
      if (!data.success) throw new Error(data.detail || 'Upload failed');
      return data.filename as string;
    } catch (err: any) {
      toast(err.message || 'Upload failed', 'error');
      return null;
    }
  };

  const upload = async (file: File, then: (filename: string) => void) => {
    const name = await uploadFile(file);
    if (name) then(name);
  };

  const pickFile = (accept: string, then: (filename: string) => void) => {
    if (!fileInput.current) return;
    pending.current = then;
    fileInput.current.accept = accept;
    fileInput.current.value = '';
    fileInput.current.click();
  };

  const patch = (i: number, p: Partial<Segment>) =>
    setSegments((s) => s.map((seg, j) => (j === i ? { ...seg, ...p } : seg)));

  const addShot = () => {
    setSegments((s) => [...s, { id: newId(), prompt: '', length: 62, type: 'text' }]);
    setSelected(segments.length);
  };

  const removeShot = (i: number) => {
    if (segments.length <= 1) { toast('A storyboard needs at least one shot', 'error'); return; }
    setSegments((s) => s.filter((_, j) => j !== i));
    setSelected((k) => Math.max(0, Math.min(k, segments.length - 2)));
  };

  const duplicateShot = (i: number) => {
    setSegments((s) => [
      ...s.slice(0, i + 1), { ...s[i], id: newId() }, ...s.slice(i + 1),
    ]);
    setSelected(i + 1);
  };

  // Reference files the node will actually be handed, against its own caps.
  const refImages = segments.filter((s) => s.imageFile).length
    + subjects.reduce((n, s) => n + s.images.length, 0);
  const refFiles = refImages + motion.length + audio.length;
  const motionSeconds = motion.reduce((n, c) => n + c.length, 0) / fps;


  /** The whole editor as the node wants it. One place, so nothing can drift. */
  const buildTimeline = (globalPrompt: string) => {
    let cursor = 0;
    const laidOut = segments.map((s) => {
      const seg = {
        id: s.id,
        start: cursor,
        length: Math.max(1, s.length),
        prompt: s.prompt,
        type: s.imageFile ? 'image' : 'text',
        isEndFrame: !!s.isEndFrame,
        ...(s.imageFile ? { imageFile: s.imageFile, fileName: s.fileName || s.imageFile } : {}),
      };
      cursor += seg.length;
      return seg;
    });
    return {
      mainTrackEnabled: true,
      audioTrackEnabled: audio.length > 0,
      motionTrackEnabled: motion.length > 0,
      showFilenames: true,
      showPromptZones: true,
      overrideAudio: false,
      inpaint_audio: true,
      global_prompt: globalPrompt,
      retake_global_prompt: '',
      overall_soundscape: soundscape,
      non_diegetic_music: music,
      prompt_override: '',
      prompt_override_on: false,
      retakeMode: false,
      retakeStart: 0,
      retakeLength: 0,
      retakePrompt: '',
      retakeStrength: 1,
      retakeVideo: null,
      normalStartFrame: 0,
      normalDurationFrames: totalFrames,
      reference_mode: refsOn ? 'ON' : 'OFF',
      prompt_format: 'minimax',
      analyzeProvider: 'ollama',
      analyzeBaseUrl: '',
      analyzeModel: '',
      summary: '',
      task_type_override: '',
      subjectSlotCount: subjects.length,
      subjects: subjects.map((s) => ({
        images: s.images,
        description: s.description,
        shortName: s.shortName,
        kind: s.kind,
        retention: s.retention,
        retentionNote: '',
      })),
      segments: laidOut,
      motionSegments: motion.map((c) => ({
        id: c.id, start: c.start, length: c.length, videoFile: c.file, fileName: c.file,
      })),
      audioSegments: audio.map((c) => ({
        id: c.id, start: c.start, length: c.length, audioFile: c.file, fileName: c.file,
      })),
    };
  };

  return (
    <>
      <input
        ref={fileInput} type="file" className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          const then = pending.current;
          pending.current = null;
          if (f && then) void upload(f, then);
        }}
      />
      <WorkflowPage
        workflowId="minimax-h3-director"
        storageKey="minimax-h3-director-v2"
        family="MiniMax H3"
        capability="Director"
        description="Cut a clip into shots before you render it. Each shot gets its own prompt, its own length and its own keyframe, and they come out as one continuous take with sound."
        icon={Clapperboard}
        output="video"
        prompt={{
          context: 'minimax-h3-director',
          label: 'Describe the scene',
          placeholder: 'The look, the place, the people - everything true of the whole clip…',
          defaultValue: EXAMPLE_PROMPT,
          rows: 4,
        }}
        settings={[
          {
            kind: 'chips', key: 'shape', label: 'Shape', defaultValue: 'landscape',
            options: [
              { label: 'Landscape', value: 'landscape' },
              { label: 'Portrait', value: 'portrait' },
              { label: 'Square', value: 'square' },
            ],
          },
          {
            kind: 'chips', key: 'resize_method', label: 'Fit keyframes', defaultValue: 'crop',
            advanced: true,
            hint: 'How your images are fitted to the output canvas when they are not the same shape.',
            options: [
              { label: 'Crop', value: 'crop' },
              { label: 'Keep aspect', value: 'maintain aspect ratio' },
              { label: 'Stretch', value: 'stretch to fit' },
              { label: 'Pad', value: 'pad' },
            ],
          },
          {
            kind: 'slider', key: 'steps', label: 'Steps', advanced: true, min: 4, max: 50, defaultValue: 8,
            hint: 'The graph ships with the 4-step turbo LoRA at cfg 1, which is why 8 is the '
                + 'default here rather than 20. Raising it costs time in a straight line.',
          },
          {
            kind: 'chips', key: 'sampler_name', label: 'Sampler', advanced: true, defaultValue: 'res_multistep',
            options: [
              { label: 'res_multistep', value: 'res_multistep' },
              { label: 'euler', value: 'euler' },
              { label: 'dpmpp_2m', value: 'dpmpp_2m' },
            ],
          },
          {
            kind: 'slider', key: 'shift_video', label: 'Video shift', advanced: true, min: 1, max: 30, step: 0.5, defaultValue: 12,
            hint: 'Flow sigma shift for the video stream. H3 was tuned at 12; moving it far changes motion character.',
          },
          {
            kind: 'slider', key: 'shift_audio', label: 'Audio shift', advanced: true, min: 0.5, max: 15, step: 0.5, defaultValue: 3,
            hint: 'The same for the audio stream. H3 default is 3.',
          },
          {
            kind: 'chips', key: 'ref_image_size', label: 'Reference detail', advanced: true, defaultValue: 'match',
            hint: 'Only used with references on. "Match" scales references to the output size and is fast; '
                + '"Max" keeps a 2048px short edge for identity and costs real time.',
            options: [
              { label: 'Match output — fast', value: 'match' },
              { label: 'Max — keeps identity', value: 'max' },
            ],
          },
          {
            kind: 'chips', key: 'encoder_device', label: 'Text encoder', advanced: true, defaultValue: 'cpu',
            hint: 'The encoder is 15 GB. On CPU it takes a few minutes to read the prompt before anything '
                + 'appears to happen - that silence is normal - but it leaves the GPU for the diffusion model.',
            options: [
              { label: 'CPU — slow, frees 15 GB', value: 'cpu' },
              { label: 'GPU — fast, needs headroom', value: 'default' },
            ],
          },
          { kind: 'seed', key: 'seed', advanced: true },
        ]}
        extraParams={(values, ctx) => {
          const timeline = buildTimeline(ctx.prompt);
          const shape = SHAPES[(values.shape as keyof typeof SHAPES)] ?? SHAPES.landscape;
          return {
            width: shape.width,
            height: shape.height,
            timeline_data: JSON.stringify(timeline),
            local_prompts: segments.map((s) => s.prompt.trim()).join(' | '),
            segment_lengths: segments.map((s) => Math.max(1, s.length)).join(','),
            start_frame: 0,
            end_frame: totalFrames,
            duration_frames: totalFrames,
            start_second: 0,
            end_second: totalFrames / fps,
            duration_seconds: totalFrames / fps,
            frame_rate: fps,
            display_mode: 'seconds',
            divisible_by: 32,
            img_compression: 0,
            use_custom_audio: audio.length > 0,
            use_custom_motion: motion.length > 0,
            override_audio: false,
            ref_image_notes: '',
          };
        }}
        extraSectionsTop={(
          <div className="space-y-4">
            <div className="workflow-section">
              <div className="workflow-section-header">
                <div className="workflow-section-title flex items-center gap-1.5">
                  Storyboard
                  <InfoTip text={
                    'Each block is one shot. Its prompt describes only what happens in that '
                    + 'stretch; the global prompt above covers everything true of the whole clip. '
                    + 'H3 renders on a 17k+5 frame grid and rounds up, so the finished clip can be '
                    + 'slightly longer than the blocks add up to.'
                  } />
                </div>
                <div className="text-[11px] text-white/45">
                  {segments.length} shots · {totalFrames} frames · {fmt(totalFrames, fps)}
                  {rendered !== totalFrames && (
                    <span className="text-amber-300/80"> → renders {rendered} ({fmt(rendered, fps)})</span>
                  )}
                </div>
              </div>

              <DirectorTimeline
                segments={segments}
                setSegments={setSegments}
                motion={motion}
                setMotion={setMotion}
                audio={audio}
                setAudio={setAudio}
                fps={fps}
                selected={selected}
                setSelected={setSelected}
                refsOn={refsOn}
                onUpload={uploadFile}
              />

              <div className="mt-3 space-y-2">
                {segments.map((seg, i) => (
                  <div
                    key={seg.id}
                    onClick={() => setSelected(i)}
                    className={`rounded-lg border p-2.5 transition ${
                      i === selected
                        ? 'border-white/25 bg-white/[0.04]'
                        : 'border-white/10 hover:border-white/20'}`}
                  >
                    <div className="mb-1.5 flex items-center gap-2">
                      <span className="text-[11px] font-semibold text-white/70">Shot {i + 1}</span>
                      <span className="text-[11px] text-white/35">{fmt(seg.length, fps)}</span>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); duplicateShot(i); }}
                        className="ml-auto text-white/35 transition hover:text-white"
                        title="Duplicate this shot"
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); removeShot(i); }}
                        className="text-white/35 transition hover:text-red-300"
                        title="Delete this shot"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>

                    <textarea
                      value={seg.prompt}
                      onChange={(e) => patch(i, { prompt: e.target.value })}
                      onFocus={() => setSelected(i)}
                      rows={2}
                      placeholder="What happens in this shot — the framing, the move, the sound…"
                      className="w-full rounded-md border border-white/10 bg-black/30 px-2.5 py-2
                                 text-[12px] text-white/85 placeholder:text-white/25"
                    />

                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      {seg.imageFile ? (
                        <span className="flex items-center gap-1 rounded-md border border-white/15 px-2 py-1
                                         text-[11px] text-white/70">
                          <ImageIcon className="h-3 w-3" />
                          <span className="max-w-[160px] truncate">{seg.fileName || seg.imageFile}</span>
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation();
                              patch(i, { imageFile: undefined, fileName: undefined, type: 'text' }); }}
                            className="text-white/40 hover:text-white"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation();
                            pickFile('image/*', (f) =>
                              patch(i, { imageFile: f, fileName: f, type: 'image' })); }}
                          className="flex items-center gap-1 rounded-md border border-dashed border-white/15
                                     px-2 py-1 text-[11px] text-white/45 transition
                                     hover:border-white/30 hover:text-white/80"
                        >
                          <ImageIcon className="h-3 w-3" /> Keyframe
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); patch(i, { isEndFrame: !seg.isEndFrame }); }}
                        className={`flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] transition ${
                          seg.isEndFrame
                            ? 'border-white/30 bg-white/10 text-white'
                            : 'border-white/10 text-white/45 hover:text-white/80'}`}
                        title="Treat this image as the shot's closing frame rather than its opening one"
                      >
                        <Flag className="h-3 w-3" /> End frame
                      </button>
                    </div>
                  </div>
                ))}

                <button
                  type="button"
                  onClick={addShot}
                  className="flex w-full items-center justify-center gap-1 rounded-lg border border-dashed
                             border-white/15 py-2 text-[11px] text-white/45 transition
                             hover:border-white/30 hover:text-white/80"
                >
                  <Plus className="h-3 w-3" /> Add a shot
                </button>
              </div>

              {totalFrames < TRAINED_MIN_FRAMES && (
                <p className="mt-2 text-[11px] text-amber-300/80">
                  Under {TRAINED_MIN_FRAMES} frames is below what H3 was trained on
                  ({fmt(TRAINED_MIN_FRAMES, fps)}) — motion tends to come out stiff.
                </p>
              )}
              {totalFrames > TRAINED_MAX_FRAMES && (
                <p className="mt-2 text-[11px] text-amber-300/80">
                  Over {TRAINED_MAX_FRAMES} frames is past H3's trained range
                  ({fmt(TRAINED_MAX_FRAMES, fps)}) — quality drifts toward the end.
                </p>
              )}
            </div>
          </div>
        )}

        extraSections={(
          <div className="space-y-4">
            <button
              type="button"
              onClick={() => setShowMore(!showMore)}
              className="flex w-full items-center justify-between rounded-md border border-white/10
                         px-3 py-2 text-[11px] text-white/50 transition hover:text-white/80"
            >
              <span>Sound, references and timeline rate</span>
              <span>{showMore ? '−' : '+'}</span>
            </button>

            {showMore && (
            <>
            {/* ---- sound ---- */}
            <div className="workflow-section">
              <div className="workflow-section-header">
                <div className="workflow-section-title flex items-center gap-1.5">
                  Sound
                  <InfoTip text={
                    'H3 generates picture and sound together, so these describe what should be heard '
                    + 'rather than supplying it. Reference clips below are separate: those are real audio '
                    + 'the model listens to.'
                  } />
                </div>
              </div>
              <input
                value={soundscape}
                onChange={(e) => setSoundscape(e.target.value)}
                placeholder="Overall soundscape — wind, traffic, a room tone…"
                className="w-full rounded-md border border-white/10 bg-black/30 px-2.5 py-1.5 text-[12px]
                           text-white/85 placeholder:text-white/25"
              />
              <input
                value={music}
                onChange={(e) => setMusic(e.target.value)}
                placeholder="Score — music that is not in the room"
                className="mt-1.5 w-full rounded-md border border-white/10 bg-black/30 px-2.5 py-1.5 text-[12px]
                           text-white/85 placeholder:text-white/25"
              />
            </div>

            {/* ---- references ---- */}
            <div className="workflow-section">
              <div className="workflow-section-header">
                <div className="workflow-section-title flex items-center gap-1.5">
                  References
                  <InfoTip text={
                    'Reference mode loads a different 20 GB checkpoint (ref2va) instead of the normal one, '
                    + 'so it is a real switch, not a toggle you leave on. Off, keyframes still work — '
                    + 'characters, reference video and reference audio do not.'
                  } />
                </div>
                <button
                  type="button"
                  onClick={() => setRefsOn(!refsOn)}
                  className={`rounded-md border px-2.5 py-1 text-[11px] font-semibold transition ${
                    refsOn ? 'border-white/30 bg-white/10 text-white'
                           : 'border-white/10 text-white/45 hover:text-white/80'}`}
                >
                  {refsOn ? 'Refs ON — ref2va' : 'Refs OFF — fl2va'}
                </button>
              </div>

              {refsOn && (
                <div className="space-y-3">
                  <div>
                    <div className="mb-1 flex items-center gap-1.5 text-[11px] text-white/50">
                      <Film className="h-3 w-3" /> Reference video
                      <span className="ml-auto">
                        {motion.length}/{MAX_REF_VIDEOS} · {motionSeconds.toFixed(1)}s
                        {motionSeconds > REF_VIDEO_TOTAL_SEC && (
                          <span className="text-amber-300/80"> · over {REF_VIDEO_TOTAL_SEC}s</span>
                        )}
                      </span>
                    </div>
                    <p className="text-[11px] text-white/35">
                      Drop a clip on the blue track above.
                    </p>
                  </div>

                  <div>
                    <div className="mb-1 flex items-center gap-1.5 text-[11px] text-white/50">
                      <Music className="h-3 w-3" /> Reference audio
                      <span className="ml-auto">{audio.length}/{MAX_REF_AUDIOS}</span>
                    </div>
                    <p className="text-[11px] text-white/35">
                      Drop a file on the green track above.
                    </p>
                  </div>

                  <div>
                    <button
                      type="button"
                      onClick={() => setShowChars(!showChars)}
                      className="flex w-full items-center justify-between text-[11px] text-white/50 hover:text-white/80"
                    >
                      <span>Characters and objects ({subjects.length})</span>
                      <span>{showChars ? '−' : '+'}</span>
                    </button>
                    {showChars && (
                      <div className="mt-1.5 space-y-2">
                        {subjects.map((sub, i) => (
                          <div key={i} className="rounded-md border border-white/10 p-2">
                            <div className="flex gap-1.5">
                              <input
                                value={sub.shortName}
                                onChange={(e) => setSubjects((ss) => ss.map((x, j) =>
                                  j === i ? { ...x, shortName: e.target.value } : x))}
                                placeholder="Name used in the prompt"
                                className="flex-1 rounded border border-white/10 bg-black/30 px-2 py-1 text-[11px]"
                              />
                              <select
                                value={sub.kind}
                                onChange={(e) => setSubjects((ss) => ss.map((x, j) =>
                                  j === i ? { ...x, kind: e.target.value as Subject['kind'] } : x))}
                                className="rounded border border-white/10 bg-black/30 px-1.5 py-1 text-[11px]"
                              >
                                {SUBJECT_KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
                              </select>
                              <button type="button"
                                      onClick={() => setSubjects((ss) => ss.filter((_, j) => j !== i))}
                                      className="text-white/40 hover:text-white">
                                <X className="h-3.5 w-3.5" />
                              </button>
                            </div>
                            <input
                              value={sub.description}
                              onChange={(e) => setSubjects((ss) => ss.map((x, j) =>
                                j === i ? { ...x, description: e.target.value } : x))}
                              placeholder="What they look like"
                              className="mt-1.5 w-full rounded border border-white/10 bg-black/30 px-2 py-1 text-[11px]"
                            />
                            <div className="mt-1.5 flex flex-wrap items-center gap-1">
                              {sub.images.map((img) => (
                                <span key={img}
                                      className="flex items-center gap-1 rounded border border-white/10 px-1.5 py-0.5 text-[10px] text-white/60">
                                  <span className="max-w-[110px] truncate">{img}</span>
                                  <button type="button"
                                          onClick={() => setSubjects((ss) => ss.map((x, j) =>
                                            j === i ? { ...x, images: x.images.filter((y) => y !== img) } : x))}
                                          className="text-white/40 hover:text-white">
                                    <X className="h-2.5 w-2.5" />
                                  </button>
                                </span>
                              ))}
                              <button
                                type="button"
                                onClick={() => pickFile('image/*', (f) => setSubjects((ss) => ss.map((x, j) =>
                                  j === i ? { ...x, images: [...x.images, f] } : x)))}
                                className="rounded border border-dashed border-white/15 px-1.5 py-0.5 text-[10px]
                                           text-white/40 hover:border-white/30 hover:text-white/70"
                              >
                                + photo
                              </button>
                            </div>
                          </div>
                        ))}
                        <button
                          type="button"
                          onClick={() => setSubjects((ss) => [...ss, emptySubject()])}
                          className="w-full rounded-md border border-dashed border-white/15 py-1 text-[11px]
                                     text-white/45 hover:border-white/30 hover:text-white/80"
                        >
                          + Character or object
                        </button>
                      </div>
                    )}
                  </div>

                  {refFiles > MAX_REF_FILES && (
                    <p className="text-[11px] text-amber-300/80">
                      {refFiles} reference files — H3 takes {MAX_REF_FILES} in total across images,
                      video and audio. The ones past the limit are dropped from the back.
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* ---- timeline rate ---- */}
            <div className="workflow-section">
              <div className="workflow-section-header">
                <div className="workflow-section-title flex items-center gap-1.5">
                  Timeline rate
                  <InfoTip text={
                    'The rate the shot lengths above are counted in. H3 always renders at 24 fps — '
                    + 'this only decides how many frames a second of storyboard is worth, so at 12 the '
                    + 'same shot list makes a clip twice as long.'
                  } />
                </div>
                <div className="text-[11px] text-white/45">{fps} fps</div>
              </div>
              <input type="range" min={8} max={30} step={1} value={fps}
                     onChange={(e) => setFps(+e.target.value)} className="w-full" />
            </div>
            </>
            )}
          </div>
        )}
        generateLabel="Render storyboard"
        generatingLabel="Rendering…"
        readyMessage="Take ready"
      />
    </>
  );
};
