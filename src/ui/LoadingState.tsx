interface Props {
  name: string;
}

/**
 * Layout-stable loading surface. Holds the same shape the structure view
 * will fill, so the page never collapses to white or jumps when content
 * arrives.
 */
export function LoadingState({ name }: Props) {
  return (
    <section className="surface" aria-live="polite" aria-busy="true">
      <h1 className="surface__heading">Reading your book</h1>
      {name !== "sample" && <p className="surface__body surface__body--muted">{name}</p>}
      <div className="skeleton" data-testid="loading-skeleton" aria-hidden="true">
        <div className="skeleton__line skeleton__line--title" />
        <div className="skeleton__line skeleton__line--wide" />
        <div className="skeleton__list">
          <div className="skeleton__line" />
          <div className="skeleton__line" />
          <div className="skeleton__line" />
          <div className="skeleton__line" />
        </div>
      </div>
    </section>
  );
}
