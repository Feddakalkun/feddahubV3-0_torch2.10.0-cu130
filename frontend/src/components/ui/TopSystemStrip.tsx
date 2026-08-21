import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Timer, Activity, BrainCircuit, Loader2, Trash2, Zap, DownloadCloud, Play, KeyRound, RotateCcw, FolderCog, X } from 'lucide-react';
import { useComfyStatus } from '../../hooks/useComfyStatus';
import { useOllamaStatus } from '../../hooks/useOllamaStatus';
import { useComfyExecution } from '../../contexts/ComfyExecutionContext';
import { BACKEND_API } from '../../config/api';
import { useModelDownload } from '../../contexts/ModelDownloadContext';

/** m:ss under an hour, h:mm:ss above it - a bare seconds count stops being
 *  readable exactly when a run is long enough for you to care. */
const fmtDuration = (ms: number) => {
  const total = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const sec = total % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
    : `${m}:${String(sec).padStart(2, '0')}`;
};


/**
 * Every pill in this bar is the same box: same height, same padding, same type,
 * and - the one that matters - one line.
 *
 * They had drifted apart, two semibold against seven medium, tints at 8% beside
 * 10%. But the visible misalignment came from wrapping: at h-8 there is room for
 * one line of text-xs, and "Civitai Key Missing" was taking two, which sat at a
 * different height from "Folders" next to it. Colour stays per-pill because it
 * carries meaning; shape does not, so shape is shared.
 */
const PILL = 'h-8 shrink-0 px-3 rounded-lg border text-xs font-medium '
           + 'whitespace-nowrap transition-all flex items-center gap-1.5';

