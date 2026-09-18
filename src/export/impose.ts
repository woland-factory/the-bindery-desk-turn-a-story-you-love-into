import { PAGES_PER_SHEET, SHEETS_PER_SIGNATURE } from "../engine/budget";

// Pure saddle-stitch imposition. Maps a page count to a sheet-by-sheet plan
// that folds into reading order, with configurable sheets-per-signature and a
// duplex flip. No pdf-lib, no clocks, no randomness: the same inputs always
// yield the same plan. The arithmetic is verified against hand-computed 8-page
// and 16-page orderings in impose.test.ts and against a physical fold.

export type DuplexFlip = "long-edge" | "short-edge";

export interface ImpositionOptions {
  /** Sheets nested in one signature. The last signature may hold fewer. */
  sheetsPerSignature: number;
  flip: DuplexFlip;
}

export const DEFAULT_IMPOSITION: ImpositionOptions = {
  sheetsPerSignature: SHEETS_PER_SIGNATURE,
  flip: "long-edge",
};

/** Whole-sheet options offered in the print-setup control. */
export const SHEETS_PER_SIGNATURE_OPTIONS = [1, 2, 4, 6, 8] as const;

/** One half of a printed sheet side. `source` is a 1-based typeset page. */
export interface PlacedPage {
  /** 1-based page within `paddedPageCount`; null is an intentional blank. */
  source: number | null;
  rotation: 0 | 180;
}

/** One printed side: two trim pages, left and right. */
export interface SheetSide {
  left: PlacedPage;
  right: PlacedPage;
}

export interface ImpositionPlan {
  /** Print order. Within a signature: front, back, front, back... */
  sides: SheetSide[];
  /** `pageCount` rounded up to a whole number of sheets (a multiple of 4). */
  paddedPageCount: number;
  signatureCount: number;
}

/**
 * Build the imposition plan for a book of `pageCount` pages. Rounds up to whole
 * sheets, splits into signatures of `sheetsPerSignature` sheets (the last one
 * taking the remainder), and orders each signature's sides for saddle stitch.
 * On short-edge duplex the back sides are rotated 180 and their two pages swap.
 */
export function imposeBook(pageCount: number, options: ImpositionOptions): ImpositionPlan {
  const sheetsPerSignature = Math.max(1, Math.floor(options.sheetsPerSignature));
  const shortEdge = options.flip === "short-edge";

  const totalSheets = Math.max(1, Math.ceil(Math.max(0, pageCount) / PAGES_PER_SHEET));
  const paddedPageCount = totalSheets * PAGES_PER_SHEET;
  const pagesPerSignature = sheetsPerSignature * PAGES_PER_SHEET;

  const sides: SheetSide[] = [];
  let signatureCount = 0;
  let start = 0; // pages already placed in earlier signatures

  while (start < paddedPageCount) {
    const n = Math.min(pagesPerSignature, paddedPageCount - start);
    signatureCount++;
    const sheetsInSig = n / PAGES_PER_SHEET;
    for (let k = 0; k < sheetsInSig; k++) {
      // Local (1..n) positions for this sheet in the signature.
      const frontLeft = n - 2 * k;
      const frontRight = 1 + 2 * k;
      const backLeft = 2 + 2 * k;
      const backRight = n - 1 - 2 * k;

      // Front side is never rotated.
      sides.push({
        left: { source: start + frontLeft, rotation: 0 },
        right: { source: start + frontRight, rotation: 0 },
      });

      // Back side: long edge keeps the reverse upright; short edge flips it,
      // which rotates each page 180 and exchanges left and right.
      if (shortEdge) {
        sides.push({
          left: { source: start + backRight, rotation: 180 },
          right: { source: start + backLeft, rotation: 180 },
        });
      } else {
        sides.push({
          left: { source: start + backLeft, rotation: 0 },
          right: { source: start + backRight, rotation: 0 },
        });
      }
    }
    start += n;
  }

  return { sides, paddedPageCount, signatureCount };
}
