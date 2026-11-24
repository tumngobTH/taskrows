# TaskRows: transfer a task between accounts

Status: approved by Kim 2026-11-24 ("Item 2 confirm"). Extends the v3 design spec (2026-11-23-taskrows-design.md), which listed cross-account moves as a non-goal because the Google Tasks API cannot move a task across accounts.

## Intent
Kim keeps lists in up to three Google accounts and wants to hand a task from one account to another ("assign"), by dragging it onto another account's list or from the task menu.

## Mechanism: copy, then delete
`tasks.move` only works inside one account, so a transfer is:
1. `tasks.insert` a copy in the target account's list, carrying **title, notes, due, status and completed**, at the drop position (`previous`, and `parent` if dropped under a parent).
2. For each subtask of the source (open and completed, in position order): `tasks.insert` under the new parent with `previous` = the previously inserted sibling.
3. `tasks.delete` the source task (Google deletes its subtasks with it).

Consequences accepted by Kim: the task gets a new Google ID (its completion history is lost); a transfer is two or more network calls, not one.

## Failure policy: never lose a task
- Any insert fails → best-effort delete the copies created so far, restore the source locally, toast `Couldn't move to <list title> — <error>`.
- All inserts succeed but the source delete fails → keep **both** (duplicate beats loss); toast `Copied to <target account email>, but the original couldn't be removed — delete it manually`.
- Writes stay gated on the first successful sync, like every other write.

## UX
- **Drag:** dropping a task on a list, column, or task of another account performs a transfer; the old `Can't move tasks between accounts` block is removed. Subtasks still cannot be dragged out of their parent. A task that has subtasks cannot be dropped *under* another task (Google allows one level of nesting): toast `Can't nest a task that has subtasks`.
- **Merged columns:** a drop on a merged column body goes to the member list of the **dragged task's own account** when the group has one (plain same-account move); otherwise to the column's new-task target account (transfer).
- **Task menu → Move to list…:** lists every list of every account except the task's current list, grouped under the account email when more than one account is signed in; choosing another account's list transfers to the top of that list.
- **Optimistic:** the task disappears from the source and appears in the target immediately with a pending (`tmp:`) id, greyed and not draggable, then takes its real id when Google answers. Rollback as per the failure policy.

## Out of scope
Transferring whole lists; preserving Google's completion history; undo.
