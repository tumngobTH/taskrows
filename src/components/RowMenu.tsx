import { useTaskStore } from "../store/store";
import PopoverMenu from "./PopoverMenu";

export default function RowMenu({ rowId }: { rowId: string }) {
  const rowCount = useTaskStore((s) => s.layout.rows.length);
  const removeRow = useTaskStore((s) => s.removeRow);
  return (
    <PopoverMenu ariaLabel="Row menu">
      {(close) => (
        <button
          type="button"
         
          disabled={rowCount <= 1}
          onClick={() => {
            removeRow(rowId);
            close();
          }}
        >
          Remove row
        </button>
      )}
    </PopoverMenu>
  );
}
