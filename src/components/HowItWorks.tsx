const STEPS = [
  { title: 'Film a trick', detail: 'Record or upload a short clip' },
  { title: 'Analyze', detail: 'AI reviews your attempt' },
  { title: 'Get tips', detail: 'Feedback to land it next time' },
] as const;

export function HowItWorks() {
  return (
    <section aria-labelledby="how-it-works-heading" className="border-b border-line">
      <h2 id="how-it-works-heading" className="sr-only">
        How it works
      </h2>
      <ol className="grid divide-y divide-line-soft sm:grid-cols-3 sm:divide-x sm:divide-y-0 sm:divide-line">
        {STEPS.map(({ title, detail }, index) => (
          <li key={title} className="flex items-baseline gap-4 py-3.5 sm:px-7 sm:py-7 sm:first:pl-0">
            <span className="font-mono text-xs text-accent">
              <span className="sr-only">Step </span>0{index + 1}
            </span>
            <span>
              <span className="font-bold sm:block sm:text-[17px]">{title}</span>
              <span className="text-muted sm:block sm:text-[15px]">
                <span className="sm:hidden"> — </span>
                {detail}
              </span>
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}
