// Pure running-head token resolver. Substitutes the three book-data tokens and
// leaves anything else literal, so an unrecognized token is harmless text
// rather than an error. Header text is book data (title/author/chapter), not
// product copy, so it is exempt from the copy sweep.

export interface RunningHeadContext {
  title: string;
  author: string;
  chapter: string;
}

export function resolveRunningHead(template: string, ctx: RunningHeadContext): string {
  return template
    .split("{title}")
    .join(ctx.title)
    .split("{author}")
    .join(ctx.author)
    .split("{chapter}")
    .join(ctx.chapter);
}
