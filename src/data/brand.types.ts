// A company's letterhead and the brand a job shows (migration 0110).

/** The letterhead lines of a company, as Settings > Company edits them; version 0 before there is one. */
export interface Letterhead {
  version: number;
  print_name: string;
  address: string;
  phone: string;
  website: string;
}

export type LetterheadField = Exclude<keyof Letterhead, 'version'>;

/** The company a job shows in its top bar, and a fresh short-lived URL of its logo (null when it has none). */
export interface JobBrand {
  orgId: string;
  name: string;
  logoUrl: string | null;
}

/** A company the job's manager may pick as the job's brand. */
export interface BrandChoice {
  org_id: string;
  name: string;
}
