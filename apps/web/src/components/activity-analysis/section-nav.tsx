import { m } from '@/paraglide/messages';

export interface ActivitySection {
  id: string;
  label: string;
}

/**
 * Jump links to the parts of a long activity view, which a phone shows one
 * under the other.
 */
export function ActivitySectionNav({
  sections,
}: {
  sections: ActivitySection[];
}) {
  if (sections.length < 3) return null;
  return (
    <nav
      aria-label={m.activity_sections()}
      className="col-span-2 -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1"
      data-activity-sections
    >
      {sections.map((section) => (
        <button
          key={section.id}
          type="button"
          className="min-h-9 shrink-0 rounded-full border px-3 text-xs hover:bg-secondary"
          onClick={() =>
            document
              .getElementById(section.id)
              ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
          }
        >
          {section.label}
        </button>
      ))}
    </nav>
  );
}

/** Where a section starts, taking no room in the grid around it */
export function SectionAnchor({ id }: { id: string }) {
  return <span id={id} aria-hidden className="col-span-2 -mb-4 scroll-mt-4" />;
}
