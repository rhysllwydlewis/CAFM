import { z } from 'zod';

const shortText = (max: number) => z.string().trim().min(1).max(max);

/* Checklists ----------------------------------------------------------------------------------------------- */

export const CHECKLIST_ITEM_KINDS = ['tick', 'pass_fail', 'number', 'text'] as const;
export type ChecklistItemKind = (typeof CHECKLIST_ITEM_KINDS)[number];
export const CHECKLIST_ITEM_KIND_LABELS: Record<ChecklistItemKind, string> = {
  tick: 'Done',
  pass_fail: 'Pass or fail',
  number: 'Reading',
  text: 'Comment',
};

/** What a checklist holds back: `start` blocks going on site, `completion` blocks completing the job. */
export const CHECKLIST_GATES = ['none', 'start', 'completion'] as const;
export type ChecklistGate = (typeof CHECKLIST_GATES)[number];
export const CHECKLIST_GATE_LABELS: Record<ChecklistGate, string> = {
  none: 'Nothing is held back',
  start: 'Before starting work',
  completion: 'Before completing the job',
};

export const PASS_FAIL_ANSWERS = ['pass', 'fail', 'na'] as const;
export const PASS_FAIL_LABELS: Record<(typeof PASS_FAIL_ANSWERS)[number], string> = {
  pass: 'Pass',
  fail: 'Fail',
  na: 'Not applicable',
};

export const MAX_CHECKLISTS_PER_JOB = 10;
export const MAX_CHECKLIST_ITEMS = 50;
export const MAX_ANSWER_LENGTH = 500;

export const checklistItemInputSchema = z
  .object({
    label: shortText(200),
    kind: z.enum(CHECKLIST_ITEM_KINDS),
    required: z.boolean().default(false),
    unit: shortText(20).optional(),
  })
  .strict()
  .refine((item) => item.kind === 'number' || item.unit === undefined, {
    message: 'Only a reading has a unit.',
    path: ['unit'],
  });
export type ChecklistItemInput = z.infer<typeof checklistItemInputSchema>;

const checklistBody = {
  title: shortText(120),
  gate: z.enum(CHECKLIST_GATES).default('none'),
  items: z.array(checklistItemInputSchema).min(1).max(MAX_CHECKLIST_ITEMS),
};

/** A checklist for one job: from a template, or written out. */
export const addChecklistSchema = z.union([
  z.object({ templateId: z.string().uuid() }).strict(),
  z.object(checklistBody).strict(),
]);

export const checklistTemplateSchema = z.object({ ...checklistBody, description: shortText(300).optional() }).strict();
export type ChecklistTemplateInput = z.infer<typeof checklistTemplateSchema>;

export const answerChecklistItemSchema = z
  .object({
    answer: z.string().trim().max(MAX_ANSWER_LENGTH).nullable(),
    note: z.string().trim().max(500).nullable().optional(),
  })
  .strict();

/** A reading is a plain decimal: up to 9 digits and 3 decimal places, optionally negative. */
export const NUMBER_ANSWER = /^-?\d{1,9}(\.\d{1,3})?$/;

/** The reason an answer isn't valid for an item of this kind, or null when it is. */
export function checklistAnswerProblem(kind: ChecklistItemKind, answer: string, note: string | null): string | null {
  if (kind === 'tick' && answer !== 'done') return 'Tick the step or clear it.';
  if (kind === 'pass_fail') {
    if (!(PASS_FAIL_ANSWERS as readonly string[]).includes(answer)) return 'Choose pass, fail or not applicable.';
    if (answer === 'fail' && !note) return 'Say what failed.';
  }
  if (kind === 'number' && !NUMBER_ANSWER.test(answer)) return 'Enter a number, for example 1.4.';
  if (kind === 'text' && !answer) return 'Enter a comment or clear it.';
  return null;
}

export type ChecklistItem = {
  id: string;
  label: string;
  kind: ChecklistItemKind;
  required: boolean;
  unit: string | null;
  answer: string | null;
  note: string | null;
  answeredByName: string | null;
  answeredAt: string | null;
};
export type Checklist = {
  id: string;
  title: string;
  gate: ChecklistGate;
  items: ChecklistItem[];
  /** Required steps still to answer. */
  outstanding: number;
};
export type ChecklistTemplateItem = {
  id: string;
  name: string;
  description: string | null;
  gate: ChecklistGate;
  items: ChecklistItemInput[];
};

/** How many required steps are unanswered, for checklists that hold back the given move. */
export function outstandingFor(
  lists: readonly { gate: ChecklistGate; items: readonly { required: boolean; answer: string | null }[] }[],
  move: 'start' | 'complete',
): number {
  return lists
    .filter((list) => (move === 'start' ? list.gate === 'start' : list.gate !== 'none'))
    .reduce((total, list) => total + list.items.filter((item) => item.required && item.answer === null).length, 0);
}

/* Photos ---------------------------------------------------------------------------------------------------- */

export const PHOTO_PHASES = ['before', 'after', 'other'] as const;
export type PhotoPhase = (typeof PHOTO_PHASES)[number];
export const PHOTO_PHASE_LABELS: Record<PhotoPhase, string> = {
  before: 'Before',
  after: 'After',
  other: 'Other',
};
export const uploadPhotoQuerySchema = z
  .object({ phase: z.enum(PHOTO_PHASES).default('other'), caption: z.string().trim().max(150).optional() })
  .strict();

export type WorkOrderPhoto = {
  id: string;
  filename: string;
  phase: PhotoPhase;
  caption: string | null;
  byteLength: number;
  createdAt: string;
};

/* Signatures ------------------------------------------------------------------------------------------------ */

export const SIGNATURE_ROLES = ['customer', 'technician'] as const;
export type SignatureRole = (typeof SIGNATURE_ROLES)[number];
export const SIGNATURE_ROLE_LABELS: Record<SignatureRole, string> = {
  customer: 'Customer sign-off',
  technician: 'Technician sign-off',
};
/** A signature is a small drawing: a PNG up to this many bytes once decoded, which fits the API's request size limit. */
export const SIGNATURE_MAX_BYTES = 60 * 1024;
export const SIGNATURE_STATUSES = ['on_site', 'completed', 'verified'] as const;

/** A signature arrives as a `data:image/png;base64,` URL, as a drawing pad produces it. */
export const SIGNATURE_DATA_URL = /^data:image\/png;base64,([A-Za-z0-9+/]+={0,2})$/;

export const addSignatureSchema = z
  .object({
    role: z.enum(SIGNATURE_ROLES),
    /** Taken from the signed-in technician; the customer's name is typed in. */
    signerName: shortText(100).optional(),
    image: z.string().max(Math.ceil((SIGNATURE_MAX_BYTES * 4) / 3) + 64),
  })
  .strict();

export type WorkOrderSignature = {
  id: string;
  role: SignatureRole;
  signerName: string;
  signedAt: string;
  recordedByName: string | null;
};

/* Job sheet ------------------------------------------------------------------------------------------------- */

export const JOB_SHEET_STATUSES = ['completed', 'verified', 'closed'] as const;
