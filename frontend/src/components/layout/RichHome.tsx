import { ArrowRight, Construction, Sparkles, Star } from 'lucide-react';
import { useModules } from '../../contexts/ModuleContext';
import { EDITORS_CHOICE, type FeddaModule } from '../../modules/registry';
import { HFTokenReminder } from '../ui/HFTokenReminder';

/*
 * The home screen fits one viewport, at any resolution.
 *
 * It could not before, and the reason was structural rather than a matter of
 * tuning: every card declared an aspect ratio. `aspect-[3/2]` derives height
 * from width, so two rows of cards plus a banner add up to whatever the window
 * is wide - which on a 1920 screen is far more than 1080 tall. No amount of
 * adjusting gaps fixes an arithmetic that does not involve the viewport.
 *
 * Those ratios were there to stop `object-cover` cropping the poster art. The
 * art is gone - all fourteen home modules define no poster - so the ratios were
 * defending nothing while breaking the layout. Height comes from flex weights
 * now, and the rows share whatever the window has.
 *
 * `min-h-0` on every flexible child is what makes that work: a flex item's
 * default `min-height: auto` refuses to shrink below its content, which silently
 * reintroduces the overflow this is meant to remove.
 *
 * Type scales with `clamp()` against viewport height rather than sitting at a
 * fixed pixel size, so a short window compresses the text along with the boxes
 * instead of overflowing them.
 */

const ROW_LABEL =
  'text-[clamp(8px,1.05vh,10px)] font-semibold uppercase tracking-[0.22em] text-white/35';

/**
 * The chat agent gets its own slab rather than a tile in the grid. It is the one
 * entry point that is not a workflow - it can reach any of them - so making it
 * look like a peer of "Gallery" would undersell it.
 */
