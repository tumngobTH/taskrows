import { Fragment } from "react";
import { useTaskStore } from "../store/store";
import BoardDnd from "../dnd/BoardDnd";
import Row from "./Row";
import RowResizeHandle from "./RowResizeHandle";
import "../styles/board.css";

export default function Board() {
  const rows = useTaskStore((s) => s.layout.rows);
  const addRow = useTaskStore((s) => s.addRow);
  return (
    <main className="board">
      <BoardDnd>
        <div className="rows">
          {rows.map((r, i) => (
            <Fragment key={r.id}>
              {i > 0 && <RowResizeHandle aboveRowId={rows[i - 1].id} belowRowId={r.id} />}
              <Row row={r} />
            </Fragment>
          ))}
        </div>
      </BoardDnd>
      <button type="button" className="add-row" onClick={addRow}>
        + Add row
      </button>
    </main>
  );
}
