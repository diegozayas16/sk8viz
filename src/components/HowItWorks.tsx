import { Lightbulb, Sparkles, Video } from 'lucide-react';

const STEPS = [
  { Icon: Video, title: 'Film a trick', detail: 'Record or upload a short clip' },
  { Icon: Sparkles, title: 'Analyze', detail: 'AI reviews your attempt' },
  { Icon: Lightbulb, title: 'Get tips', detail: 'Feedback to land it next time' },
] as const;

export function HowItWorks() {
  return (
    <section aria-labelledby="how-it-works-heading">
      <h2 id="how-it-works-heading" className="sr-only">
        How it works
      </h2>
      <ol className="grid grid-cols-3 gap-2">
        {STEPS.map(({ Icon, title, detail }, index) => (
          <li key={title} className="rounded-xl bg-zinc-900 p-3">
            <span className="flex items-center gap-1.5 text-sm font-semibold">
              <Icon aria-hidden="true" className="size-4 shrink-0 text-lime-400" />
              <span>
                <span className="sr-only">Step {index + 1}: </span>
                {title}
              </span>
            </span>
            <span className="mt-1 block text-xs leading-snug text-zinc-400">{detail}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
