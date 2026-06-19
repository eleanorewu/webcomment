# Drag Existing Pins In Comment Mode

## Goal

Allow users to reposition an existing annotation pin while WebComment is in comment placement mode. Repositioning must take priority over creating a new annotation and must not exit comment mode.

## Current Problem

`beginPinPointer` rejects every pointer down while `state.commentMode` is true. As a result, an existing pin can show its hover preview in comment mode but cannot enter the existing drag flow.

## Interaction Design

- A primary-button pointer down on an existing pin may begin a drag whether comment mode is active or inactive.
- Pointer movement of less than 1px remains a click.
- Pointer movement of 1px or more starts dragging.
- Starting a drag closes the pin hover preview.
- While dragging, the pin follows the pointer and host-page click, selection, and native drag behavior remain suppressed by the existing drag flow.
- Releasing the pointer captures a fresh anchor and persists one anchor update.
- A completed drag suppresses the following pin click, so it does not open the thread or create a new annotation.
- If comment mode was active before the drag, it remains active after success, failure, conflict, or cancellation.
- Save failure and anchor revision conflict retain the existing rollback and feedback behavior.

## Implementation Scope

Update the existing pin pointer state machine in `src/content/content-script.js`:

1. Remove the `state.commentMode` guard from `beginPinPointer`.
2. Change the drag threshold in `handlePinPointerMove` from 4px to 1px.
3. Keep the existing preview closing, click suppression, anchor capture, persistence, rollback, and toast behavior.
4. Do not change the document click handler. Events originating inside the Shadow DOM overlay remain excluded from new-annotation placement.

No data model, storage format, popup, backend, or permission changes are included.

## State And Event Rules

The drag interaction uses the existing states:

```text
pointerDown -> dragging -> saving -> idle
                    |-> cancelled
                    |-> saveFailed -> rollback
```

`commentMode` is independent of this state machine. The drag flow reads neither changes nor restores it.

## Verification

Automated tests must verify that:

- `beginPinPointer` no longer blocks while `state.commentMode` is true.
- The drag threshold is 1px.
- Drag start still closes the hover preview.
- Completed drag still suppresses the subsequent click.
- The drag flow does not assign `state.commentMode = false`.

Run:

```bash
npm test
npm run check
git diff --check
```

Manual Chrome verification should cover:

1. Enter comment mode.
2. Hover an existing pin and confirm its preview appears.
3. Drag the pin at least 1px and release it on another element.
4. Confirm the pin moves and no draft or thread opens.
5. Confirm the annotation cursor remains active and a subsequent page click can create a new annotation.
6. Confirm a pointer interaction below 1px retains the existing click behavior.
