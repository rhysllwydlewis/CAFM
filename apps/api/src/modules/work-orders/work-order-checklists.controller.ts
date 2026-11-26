import {
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Req,
  UnprocessableEntityException,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { withTenant, type Prisma } from '@fmstead/db';
import {
  addChecklistSchema,
  answerChecklistItemSchema,
  checklistTemplateSchema,
  MAX_CHECKLISTS_PER_JOB,
  type ChecklistGate,
  type ChecklistItemInput,
  type ChecklistTemplateItem,
} from '@fmstead/shared';
import { audit } from '../../core/audit';
import { PermissionGuard, RequireFeature, RequirePermission, SessionGuard, TenantGuard } from '../../core/auth.guards';
import { PrismaService } from '../../core/prisma.service';
import { parse } from '../../core/validation';
import { getWorkOrder } from './work-order-records';
import { answerChecklistItem, readChecklists } from './work-order-checklists';
import { withWorkOrderWrite } from './work-order-scope';

const LOCKED = ['closed', 'cancelled'];

/** Checklists on a job: the steps to follow and the answers, with some holding back starting or completing. */
@Controller('work-orders/:id/checklists')
@UseGuards(SessionGuard, TenantGuard, PermissionGuard)
@RequireFeature('work_orders')
export class WorkOrderChecklistsController {
  constructor(private readonly db: PrismaService) {}

  @Get()
  @RequirePermission('work_orders.read')
  list(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string) {
    const auth = req.auth!;
    return withTenant(this.db, auth.membership!.tenantId, async (tx) => {
      await getWorkOrder(tx, auth, id);
      return readChecklists(tx, auth.membership!.tenantId, id);
    });
  }

  /** Adds a checklist from a template, or one written out for this job. */
  @Post()
  @RequirePermission('work_orders.edit')
  add(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    const input = parse(addChecklistSchema, body);
    return withWorkOrderWrite(this.db, req.auth!, 'work_orders.edit', async (tx, auth) => {
      const tenantId = auth.membership!.tenantId;
      const job = await getWorkOrder(tx, auth, id);
      if (LOCKED.includes(job.status)) {
        throw new UnprocessableEntityException('Checklists can’t be added to a closed or cancelled work order.');
      }
      if ((await tx.workOrderChecklist.count({ where: { tenantId, workOrderId: id } })) >= MAX_CHECKLISTS_PER_JOB) {
        throw new UnprocessableEntityException('This work order already has the most checklists it can hold.');
      }
      let title: string;
      let gate: ChecklistGate;
      let items: ChecklistItemInput[];
      if ('templateId' in input) {
        const template = await tx.checklistTemplate.findFirst({
          where: { tenantId, id: input.templateId, active: true },
        });
        if (!template) throw new NotFoundException('Checklist template not found.');
        title = template.name;
        gate = template.gate as ChecklistGate;
        items = template.items as ChecklistItemInput[];
      } else {
        ({ title, gate, items } = input);
      }
      const list = await tx.workOrderChecklist.create({
        data: { tenantId, workOrderId: id, title, gate, createdById: auth.membership!.id },
      });
      await tx.workOrderChecklistItem.createMany({
        data: items.map((item, position) => ({
          tenantId,
          checklistId: list.id,
          position,
          kind: item.kind,
          label: item.label,
          required: item.required ?? false,
          unit: item.unit ?? null,
        })),
      });
      await audit(
        tx,
        auth,
        {
          action: 'work_order_checklist.add',
          entityType: 'work_order',
          entityId: id,
          changes: { checklistId: list.id, title, gate, steps: items.length, template: 'templateId' in input },
        },
        req.ip,
      );
      return readChecklists(tx, tenantId, id);
    });
  }

  @Delete(':checklistId')
  @RequirePermission('work_orders.edit')
  remove(
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('checklistId', ParseUUIDPipe) checklistId: string,
  ) {
    return withWorkOrderWrite(this.db, req.auth!, 'work_orders.edit', async (tx, auth) => {
      const tenantId = auth.membership!.tenantId;
      const job = await getWorkOrder(tx, auth, id);
      if (LOCKED.includes(job.status)) {
        throw new UnprocessableEntityException('Checklists can’t be removed from a closed or cancelled work order.');
      }
      const list = await tx.workOrderChecklist.findFirst({
        where: { tenantId, workOrderId: id, id: checklistId },
        include: { items: { select: { answer: true } } },
      });
      if (!list) throw new NotFoundException('Checklist not found on this work order.');
      await tx.workOrderChecklist.delete({ where: { id: checklistId } });
      await audit(
        tx,
        auth,
        {
          action: 'work_order_checklist.remove',
          entityType: 'work_order',
          entityId: id,
          changes: {
            checklistId,
            title: list.title,
            steps: list.items.length,
            answered: list.items.filter((item) => item.answer !== null).length,
          },
        },
        req.ip,
      );
      return readChecklists(tx, tenantId, id);
    });
  }

  /** Answers a step, or clears its answer. Whoever does the job can, as far as their scope allows. */
  @Put(':checklistId/items/:itemId')
  @RequirePermission('work_orders.read')
  answer(
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('checklistId', ParseUUIDPipe) checklistId: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Body() body: unknown,
  ) {
    const input = parse(answerChecklistItemSchema, body);
    return withWorkOrderWrite(this.db, req.auth!, ['work_orders.edit', 'work_orders.close'], async (tx, auth) => {
      const tenantId = auth.membership!.tenantId;
      const job = await getWorkOrder(tx, auth, id);
      if (LOCKED.includes(job.status)) {
        throw new UnprocessableEntityException('The checklists on a closed or cancelled work order can’t be changed.');
      }
      const belongs = await tx.workOrderChecklistItem.count({ where: { id: itemId, tenantId, checklistId } });
      if (!belongs) throw new NotFoundException('Checklist step not found on this work order.');
      const { kind, answer } = await answerChecklistItem(tx, tenantId, id, itemId, input, {
        memberId: auth.membership!.id,
      });
      await audit(
        tx,
        auth,
        {
          action: 'work_order_checklist.answer',
          entityType: 'work_order',
          entityId: id,
          changes: {
            checklistId,
            itemId,
            kind,
            answered: answer !== null,
            ...(kind === 'pass_fail' && answer ? { result: answer } : {}),
          },
        },
        req.ip,
      );
      return readChecklists(tx, tenantId, id);
    });
  }
}

const templateRow = (row: {
  id: string;
  name: string;
  description: string | null;
  gate: string;
  items: Prisma.JsonValue;
}): ChecklistTemplateItem => ({
  id: row.id,
  name: row.name,
  description: row.description,
  gate: row.gate as ChecklistGate,
  items: row.items as ChecklistItemInput[],
});

/** The organisation's reusable checklists. Anyone who can see work orders can use them; changing them is settings. */
@Controller('checklist-templates')
@UseGuards(SessionGuard, TenantGuard, PermissionGuard)
@RequireFeature('work_orders')
export class ChecklistTemplatesController {
  constructor(private readonly db: PrismaService) {}

  @Get()
  @RequirePermission('work_orders.read')
  list(@Req() req: Request) {
    const { tenantId } = req.auth!.membership!;
    return withTenant(this.db, tenantId, async (tx) =>
      (
        await tx.checklistTemplate.findMany({
          where: { tenantId, active: true },
          orderBy: [{ name: 'asc' }, { id: 'asc' }],
        })
      ).map(templateRow),
    );
  }

  @Post()
  @RequirePermission('settings.manage')
  create(@Req() req: Request, @Body() body: unknown) {
    const input = parse(checklistTemplateSchema, body);
    const { tenantId } = req.auth!.membership!;
    return withTenant(this.db, tenantId, async (tx) => {
      const clash = await tx.checklistTemplate.findFirst({ where: { tenantId, name: input.title } });
      if (clash) throw new ConflictException('A checklist template with that name already exists.');
      const row = await tx.checklistTemplate.create({
        data: {
          tenantId,
          name: input.title,
          description: input.description ?? null,
          gate: input.gate,
          items: input.items as unknown as Prisma.InputJsonValue,
        },
      });
      await audit(
        tx,
        req.auth!,
        {
          action: 'checklist_template.create',
          entityType: 'checklist_template',
          entityId: row.id,
          changes: { name: row.name, gate: row.gate, steps: input.items.length },
        },
        req.ip,
      );
      return templateRow(row);
    });
  }

  /** Templates are retired, not deleted, so a job's record always has its source. Jobs keep their own copy. */
  @Delete(':templateId')
  @RequirePermission('settings.manage')
  retire(@Req() req: Request, @Param('templateId', ParseUUIDPipe) templateId: string) {
    const { tenantId } = req.auth!.membership!;
    return withTenant(this.db, tenantId, async (tx) => {
      const row = await tx.checklistTemplate.findFirst({ where: { tenantId, id: templateId, active: true } });
      if (!row) throw new NotFoundException('Checklist template not found.');
      // The name is released so a replacement can reuse it. The suffix is unique to the template and always fits.
      const suffix = ` (retired ${templateId.slice(-8)})`;
      await tx.checklistTemplate.update({
        where: { id: templateId },
        data: { active: false, name: row.name.slice(0, 120 - suffix.length) + suffix },
      });
      await audit(
        tx,
        req.auth!,
        {
          action: 'checklist_template.retire',
          entityType: 'checklist_template',
          entityId: templateId,
          changes: { name: row.name },
        },
        req.ip,
      );
      return { ok: true };
    });
  }
}
