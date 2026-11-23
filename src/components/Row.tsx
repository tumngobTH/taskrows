import { useDroppable } from "@dnd-kit/core";
import { SortableContext, horizontalListSortingStrategy } from "@dnd-kit/sortable";
import { useTaskStore } from "../store/store";
import { RowIdContext, rowDndId, slotDndId, type DndData } from "../dnd/BoardDnd";
import ListColumn from "./ListColumn";
import RowMenu from "./RowMenu";
import type { Row as RowT } from "../types";

export default function Row({ row }: { row: RowT }) {
  const groups = useTaskStore((s) => s.groups);
  const data: DndData = { type: "row", rowId: row.id };
  const { setNodeRef } = useDroppable({ id: rowDndId(row.id), data });
  return (
    <section className="row" data-row-id={row.id} style={{ flex: `${row.heightFraction} 1 0` }}>
      <RowIdContext.Provider value={row.id}>
        <SortableContext items={row.slots.map(slotDndId)} strategy={horizontalListSortingStrategy}>
          <div className="row-lists" ref={setNodeRef}>
            {row.slots.map((k) => {
              const group = groups.find((g) => g.key === k);
              return group ? <ListColumn key={k} group={group} /> : null;
            })}
            <div className="row-menu">
              <RowMenu rowId={row.id} />
            </div>
          </div>
        </SortableContext>
      </RowIdContext.Provider>
    </section>
  );
}
