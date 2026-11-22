import { NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import type { Tx } from '@cafm/db';
import {
  checklistAnswerProblem,
  outstandingFor,
  type Checklist,
  type ChecklistGate,
  type ChecklistItemKind,
  type WorkOrderStatus,
} from '@cafm/shared';

const answeredBy = { select: { account: { select: { name: true } } } } as const;

/** A job's checklists with their steps, in the order they were added. */
export async function readChecklists(tx: Tx, tenantId: string, workOrderId: string): Promise<Checklist[]> {
  const rows = await tx.workOrderChecklist.findMany({
    where: { tenantId, workOrderId },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    include: { items: { orderBy: { position: 'asc' }, include: { answeredBy } } },
  });
  return rows.map((list) => {
    const items = list.items.map((item) => ({
      id: item.id,
      label: item.label,
      kind: item.kind as ChecklistItemKind,
      required: item.required,
      unit: item.unit,
      answer: item.answer,
      note: item.note,
      answeredByName: item.answeredByName ?? item.answeredBy?.account.name ?? null,
      answeredAt: item.answeredAt?.toISOString() ?? null,
    }));
    return {
      id: list.id,
      title: list.title,
      gate: list.gate as ChecklistGate,
      items,
      outstanding: items.filter((item) => item.required && item.answer === null).length,
    };
  });
}

/**
 * Holds a job back until its required checklist steps are answered: going on site waits for the checklists
 * that are for before starting, and completing waits for every checklist that holds something back. Every way
 * of changing a job's status (staff, the board and a contractor's link) comes through here.
 */
export async function assertChecklistsAllow(
  tx: Tx,
  tenantId: string,
  workOrderId: string,
  from: WorkOrderStatus,
  to: WorkOrderStatus,
): Promise<void> {
  const reopening = from === 'completed' || from === 'verified';
  const move = to === 'on_site' && !reopening ? 'start' : to === 'completed' ? 'complete' : null;
  if (!move) return;
  const lists = await readChecklists(tx, tenantId, workOrderId);
  const outstanding = outstandingFor(lists, move);
  if (outstanding === 0) return;
  const steps = `${outstanding} required checklist ${outstanding === 1 ? 'step' : 'steps'}`;
  throw new UnprocessableEntityException({
    code: 'checklist_incomplete',
    message: move === 'start' ? `Answer ${steps} before starting work.` : `Answer ${steps} before completing the job.`,
  });
}

/**
 * Records, changes or clears the answer to one step. `by` is the member who answered, or the name of an outside
 * contractor who answered on a link.
 */
export async function answerChecklistItem(
  tx: Tx,
  tenantId: string,
  workOrderId: string,
  itemId: string,
  input: { answer: string | null; note?: string | null },
  by: { memberId: string } | { name: string },
) {
  const item = await tx.workOrderChecklistItem.findFirst({
    where: { id: itemId, tenantId, checklist: { workOrderId } },
    include: { checklist: { select: { id: true } } },
  });
  if (!item) throw new NotFoundException('Checklist step not found on this work order.');
  const kind = item.kind as ChecklistItemKind;
  const note = input.note?.trim() || null;
  const answer = input.answer === null || input.answer === '' ? null : input.answer;
  if (answer !== null) {
    const problem = checklistAnswerProblem(kind, answer, note);
    if (problem) throw new UnprocessableEntityException(problem);
  }
  await tx.workOrderChecklistItem.update({
    where: { id: item.id },
    data:
      answer === null
        ? { answer: null, note: null, answeredAt: null, answeredById: null, answeredByName: null }
        : {
            answer,
            note,
            answeredAt: new Date(),
            answeredById: 'memberId' in by ? by.memberId : null,
            answeredByName: 'name' in by ? by.name : null,
          },
  });
  return { item, kind, answer };
}