function ChatBanner({ module, onSelect }: { module: FeddaModule; onSelect: (id: string) => void }) {
  const Icon = module.Icon;
  return (
    <button
      type="button"
      onClick={() => onSelect(module.defaultTab)}
      aria-label={module.label}
      className="group relative min-h-0 w-full flex-[1.5] overflow-hidden rounded-2xl border
                 border-cyan-400/25 bg-[#08090d] text-left transition-all
                 hover:-translate-y-0.5 hover:border-cyan-300/50"
    >
      <div className="absolute inset-0 bg-gradient-to-r from-cyan-500/[0.07] via-transparent to-transparent" />
      <div className="relative flex h-full max-w-[52%] flex-col justify-center gap-[0.6vh] px-[2.2vw]">
        <div className="flex items-center gap-2">
          <div className="flex h-[clamp(20px,3vh,30px)] w-[clamp(20px,3vh,30px)] items-center
                          justify-center rounded-xl border border-cyan-400/30 bg-cyan-500/10">
            <Icon className="h-[clamp(10px,1.5vh,15px)] w-[clamp(10px,1.5vh,15px)] text-cyan-300" />
          </div>
          <span className="rounded-md bg-cyan-500/20 px-1.5 py-0.5 text-[clamp(7px,0.95vh,9px)]
                           font-bold uppercase tracking-[0.14em] text-cyan-200">
            Preview
          </span>
        </div>
        <p className="text-[clamp(14px,2.4vh,22px)] font-bold leading-tight tracking-tight text-zinc-50">
          {module.label}
        </p>
        <p className="line-clamp-2 text-[clamp(9px,1.35vh,12px)] leading-snug text-white/55">
          {module.description}
        </p>
        <span className="inline-flex items-center gap-1.5 text-[clamp(8px,1.2vh,11px)] font-semibold text-cyan-300">
          Open it
          <ArrowRight className="h-3 w-3 transition group-hover:translate-x-0.5" />
        </span>
      </div>
    </button>
  );
}

/**
 * A curated card. Brighter border and a star, so the row reads as a
 * recommendation rather than just the first row of the grid.
 */
function ChoiceCard({ module, onSelect }: { module: FeddaModule; onSelect: (id: string) => void }) {
  const Icon = module.Icon;
  return (
    <button
      type="button"
      onClick={() => onSelect(module.defaultTab)}
      aria-label={module.label}
      className="group relative min-h-0 overflow-hidden rounded-xl border border-amber-400/25
                 bg-[#0a0a0d] transition-all hover:-translate-y-0.5 hover:border-amber-300/55"
    >
      <div className="absolute inset-0 bg-gradient-to-b from-amber-400/[0.06] to-transparent
                      transition-opacity duration-500 group-hover:opacity-0" />
      <Star className="absolute right-2 top-2 h-3 w-3 fill-amber-300/70 text-amber-300/70" />
      <div className="relative flex h-full flex-col items-center justify-center gap-[0.8vh] p-[1.4vh] text-center">
        <div className="flex h-[clamp(24px,3.4vh,38px)] w-[clamp(24px,3.4vh,38px)] items-center
                        justify-center rounded-xl border border-amber-400/25 bg-amber-400/[0.06]
                        transition-all duration-300 group-hover:-translate-y-0.5 group-hover:border-amber-300/50">
          <Icon className="h-[clamp(11px,1.7vh,18px)] w-[clamp(11px,1.7vh,18px)] text-amber-200/70
                           transition-colors group-hover:text-amber-100" />
        </div>
        <p className="text-[clamp(9px,1.35vh,13px)] font-black uppercase leading-tight
                      tracking-[0.16em] text-white/85 transition-colors group-hover:text-white">
          {module.label}
        </p>
        <p className="line-clamp-2 max-w-[24ch] text-[clamp(8px,1.1vh,10px)] leading-snug
                      text-white/30 transition-colors group-hover:text-white/50">
          {module.description}
        </p>
      </div>
    </button>
  );
}

/**
 * An ordinary card. Everything is centred - icon, title, description - because
 * a grid of cards with nothing but type in them reads as a grid only if the
 * type agrees on where it sits.
 */
function HomeCard({ module, onSelect }: { module: FeddaModule; onSelect: (id: string) => void }) {
  const Icon = module.Icon;
  return (
    <button
      type="button"
      onClick={() => onSelect(module.defaultTab)}
      aria-label={module.label}
      className="group relative min-h-0 overflow-hidden rounded-lg border border-white/10
                 bg-[#08090d] transition-all hover:-translate-y-0.5 hover:border-white/25"
    >
      <div className="absolute inset-0 bg-gradient-to-br from-white/[0.055] via-transparent
                      to-transparent transition-opacity duration-500 group-hover:opacity-0" />
      <div className="absolute inset-0 bg-gradient-to-tl from-white/[0.07] via-transparent
                      to-transparent opacity-0 transition-opacity duration-500 group-hover:opacity-100" />
      <div className="relative flex h-full flex-col items-center justify-center gap-[0.8vh] p-[1.3vh] text-center">
        <div className="flex h-[clamp(22px,3.2vh,36px)] w-[clamp(22px,3.2vh,36px)] items-center
                        justify-center rounded-xl border border-white/10 bg-white/[0.04]
                        transition-all duration-300 group-hover:-translate-y-0.5
                        group-hover:border-white/25 group-hover:bg-white/[0.08]">
          <Icon className="h-[clamp(11px,1.6vh,17px)] w-[clamp(11px,1.6vh,17px)] text-white/45
                           transition-colors group-hover:text-white/85" />
        </div>
        <p className="text-[clamp(9px,1.3vh,13px)] font-black uppercase leading-tight
                      tracking-[0.18em] text-white/75 transition-colors group-hover:text-white">
          {module.label}
        </p>
        <p className="line-clamp-2 max-w-[26ch] text-[clamp(7px,1.05vh,10px)] leading-snug
                      text-white/25 transition-colors group-hover:text-white/45">
          {module.description}
        </p>
      </div>
    </button>
  );
}

/** Landscape card for the Automations row, or a "coming soon" placeholder. */
function AutomationCard({ module, onSelect }: { module?: FeddaModule; onSelect: (id: string) => void }) {
  if (!module) {
    return (
      <div className="relative min-h-0 overflow-hidden rounded-xl border border-dashed
                      border-white/10 bg-gradient-to-b from-white/[0.04] to-transparent">
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-[0.7vh] p-3 text-center">
          <Sparkles className="h-[clamp(12px,1.8vh,18px)] w-[clamp(12px,1.8vh,18px)] text-white/25" />
          <span className="text-[clamp(7px,1vh,10px)] font-semibold uppercase tracking-[0.2em] text-white/30">
            Coming soon
          </span>
        </div>
      </div>
    );
  }
  const Icon = module.Icon;
  return (
    <button
      type="button"
      onClick={() => onSelect(module.defaultTab)}
      aria-label={module.label}
      className="group relative min-h-0 overflow-hidden rounded-xl border border-violet-500/25
                 bg-[#08090d] transition-all hover:-translate-y-0.5 hover:border-violet-400/50"
    >
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-[0.7vh] p-3 text-center">
        <Icon className="h-[clamp(12px,1.8vh,18px)] w-[clamp(12px,1.8vh,18px)] text-white/45" />
        <p className="text-[clamp(8px,1.15vh,11px)] font-black uppercase leading-tight
                      tracking-[0.16em] text-white/70 transition group-hover:text-white">
          {module.label}
        </p>
      </div>
      <span className="absolute left-2 top-2 rounded-md bg-violet-500/80 px-1.5 py-0.5
                       text-[clamp(6px,0.85vh,9px)] font-bold uppercase tracking-wider text-white">
        Automation
      </span>
      {module.wip ? (
        <span className="absolute right-2 top-2 flex items-center gap-1 rounded-md bg-amber-500/90
                         px-1.5 py-0.5 text-[clamp(6px,0.85vh,9px)] font-bold uppercase
                         tracking-wider text-black">
          <Construction className="h-2.5 w-2.5" />
          WIP
        </span>
      ) : null}
    </button>
  );
}

interface RichHomeProps {
  onSelect: (id: string) => void;
}

export const RichHome = ({ onSelect }: RichHomeProps) => {
  const { availableModules } = useModules();

  const byId = new Map(availableModules.map((m) => [m.id, m]));
  // Order comes from the list, not from the registry, and an id that no longer
  // resolves is dropped rather than rendered as a hole.
  const choice = EDITORS_CHOICE.map((id) => byId.get(id)).filter(
    (m): m is FeddaModule => Boolean(m) && !m!.hidden,
  );
  const chosen = new Set(choice.map((m) => m.id));

  const allCards = availableModules.filter(
    (m) => (m.area === 'home' || m.area === 'system') && !m.hidden && !chosen.has(m.id),
  );
  const chat = allCards.find((m) => m.id === 'chat-edit');
  const cards = allCards.filter((m) => m.id !== 'chat-edit');
  const topCards = cards.slice(0, 2);
  const bottomCards = cards.slice(2);

  const automations = availableModules.filter((m) => m.area === 'automation' && !m.hidden);
  const automationSlots: (FeddaModule | undefined)[] = [...automations, undefined, undefined].slice(0, 2);

  // Column counts are set inline rather than through Tailwind classes: the
  // count is only known at runtime, and Tailwind reads source text, so a class
  // assembled from a variable is never emitted. A style attribute always is.
  const cols = (n: number) => ({ gridTemplateColumns: `repeat(${Math.max(n, 1)}, minmax(0, 1fr))` });
  const bottomCols = Math.min(Math.max(bottomCards.length, 1), 6);

  return (
    <div className="flex h-full flex-col overflow-hidden bg-[#050506]">
      <div className="mx-auto flex h-full w-full max-w-7xl flex-col gap-[1.1vh] px-5 py-[1.4vh]">
        <div className="shrink-0 empty:hidden">
          <HFTokenReminder />
        </div>

        {choice.length > 0 && (
          <section className="flex min-h-0 flex-[2.4] flex-col gap-[0.7vh]">
            <div className="flex shrink-0 items-center gap-1.5">
              <Star className="h-3 w-3 fill-amber-300/70 text-amber-300/70" />
              <p className={ROW_LABEL}>Editor&rsquo;s choice</p>
            </div>
            <div className="grid min-h-0 flex-1 gap-[0.9vw]" style={cols(choice.length)}>
              {choice.map((m) => (
                <ChoiceCard key={m.id} module={m} onSelect={onSelect} />
              ))}
            </div>
          </section>
        )}

        {chat && <ChatBanner module={chat} onSelect={onSelect} />}

        {topCards.length > 0 && (
          <div className="grid min-h-0 flex-[1.5] gap-[0.9vw]" style={cols(topCards.length)}>
            {topCards.map((m) => (
              <HomeCard key={m.id} module={m} onSelect={onSelect} />
            ))}
          </div>
        )}

        {automations.length > 0 && (
          <section className="flex min-h-0 flex-[1.15] flex-col gap-[0.7vh]">
            <p className={`shrink-0 ${ROW_LABEL}`}>Automations</p>
            <div className="grid min-h-0 flex-1 gap-[0.9vw]" style={cols(2)}>
              {automationSlots.map((m, i) => (
                <AutomationCard key={m?.id ?? `soon-${i}`} module={m} onSelect={onSelect} />
              ))}
            </div>
          </section>
        )}

        {bottomCards.length > 0 && (
          <div
            className="grid min-h-0 flex-[2] auto-rows-fr gap-[0.9vw]"
            style={cols(bottomCols)}
          >
            {bottomCards.map((m) => (
              <HomeCard key={m.id} module={m} onSelect={onSelect} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
