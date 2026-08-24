# FEDDA Hub — working notes

A local ComfyUI front-end: FastAPI backend, React/Vite frontend, ComfyUI running
alongside. These are the conventions that are not obvious from the code, written
down so they do not have to be rediscovered.

## Layout

```
repo/                  this repository - edit here
install/app/           a clone of the published repo that actually runs
```

The install is a working clone. Copy changed files into it to test them, but see
**Publishing** — it resets itself.

## Running and verifying

**Never start or restart ComfyUI, the backend, or the frontend.** The user runs
those. Ask them to restart when a change needs it.

- Backend on 8000, **no auto-reload** — Python changes need a backend restart.
- Frontend on 5173 — Vite picks up changes without one.
- ComfyUI on **8199**, not the default 8188.
- `config/*.json` is read by the backend, so config changes need a restart too.
- Graph JSON under `backend/workflows/` is read per run — no restart.

Typecheck from the install, which has `node_modules`:

```bash
cd install/app/frontend && ./node_modules/.bin/tsc --noEmit -p tsconfig.app.json
```

`npx tsc` in the repo fetches an unrelated package that prints a joke and exits
0. It is not a typecheck. The baseline is **52 pre-existing errors** across 11
files; compare against that number rather than expecting zero.

## Publishing

Only ever via `scripts/sync_mirror.ps1`, and only when explicitly asked. It
pushes, rebuilds the bare repo, uploads the repo and the installer, and verifies
both sources serve the same commit. A bare `git push` publishes to GitHub and
leaves the domain — which is what users install from — stale.

`install/app` runs `git reset --hard origin/main` when it updates, so anything
copied in that is not published is erased on the next launch. Its guard only
refuses when the *install clone* has unpushed commits; commits in `repo/` are
invisible to it. To test an unpublished change across a restart, re-copy after
the restart or publish first.

## Anatomy of a workflow

Seven places, and missing one is the usual cause of "the tab is not there":

| file | holds |
| --- | --- |
| `backend/workflows/**/*.json` | the ComfyUI API graph |
| `config/workflow_api.json` | param → `node_id` + `input_key` mapping |
| `config/modules.json` | module: which tabs, workflows and custom nodes |
| `frontend/src/modules/registry.ts` | the tile, plus a `SourceModuleId` union |
| `frontend/src/config/navigation.ts` | the tab in the sidebar |
| `frontend/src/pages/workflowPageRegistry.tsx` | tab id → page component |
| `frontend/src/pages/**` | the page itself |

`registry.ts` starts with a closed `SourceModuleId` union. A new module id has to
be added there or the entry fails to typecheck.

### Mapping

`{"node_id": "12", "input_key": "width", "type": "number", "label": "Width"}`.
Use `node_ids` (plural) when one control feeds several nodes.

Map a prompt to the node that actually holds the text. When a `CLIPTextEncode`
takes its `text` from a Text Concatenate or a primitive, sending to the encoder
is silently dropped and the graph keeps generating its baked prompt.

### LoRA slots

`{"node_id": "20", "type": "loras"}` marks a **placeholder**. At run time
`workflow_service` deletes that node and rebuilds a chain named `_lora_0`,
`_lora_1`, … from the user's picks, wiring from the placeholder's own model and
clip sources; with none picked it rewires straight through.

Give the placeholder an ordinary numeric id. Its rewiring loop skips ids
beginning with `_lora_`, so a placeholder literally named `_lora_0` is one whose
downstream links never get repointed.

An always-on LoRA is a separate real node placed before the placeholder.

### Model downloads

The `HuggingFaceDownloader` node **inside the graph** is how the app learns what
a workflow needs. `scripts/generate_model_manifests.py` scans for it and writes
`config/model_manifests/`, which the installer reads. A workflow without one
runs on a machine that already has the weights and nowhere else. Run the script
after adding or changing a graph.

Line format: `URL folder [filename]`, folder relative to `ComfyUI/models`.
Nested folders (`loras/FLUX`, `ultralytics/bbox`) work. Leave `hf_token` empty —
the real one comes from `runtime_settings.json` at run time and must never be
committed.

Check URLs before writing them in. Gated repositories answer 401 without an
accepted licence and will stop an install on a file the user cannot fetch; find
an open mirror instead. Note also that `easy showAnything` is registered as an
output node, so a downloader hanging off one is its own execution root and runs
even when nothing downstream reads it.

### Pages

- `WorkflowPage` — declarative: `inputs`, `prompt`, `settings` (`slider`,
  `chips` with `defaultValue`, `seed`), `extraSections` for anything the page
  owns rather than sends.
- `Txt2ImgPage` (in `pages/zimage/ZImageTxt2Img.tsx`) — the richer shared
  text-to-image page, with a LoRA picker and ratio presets. It always renders
  the LoRA panel.

**fp8 / GGUF variants are two workflows, not a setting.** The page holds the
choice in `usePersistentState`, picks the `workflowId`, and renders the toggle
through `extraSections` — it has to take effect on click, not at generate time.
Pin `storageKey` so prompt and settings survive the switch.

### Agent

`AGENT_ENABLED` in `registry.ts` lists which workflows the chat agent may drive,
in order. The schema endpoint reports what a workflow `makes` ("video" or
"image"), read off the graph, and that plus whether it requires an image picks
one of three prompt modes: edit a picture, make a picture, make a clip. A video
workflow that takes reference images is not an edit workflow.

## Models on disk

`extra_model_paths.yaml` decides what ComfyUI can see. Folders owned by custom
nodes rather than core — `sams`, `ultralytics_bbox`, `ultralytics_segm`,
`insightface`, `ipadapter`, `inpaint` — need explicit entries; core does not
register them. `checkpoints/` acts as a fallback for every type, so rank it last
when resolving duplicates.

LoRAs are architecture-specific. FLUX.1-dev family and FLUX.2-klein are
different models with different text encoders; loading one's LoRA on the other
fails with dimension errors.

## Windows notes

- The shell is PowerShell 5.1. `ConvertFrom-Json` passes a JSON array on as one
  object — assign first, then wrap: `$x = ... | ConvertFrom-Json; @($x)`.
- Writing files from Python: read with `newline=''`, translate explicitly, and
  write with `newline=''`. Passing `newline='\r\n'` translates again on top of
  text that already has it, giving `\r\r\n` throughout the file.
- Heredocs mangle backslashes. Write patch scripts to a file instead of piping
  them in, or keep backslashes out of the script entirely.
- In `.bat`, `::` inside a parenthesised block is a label — use `rem`. Calling
  another `.bat` without `call` transfers control and never returns.

## Verifying changes

Prefer exercising the real code over reasoning about it. `workflow_service`
exposes `prepare_payload(workflow_id, params)`, which builds the exact graph
ComfyUI would receive — run it with and without LoRAs and check the wiring
rather than reading the JSON and assuming. Backend functions can be pulled out
of `server.py` with `ast` and run against real config when importing the whole
module is too heavy.

A test that cannot fail proves nothing. Check the thing itself, not a proxy for
it: one green probe is not a diagnosis.
