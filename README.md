# FEDDA Hub v3.0

A local front end for ComfyUI. Pick a workflow from a card, fill in a few
fields, press generate — the graph, the model paths and the node wiring are
handled for you. Everything runs on your own machine; nothing is sent anywhere
unless you choose a cloud model yourself.

- **Image** — text to image, inpainting, outpainting, upscaling, face and pose control
- **Video** — image to video, first/last frame, video editing, lip sync
- **LoRA & characters** — install, organise and generate with your own LoRAs
- **Gallery** — everything you have made, images and video together
- **Local language models** via Ollama, and optional cloud models via Venice.ai

## What you need

| | |
|---|---|
| OS | Windows 10 or 11 |
| GPU | NVIDIA, 12 GB VRAM or more. RTX 20-series or newer |
| Disk | 100 GB free to start. Models are large |
| Network | The first install downloads several GB |

No Python, Git or Node installation needed — the installer brings its own.

## Install

Download `FEDDA_Hub_v3.0_Installer.bat`, put it in the folder you want FEDDA to
live in, and run it. It creates:

```text
<your folder>\
  FEDDA_Hub_v3.0_Installer.bat
  app\      the application
  logs\     installer logs
```

The first run takes a while: it fetches Python, ComfyUI, the custom nodes and
the starter models. When it finishes it writes `logs\install_report.txt` — if
anything went wrong, that file says what.

## Run

```text
run.bat
```

The installer puts it in the folder you chose, beside `app\`. It starts
ComfyUI, the FEDDA backend and the frontend together and opens the app.
Closing the window stops all three.

## Update

`run.bat` checks for a new version when it starts and offers it — press Enter
to take it, or N to skip and go straight to the app. To update without
launching:

```text
update.bat
```

It pulls the latest FEDDA, updates ComfyUI and the custom nodes, and leaves
your models, outputs and settings alone. It refuses to run if it would
overwrite local changes, and rolls back if an update stops ComfyUI starting.

## What lives where

```text
app\ComfyUI\models\      models, organised per type
app\ComfyUI\output\      everything you generate
app\config\              workflow and module definitions
app\logs\                run and install logs
```

Models, outputs, logs and the Python runtime are local only and never part of
this repository.

## Ports

ComfyUI runs on **8199** and the FEDDA backend on **8000**. If something else on
your machine already uses those, FEDDA will not start — the launcher says so
rather than failing quietly.

## Custom nodes

FEDDA uses 61 ComfyUI node packs. They are **not** included here: the installer
clones each one from its own repository, under its author's own licence.
`config/nodes.json` lists every pack and where it comes from.
