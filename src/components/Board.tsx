import { useTaskStore } from "../store/store";
import Row from "./Row";
import "../styles/board.css";

export default function Board() {
  const rows = useTaskStore((s) => s.layout.rows);
  const addRow = useTaskStore((s) => s.addRow);
  return (
    <main className="board">
      <div className="rows">
        {rows.map((r) => (
          <Row key={r.id} row={r} />
        ))}
      </div>
      <button type="button" className="add-row" onClick={addRow}>
        + Add row
      </button>
    </main>
  );
}
