import { useTaskStore } from "../store/store";
import ListColumn from "./ListColumn";
import type { Row as RowT } from "../types";

export default function Row({ row }: { row: RowT }) {
  const groups = useTaskStore((s) => s.groups);
  return (
    <section className="row" data-row-id={row.id} style={{ flex: `${row.heightFraction} 1 0` }}>
      <div className="row-lists">
        {row.slots.map((k) => {
          const group = groups.find((g) => g.key === k);
          return group ? <ListColumn key={k} group={group} /> : null;
        })}
      </div>
    </section>
  );
}
