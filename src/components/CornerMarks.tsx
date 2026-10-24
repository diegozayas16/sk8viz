// Viewfinder-style corner brackets for a clip frame. The parent must be
// positioned; `className` sets the bracket color.
export function CornerMarks({ className = 'border-ink' }: { className?: string }) {
  const mark = `pointer-events-none absolute size-4 ${className}`;
  return (
    <span aria-hidden="true">
      <span className={`${mark} left-2.5 top-2.5 border-l-2 border-t-2`} />
      <span className={`${mark} right-2.5 top-2.5 border-r-2 border-t-2`} />
      <span className={`${mark} bottom-2.5 left-2.5 border-b-2 border-l-2`} />
      <span className={`${mark} bottom-2.5 right-2.5 border-b-2 border-r-2`} />
    </span>
  );
}