export const TopSystemStrip = () => {
  const comfy = useComfyStatus(3000);
  const ollama = useOllamaStatus();
  const { state, currentNodeName, currentNodeId, progress, overallProgress, isDownloaderNode, currentDownloaderInfo,
          elapsedMs, secondsPerStep, etaMs } = useComfyExecution();
  
  const [comfyStats, setComfyStats] = useState<any>(null);
  const [gpuStats, setGpuStats] = useState<any>(null);
  const [purging, setPurging] = useState(false);
  // Folders the user may point elsewhere. Empty means the default, which the
  // backend supplies so the placeholder can show what "empty" actually means.
  const [foldersOpen, setFoldersOpen] = useState(false);
  const [folders, setFolders] = useState({ extra_models_path: '', output_path: '', input_path: '' });
  const [folderDefaults, setFolderDefaults] = useState<Record<string, string>>({});
  const [folderErr, setFolderErr] = useState('');
  const [folderSaving, setFolderSaving] = useState(false);
  const [folderSaved, setFolderSaved] = useState(false);

  useEffect(() => {
    if (!foldersOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setFoldersOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [foldersOpen]);

  const openFolders = async () => {
    setFolderErr(''); setFolderSaved(''.length > 0); setFoldersOpen(true);
    try {
      const r = await fetch(`${BACKEND_API.BASE_URL}${BACKEND_API.ENDPOINTS.SETTINGS_FOLDERS}`);
      const d = await r.json();
      if (d?.success) { setFolders(d.paths); setFolderDefaults(d.defaults || {}); }
    } catch { setFolderErr('Could not read the current folders.'); }
  };

  const saveFolders = async () => {
    setFolderSaving(true); setFolderErr(''); setFolderSaved(false);
    try {
      const r = await fetch(`${BACKEND_API.BASE_URL}${BACKEND_API.ENDPOINTS.SETTINGS_FOLDERS}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(folders),
      });
      const d = await r.json();
      // The backend rejects a folder that is missing or unwritable, and says
      // which one - far better than a ComfyUI that silently fails to start.
      if (!r.ok || d?.success === false) throw new Error(d?.detail || 'Could not save');
      setFolderSaved(true);
    } catch (e: any) {
      setFolderErr(e?.message || 'Could not save');
    } finally { setFolderSaving(false); }
  };

  const [hfConfigured, setHfConfigured] = useState(false);
  const [hfLoading, setHfLoading] = useState(true);
  const [hfSaving, setHfSaving] = useState(false);
  const [civitaiConfigured, setCivitaiConfigured] = useState(false);
  const [civitaiLoading, setCivitaiLoading] = useState(true);
  const [civitaiSaving, setCivitaiSaving] = useState(false);
  const { progress: download } = useModelDownload();
  // The Venice key moved out of localStorage and into runtime_settings.json, so
  // the backend can use it too - that is what lets a vision model reach the
  // caption path. Status now reports whether Venice actually accepts it, which
  // localStorage could never answer.
  const [veniceConfigured, setVeniceConfigured] = useState(false);
  const [veniceValid, setVeniceValid] = useState<boolean | null>(null);
  const [veniceUsd, setVeniceUsd] = useState<number | null>(null);
  const [veniceSaving, setVeniceSaving] = useState(false);

  // Poll hardware + comfy system stats
  useEffect(() => {
    let mounted = true;

    const update = async () => {
      // GPU stats from our backend
      try {
        const r = await fetch('/api/hardware/stats', { cache: 'no-store' });
        if (r.ok && mounted) setGpuStats(await r.json());
      } catch {}

      // ComfyUI VRAM stats — always via Vite proxy path to avoid CORS
      if (comfy.isConnected) {
        try {
          const r = await fetch('/comfy/system_stats', { cache: 'no-store' });
          if (r.ok && mounted) setComfyStats(await r.json());
        } catch {}
      } else {
        if (mounted) setComfyStats(null);
      }
    };

    update();
    const id = setInterval(update, 3000);
    return () => { mounted = false; clearInterval(id); };
  }, [comfy.isConnected]);

  useEffect(() => {
    let mounted = true;

    const loadTokenStatus = async () => {
      try {
        const [hfResp, civitaiResp, veniceResp] = await Promise.all([
          fetch(`${BACKEND_API.BASE_URL}${BACKEND_API.ENDPOINTS.SETTINGS_HF_TOKEN_STATUS}`, { cache: 'no-store' }),
          fetch(`${BACKEND_API.BASE_URL}${BACKEND_API.ENDPOINTS.SETTINGS_CIVITAI_KEY_STATUS}`, { cache: 'no-store' }),
          fetch(`${BACKEND_API.BASE_URL}${BACKEND_API.ENDPOINTS.SETTINGS_VENICE_KEY_STATUS}`, { cache: 'no-store' }),
        ]);
        const [hfData, civitaiData, veniceData] = await Promise.all([
          hfResp.json(), civitaiResp.json(), veniceResp.json(),
        ]);
        if (mounted) {
          setHfConfigured(!!hfData.configured);
          setCivitaiConfigured(!!civitaiData.configured);
          setVeniceConfigured(!!veniceData.configured);
          setVeniceValid(veniceData.configured ? !!veniceData.valid : null);
          setVeniceUsd(typeof veniceData?.balance?.balances?.usd === 'number'
            ? veniceData.balance.balances.usd
            : null);
          // A key saved by an older build still sits in localStorage, where the
          // backend cannot see it. Move it across once rather than making every
          // existing user type it in again, then drop it from the browser.
          const legacy = localStorage.getItem('venice_api_key');
          if (legacy && !veniceData.configured) void migrateVeniceKey(legacy);
        }
      } catch {
        if (mounted) {
          setHfConfigured(false);
          setCivitaiConfigured(false);
          setVeniceConfigured(false);
        }
      } finally {
        if (mounted) {
          setHfLoading(false);
          setCivitaiLoading(false);
        }
      }
    };

    loadTokenStatus();
    return () => { mounted = false; };
  }, []);

  const gpu = useMemo(() => {
    // Primary: nvidia-smi via our backend (always available, memory in MiB)
    if (gpuStats?.gpu) {
      const g = gpuStats.gpu;
      const usedMiB = g.memory?.used ?? 0;
      const totalMiB = g.memory?.total ?? 0;
      return {
        name: String(g.name || '').replace('NVIDIA GeForce ', ''),
        usedGiB: (usedMiB / 1024).toFixed(1),
        totalGiB: (totalMiB / 1024).toFixed(1),
        pct: Math.round(g.memory?.percentage ?? 0),
        temp: g.temperature ?? null,
      };
    }
    // Fallback: ComfyUI system_stats (memory in bytes)
    if (!comfyStats?.devices?.length) return null;
    const d = comfyStats.devices[0];
    const total = Number(d.vram_total || 0);
    const free = Number(d.vram_free || 0);
    const used = Math.max(0, total - free);
    return {
      name: String(d.name || '').replace('NVIDIA GeForce ', ''),
      usedGiB: (used / 1024 ** 3).toFixed(1),
      totalGiB: (total / 1024 ** 3).toFixed(1),
      pct: total > 0 ? Math.round((used / total) * 100) : 0,
      temp: null,
    };
  }, [comfyStats, gpuStats]);

  const handlePurge = async () => {
    if (purging) return;
    if (!confirm('Purge VRAM? This stops active generation and unloads all models.')) return;
    setPurging(true);
    try {
      await fetch('/comfy/free', { method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ unload_models: true, free_memory: true }),
      });
    } finally {
      setPurging(false);
    }
  };

  // Clears the app's saved UI state (localStorage/sessionStorage) and reloads,
  // so stale prompts/selections/defaults reset without clearing Chrome by hand.
  // Server settings (HF/Civitai keys) live in runtime_settings.json and are unaffected.
  const handleResetUi = () => {
    if (!confirm('Reset UI state? Clears saved prompts, selections and cached page state, then reloads. Your models, outputs and API keys are NOT touched.')) return;
    try {
      localStorage.clear();
      sessionStorage.clear();
    } catch { /* ignore storage errors */ }
    window.location.reload();
  };

  const comfyLabel = comfy.isLoading
    ? 'Checking...'
    : comfy.isConnected ? 'ComfyUI Online' : 'ComfyUI Offline';

  const ollamaLabel = ollama.isLoading
    ? 'Checking...'
    : ollama.isConnected ? 'Ollama Online' : 'Ollama Offline';

  const downloaderLabel = currentDownloaderInfo?.downloaderType === 'huggingface'
    ? 'HF Model Downloader'
    : currentDownloaderInfo?.downloaderType === 'sam2'
      ? 'SAM2 Model Loader'
      : currentDownloaderInfo?.downloaderType === 'florence2'
        ? 'Florence2 Model Loader'
        : currentNodeName || 'Model Downloader';

  const downloaderDetail = currentDownloaderInfo
    ? `${currentDownloaderInfo.downloadMissing ?? 0}/${currentDownloaderInfo.downloadTotal ?? 0} missing`
    : '';

  const downloaderTitle = currentDownloaderInfo?.downloadFiles?.length
    ? currentDownloaderInfo.downloadFiles
        .slice(0, 12)
        .map((file) => `${file.exists ? 'OK' : 'Missing'} ${file.folder || 'models'}/${file.filename || ''}`)
        .join('\n')
    : currentNodeName;

  const handleHfToken = async () => {
    if (hfSaving) return;
    const nextToken = window.prompt(
      hfConfigured
        ? 'Paste a new Hugging Face token to replace the current one. Leave blank to remove it.'
        : 'Paste your Hugging Face token (starts with hf_). It will be auto-applied to downloader nodes.',
      ''
    );

    if (nextToken === null) return;

    const trimmed = nextToken.trim();
    if (!trimmed && hfConfigured && !window.confirm('Remove the saved Hugging Face token?')) {
      return;
    }

    setHfSaving(true);
    try {
      const r = await fetch(`${BACKEND_API.BASE_URL}${BACKEND_API.ENDPOINTS.SETTINGS_HF_TOKEN}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: trimmed }),
      });
      if (!r.ok) throw new Error('Failed to save token');
      const data = await r.json();
      setHfConfigured(!!data.configured);
    } catch {
      window.alert('Could not save Hugging Face token.');
    } finally {
      setHfSaving(false);
    }
  };

  const saveVeniceKey = async (value: string) => {
    const res = await fetch(`${BACKEND_API.BASE_URL}${BACKEND_API.ENDPOINTS.SETTINGS_VENICE_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ api_key: value }),
    });
    const data = await res.json();
    if (!res.ok || !data?.success) throw new Error(data?.detail || 'Could not save the key');
    return !!data.configured;
  };

  // One-time carry-over from the localStorage era. Silent on purpose: the user
  // set this key already and does not need to be told where it is stored now.
  const migrateVeniceKey = async (value: string) => {
    try {
      const ok = await saveVeniceKey(value);
      localStorage.removeItem('venice_api_key');
      setVeniceConfigured(ok);
      const check = await fetch(
        `${BACKEND_API.BASE_URL}${BACKEND_API.ENDPOINTS.SETTINGS_VENICE_KEY_STATUS}`,
        { cache: 'no-store' });
      const state = await check.json();
      setVeniceValid(state?.configured ? !!state.valid : null);
      setVeniceUsd(typeof state?.balance?.balances?.usd === 'number' ? state.balance.balances.usd : null);
    } catch {
      /* leave it in localStorage so the next load can try again */
    }
  };

  const handleVeniceKey = async () => {
    if (veniceSaving) return;
    const next = window.prompt(
      veniceConfigured
        ? 'Paste a new Venice.ai API key to replace the current one. Leave blank to remove it.'
        : 'Paste your Venice.ai API key (from venice.ai account settings).',
      '',
    );
    if (next === null) return;
    const trimmed = next.trim();
    if (!trimmed && veniceConfigured && !window.confirm('Remove the saved Venice.ai API key?')) return;
    setVeniceSaving(true);
    try {
      const ok = await saveVeniceKey(trimmed);
      localStorage.removeItem('venice_api_key');
      setVeniceConfigured(ok);
      if (!ok) {
        setVeniceValid(null);
        setVeniceUsd(null);
      } else {
        const check = await fetch(
          `${BACKEND_API.BASE_URL}${BACKEND_API.ENDPOINTS.SETTINGS_VENICE_KEY_STATUS}`,
          { cache: 'no-store' });
        const state = await check.json();
        setVeniceValid(!!state?.valid);
        setVeniceUsd(typeof state?.balance?.balances?.usd === 'number' ? state.balance.balances.usd : null);
      }
    } catch (err) {
      setVeniceValid(false);
    } finally {
      setVeniceSaving(false);
    }
  };

  const handleCivitaiKey = async () => {
    if (civitaiSaving) return;
    const nextKey = window.prompt(
      civitaiConfigured
        ? 'Paste a new Civitai API key to replace the current one. Leave blank to remove it.'
        : 'Paste your Civitai API key. It will be auto-applied to Civitai downloads.',
      ''
    );

    if (nextKey === null) return;

    const trimmed = nextKey.trim();
    if (!trimmed && civitaiConfigured && !window.confirm('Remove the saved Civitai API key?')) {
      return;
    }

    setCivitaiSaving(true);
    try {
      const r = await fetch(`${BACKEND_API.BASE_URL}${BACKEND_API.ENDPOINTS.SETTINGS_CIVITAI_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ api_key: trimmed }),
      });
      if (!r.ok) throw new Error('Failed to save Civitai key');
      const data = await r.json();
      setCivitaiConfigured(!!data.configured);
    } catch {
      window.alert('Could not save Civitai API key.');
    } finally {
      setCivitaiSaving(false);
    }
  };

  return (
    <div className="hidden xl:flex items-center gap-2">

      {/* Model download - global, so it survives leaving the page that started it */}
      {download && (
        <div className="h-8 min-w-[300px] px-3 rounded-lg border border-amber-500/30 bg-amber-500/10 flex items-center gap-2.5">
          <DownloadCloud className="w-3.5 h-3.5 text-amber-300 animate-pulse shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="flex justify-between items-center gap-2 mb-1">
              <span className="text-[10px] font-mono text-amber-100/80 truncate">
                {download.filename || 'Downloading models'}
              </span>
              <span className="text-[10px] font-mono text-amber-300 shrink-0">
                {Math.round(download.fraction * 100)}%
              </span>
            </div>
            <div className="h-1 rounded-full bg-black/40 overflow-hidden">
              <div
                className="h-full bg-amber-400 transition-[width] duration-500"
                style={{ width: `${Math.min(100, Math.max(0, download.fraction * 100))}%` }}
              />
            </div>
          </div>
          {download.remaining > 1 && (
            <span className="text-[10px] font-mono text-amber-300/60 shrink-0">
              {download.remaining} left
            </span>
          )}
        </div>
      )}

      {/* Execution Progress Bar */}
      {state === 'executing' && (
        <div className={`h-8 shrink-0 px-3 rounded-lg border text-xs font-medium whitespace-nowrap flex items-center gap-2.5 ${isDownloaderNode ? 'min-w-[360px] border-amber-500/30 bg-amber-500/10' : 'min-w-[280px] border-cyan-500/30 bg-cyan-500/10'}`}>
           {isDownloaderNode ? (
             <DownloadCloud className="w-3.5 h-3.5 text-amber-300 animate-pulse" />
           ) : (
             <Play className="w-3.5 h-3.5 text-cyan-400 animate-pulse" />
           )}
           
           <div className="flex-1 flex flex-col justify-center">
             <div className="flex justify-between items-center mb-1">
               <span
                 className={`text-[10px] uppercase font-bold tracking-wider truncate ${isDownloaderNode ? 'text-amber-200 w-52' : 'text-cyan-300 w-32'}`}
                 title={isDownloaderNode ? downloaderTitle : currentNodeName}
               >
                 {isDownloaderNode ? downloaderLabel : currentNodeName || 'Running...'}
               </span>
               <span className={`text-[9px] font-mono ${isDownloaderNode ? 'text-amber-200/80' : 'text-cyan-400/80'}`}>
                 {isDownloaderNode && downloaderDetail
                   ? `${downloaderDetail} · node ${currentNodeId}`
                   : [
                       `${progress}%`,
                       fmtDuration(elapsedMs),
                       // Below 1 s/it the useful figure is it/s, same as the
                       // sampler's own console line.
                       secondsPerStep == null
                         ? null
                         : secondsPerStep >= 1
                           ? `${secondsPerStep.toFixed(1)} s/it`
                           : `${(1 / secondsPerStep).toFixed(1)} it/s`,
                       etaMs == null ? null : `ETA ${fmtDuration(etaMs)}`,
                     ].filter(Boolean).join(' · ')}
               </span>
             </div>
             
             {/* Progress bars (Dual: Node Progress vs Overall Progress) */}
             <div className="w-full h-1 bg-black/40 rounded-full overflow-hidden relative">
                {/* Overall workflow progress (Background low opacity) */}
                <div 
                   className={`absolute top-0 left-0 h-full transition-all duration-300 ${isDownloaderNode ? 'bg-amber-700/45' : 'bg-cyan-700/50'}`}
                   style={{ width: `${overallProgress}%` }}
                />
                {/* Current Node Progress (Foreground bright) */}
                <div 
                   className={`absolute top-0 left-0 h-full transition-all duration-300 ${isDownloaderNode ? 'bg-amber-300 shadow-[0_0_8px_rgba(251,191,36,0.5)]' : 'bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.5)]'}`}
                   style={{ width: `${progress}%` }}
                />
             </div>
           </div>
        </div>
      )}

      {/* How long the last one took.
          elapsedMs is only reset when a run starts, never when it ends, so the
          figure is already sitting there when the progress pill disappears -
          it was just never shown. Pixaroma's Run Timer node keeps the same
          number inside one workflow; this keeps it for all of them, and needs
          no node in the graph. */}
      {state !== 'executing' && elapsedMs > 0 && (
        <div className="h-8 shrink-0 px-3 rounded-lg border border-white/10 bg-white/5 text-xs font-medium whitespace-nowrap flex items-center gap-2
                        text-xs text-slate-400"
             title="How long the last generation took">
          <Timer className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" />
          <span className="font-mono text-slate-300">{fmtDuration(elapsedMs)}</span>
          <span className="text-[9px] uppercase tracking-wider text-slate-600">last run</span>
        </div>
      )}

      {/* GPU VRAM pill */}
      <div className="h-8 shrink-0 px-3 rounded-lg border border-white/10 bg-white/5 text-xs font-medium whitespace-nowrap flex items-center gap-2">
        <Zap className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
        {gpu ? (
          <>
            <span className="text-slate-200 font-medium">{gpu.name}</span>
            {gpu.temp !== null && (
              <span className={`font-semibold ${gpu.temp > 80 ? 'text-red-400' : gpu.temp > 70 ? 'text-amber-400' : 'text-emerald-400'}`}>
                {gpu.temp}°C
              </span>
            )}
            <div className="flex items-center gap-1.5">
              <div className="w-14 h-1.5 bg-white/8 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-700"
                  style={{
                    width: `${gpu.pct}%`,
                    background: gpu.pct > 90
                      ? 'linear-gradient(90deg,#ef4444,#dc2626)'
                      : gpu.pct > 75
                        ? 'linear-gradient(90deg,#f59e0b,#d97706)'
                        : 'linear-gradient(90deg,#34d399,#10b981)',
                  }}
                />
              </div>
              <span className="text-slate-400 font-mono text-[11px]">{gpu.usedGiB}/{gpu.totalGiB}GB</span>
            </div>
          </>
        ) : (
          <span className="text-slate-500 text-[11px]">GPU loading…</span>
        )}
      </div>

      {/* Purge VRAM button */}
      <button
        id="purge-vram-btn"
        onClick={handlePurge}
        disabled={purging || !comfy.isConnected}
        title="Purge VRAM — unload all models"
        className={`${PILL} border-red-500/25 bg-red-500/10 text-red-300 hover:bg-red-500/18 disabled:opacity-40`}
      >
        {purging ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
        {purging ? 'Purging' : 'Purge VRAM'}
      </button>

      {/* Reset UI state (clear localStorage) button */}
      <button
        id="reset-ui-btn"
        onClick={handleResetUi}
        title="Reset UI — clear saved prompts/selections & cached page state, then reload (models, outputs and API keys are kept)"
        className={`${PILL} border-amber-500/25 bg-amber-500/10 text-amber-300 hover:bg-amber-500/18`}
      >
        <RotateCcw className="w-3.5 h-3.5" />
        Reset UI
      </button>

      {/* "Key Set" answered the wrong question: whether a string is stored,
          rather than whether Venice accepts it and what is left to spend. A key
          that has been revoked or drained looked identical to a working one. */}
      <button
        onClick={handleVeniceKey}
        disabled={veniceSaving}
        title={
          !veniceConfigured
            ? 'Save your Venice.ai API key (for Venice image + chat)'
            : veniceValid === false
              ? 'Venice rejected this key - click to replace it'
              : veniceUsd !== null
                ? `Venice balance $${veniceUsd.toFixed(2)} - click to replace the key`
                : 'Venice key saved - click to replace it'
        }
        className={`${PILL} disabled:opacity-40 ${
          !veniceConfigured || veniceValid === false
            ? 'border-amber-500/30 bg-amber-500/10 text-amber-300 hover:bg-amber-500/18'
            : veniceUsd !== null && veniceUsd < 1
              ? 'border-amber-500/30 bg-amber-500/10 text-amber-300 hover:bg-amber-500/18'
              : 'border-sky-500/30 bg-sky-500/10 text-sky-300 hover:bg-sky-500/18'
        }`}
      >
        {veniceSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <KeyRound className="w-3.5 h-3.5" />}
        {!veniceConfigured
          ? 'Venice Key Missing'
          : veniceValid === false
            ? 'Venice Key Rejected'
            : veniceUsd !== null
              ? `Venice $${veniceUsd.toFixed(2)}`
              : 'Venice Key Set'}
      </button>

      <button
        onClick={handleCivitaiKey}
        disabled={civitaiSaving}
        title="Save Civitai API key for Civitai model downloads"
        className={`${PILL} disabled:opacity-40 ${
          civitaiConfigured
            ? 'border-sky-500/30 bg-sky-500/10 text-sky-300 hover:bg-sky-500/18'
            : 'border-amber-500/30 bg-amber-500/10 text-amber-300 hover:bg-amber-500/18'
        }`}
      >
        {(civitaiSaving || civitaiLoading) ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <KeyRound className="w-3.5 h-3.5" />}
        {civitaiSaving ? 'Saving Key' : civitaiConfigured ? 'Civitai Key Set' : 'Civitai Key Missing'}
      </button>

      <button
        onClick={handleHfToken}
        disabled={hfSaving}
        title="Save Hugging Face token for gated model downloads"
        className={`${PILL} disabled:opacity-40 ${
          hfConfigured
            ? 'border-sky-500/30 bg-sky-500/10 text-sky-300 hover:bg-sky-500/18'
            : 'border-amber-500/30 bg-amber-500/10 text-amber-300 hover:bg-amber-500/18'
        }`}
      >
        {(hfSaving || hfLoading) ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <KeyRound className="w-3.5 h-3.5" />}
        {hfSaving ? 'Saving Token' : hfConfigured ? 'HF Token Set' : 'HF Token Missing'}
      </button>

      {/* ComfyUI status */}
      <div className={`${PILL} ${
        comfy.isConnected
          ? 'border-emerald-500/30 bg-emerald-500/8 text-emerald-300'
          : 'border-white/10 bg-white/5 text-slate-500'
      }`}>
        {comfy.isLoading
          ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
          : <Activity className="w-3.5 h-3.5" />
        }
        {comfyLabel}
      </div>

      {/* Ollama status */}
      <div className={`${PILL} ${
        ollama.isConnected
          ? 'border-emerald-500/30 bg-emerald-500/8 text-emerald-300'
          : 'border-white/10 bg-white/5 text-slate-500'
      }`}>
        {ollama.isLoading
          ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
          : <BrainCircuit className="w-3.5 h-3.5" />
        }
        {ollamaLabel}
      </div>

      {/* Last in the row, and away from the status pills: this one changes
          where things are written, which is a different kind of act from the
          rest of the bar. "Folders" named a noun and left the verb to guess. */}
      <button
        onClick={openFolders}
        title="Choose where models, outputs and inputs are read from and written to"
        className={`${PILL} border-white/10 bg-white/5 text-slate-300 hover:bg-white/10 hover:text-white`}
      >
        <FolderCog className="w-3.5 h-3.5" />
        Set Folder Paths
      </button>

      {foldersOpen && createPortal(
        // Into body: the header sets backdrop-blur, which makes it the
        // containing block for `fixed` and pinned this dialog to a 56px strip
        // at the top of the page with its heading cut off.
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4"
             onClick={() => setFoldersOpen(false)}>
          <div className="w-full max-w-xl rounded-2xl border border-white/10 bg-[#0b0c11] p-6 shadow-2xl"
               onClick={(e) => e.stopPropagation()}>
            <div className="mb-1 flex items-center justify-between">
              <h2 className="text-[13px] font-black uppercase tracking-[0.18em] text-white/80">Folders</h2>
              <button onClick={() => setFoldersOpen(false)} className="text-white/40 hover:text-white">
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="mb-5 text-[11px] leading-relaxed text-white/35">
              Leave a field empty to use the default. Changes apply the next time FEDDA starts.
            </p>

            {([
              ['extra_models_path', 'Extra models folder',
               'A second ComfyUI models folder to read from. FEDDA never writes here - downloads always go to its own folder.'],
              ['output_path', 'Output folder', 'Where generated images and video are saved.'],
              ['input_path', 'Input folder', 'Where uploaded source files are staged.'],
            ] as const).map(([key, label, help]) => (
              <label key={key} className="mb-4 block">
                <span className="mb-1 block text-[11px] font-semibold text-white/60">{label}</span>
                <input
                  value={(folders as any)[key] || ''}
                  onChange={(e) => setFolders({ ...folders, [key]: e.target.value })}
                  placeholder={folderDefaults[key] || 'Default'}
                  spellCheck={false}
                  className="w-full rounded-lg fedda-input px-3 py-2 font-mono text-[11px] focus:border-emerald-500/40"
                />
                <span className="mt-1 block text-[10px] leading-relaxed text-white/25">{help}</span>
              </label>
            ))}

            {folderErr && <p className="mb-3 text-[11px] text-red-300">{folderErr}</p>}
            {folderSaved && (
              <p className="mb-3 text-[11px] text-emerald-300">
                Saved. Restart FEDDA for it to take effect.
              </p>
            )}

            <div className="flex justify-end gap-2">
              <button onClick={() => setFoldersOpen(false)}
                      className="rounded-lg px-3 py-1.5 text-[12px] text-white/50 transition hover:text-white">
                Close
              </button>
              <button onClick={saveFolders} disabled={folderSaving}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500/80 px-4 py-1.5 text-[12px] font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-40">
                {folderSaving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Save
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
};
