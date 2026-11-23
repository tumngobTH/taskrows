import type { AccountId, Group, Layout, Row, SlotKey, TaskList } from "../types";
import { listKey, mergedKey, normaliseName } from "../lib/ids";

export function resolveGroups(lists: TaskList[], mergeSameName: boolean): Group[] {
  const byName = new Map<string, TaskList[]>();
  if (mergeSameName) {
    for (const l of lists) {
      const n = normaliseName(l.title);
      byName.set(n, [...(byName.get(n) ?? []), l]);
    }
  }
  const groups: Group[] = [];
  const emitted = new Set<string>();
  for (const l of lists) {
    const n = normaliseName(l.title);
    const same = byName.get(n) ?? [];
    if (mergeSameName && new Set(same.map((m) => m.accountId)).size >= 2) {
      if (emitted.has(n)) continue;
      emitted.add(n);
      groups.push({
        key: mergedKey(l.title),
        title: same[0].title,
        members: same.map((m) => listKey(m.accountId, m.id)),
        accountIds: same.map((m) => m.accountId),
      });
    } else {
      groups.push({
        key: listKey(l.accountId, l.id),
        title: l.title,
        members: [listKey(l.accountId, l.id)],
        accountIds: [l.accountId],
      });
    }
  }
  return groups;
}

export function emptyLayout(): Layout {
  return { rows: [{ id: "r1", heightFraction: 1, slots: [] }], newTaskTarget: {} };
}

export function reconcileLayout(layout: Layout, groups: Group[]): Layout {
  const valid = new Set<SlotKey>(groups.map((g) => g.key));
  const rows: Row[] = layout.rows.length
    ? layout.rows.map((r) => ({ ...r, slots: r.slots.filter((s) => valid.has(s)) }))
    : [{ id: "r1", heightFraction: 1, slots: [] }];
  const placed = new Set<SlotKey>(rows.flatMap((r) => r.slots));
  const missing = groups.map((g) => g.key).filter((k) => !placed.has(k));
  rows[0] = { ...rows[0], slots: [...rows[0].slots, ...missing] };
  const newTaskTarget: Record<SlotKey, AccountId> = {};
  for (const [k, v] of Object.entries(layout.newTaskTarget)) if (valid.has(k)) newTaskTarget[k] = v;
  return { rows, newTaskTarget };
}

function equalHeights(rows: Row[]): Row[] {
  return rows.map((r) => ({ ...r, heightFraction: 1 / rows.length }));
}

export function addRow(layout: Layout): Layout {
  const ids = new Set(layout.rows.map((r) => r.id));
  let n = layout.rows.length + 1;
  while (ids.has(`r${n}`)) n++;
  const rows = equalHeights([...layout.rows, { id: `r${n}`, heightFraction: 0, slots: [] }]);
  return { ...layout, rows };
}

export function removeRow(layout: Layout, rowId: string): Layout {
  const idx = layout.rows.findIndex((r) => r.id === rowId);
  if (layout.rows.length <= 1 || idx < 0) return layout;
  const removed = layout.rows[idx];
  const rest = layout.rows.filter((_, i) => i !== idx);
  const targetIdx = idx > 0 ? idx - 1 : 0;
  rest[targetIdx] = { ...rest[targetIdx], slots: [...rest[targetIdx].slots, ...removed.slots] };
  return { ...layout, rows: equalHeights(rest) };
}

export function moveSlot(layout: Layout, slotKey: SlotKey, toRowId: string, toIndex: number): Layout {
  if (!layout.rows.some((r) => r.id === toRowId)) return layout;
  const stripped = layout.rows.map((r) => ({ ...r, slots: r.slots.filter((s) => s !== slotKey) }));
  const rows = stripped.map((r) => {
    if (r.id !== toRowId) return r;
    const i = Math.max(0, Math.min(toIndex, r.slots.length));
    return { ...r, slots: [...r.slots.slice(0, i), slotKey, ...r.slots.slice(i)] };
  });
  return { ...layout, rows };
}

export function setRowHeights(layout: Layout, fractions: number[]): Layout {
  if (fractions.length !== layout.rows.length) return layout;
  const sum = fractions.reduce((a, b) => a + b, 0);
  if (Math.abs(sum - 1) > 0.001) return layout;
  return { ...layout, rows: layout.rows.map((r, i) => ({ ...r, heightFraction: fractions[i] })) };
}

export function setNewTaskTarget(layout: Layout, slotKey: SlotKey, accountId: AccountId): Layout {
  return { ...layout, newTaskTarget: { ...layout.newTaskTarget, [slotKey]: accountId } };
}

export function targetAccount(layout: Layout, group: Group): AccountId {
  const t = layout.newTaskTarget[group.key];
  return t !== undefined && group.accountIds.includes(t) ? t : group.accountIds[0];
}

