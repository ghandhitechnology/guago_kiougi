# UI kit

Everything a player touches is built from these pieces, drawn from the `ui` atlas in the 해솔 64
palette with the Galmuri fonts. A screen gets a `Ctx` (`{ scene, scope }`); widgets put
themselves in the scope, which handles keyboard focus, Enter, Escape and arrow keys.

## Screens and layout

| Piece | File | Use |
|---|---|---|
| `screen`, `edges()`, `onScreen()` | `screen.ts` | The view's real size (270 tall, 480 to 720 wide) and the notch's safe area. Anchor to `edges()`, relayout in `onScreen`. |
| `registerMenuTab` | `../menu/notebook.ts` | A notebook tab: `{ id, label, icon, order, build(ctx, page, size) }`. Tabs exist only once registered. |
| `Panel` | `panel.ts` | A notebook page with a title tab and a close cross. |
| `Modal` | `overlay.ts` | A page over a dimmed screen with a few actions. |
| `toast(text)`, `holdToasts` | `overlay.ts` | One line dropping in at the top, or where the open screen holds them (`holdToasts(() => panel.toastSpot())`, the cover band) so they never cover its controls. |
| `Tooltip` | `overlay.ts` | A sticky note over what it explains. |
| `worldUi` | `world-ui.ts` | Calls other lanes make on the world's UI: dialogue, banners, prompts, nameplates. |

## Controls

| Piece | File | Use |
|---|---|---|
| `Button` | `button.ts` | Paper, ink or text keycaps; ink is the action that moves things on. |
| `TabRow` | `tabs.ts` | Index tabs along a page. |
| `List` | `list.ts` | Ruled rows that scroll a row at a time, with an eraser scrollbar. |
| `TextField` | `textfield.ts` | IME-safe input; phones lift the page above the keyboard. |
| `Slider`, `Checkbox` | `slider.ts`, `checkbox.ts` | Settings. |
| `Stepper` | `stepper.ts` | − n + for a quantity; `setMax` when what the player can afford changes. |
| `CostRow` | `cost-row.ts` | Costs as icon and amount (red when short) and the one button that pays them; `setPending` while the request is out. |

## Items

| Piece | File | Use |
|---|---|---|
| `ItemCell` | `item-cell.ts` | One well: grade frame, icon, stack count, `+7` badge, worn pin, lock. Hover or long press peeks, press picks, drag carries. |
| `ItemGrid` | `item-grid.ts` | `cols × rows` of wells with a pager; `setItems`, `select`, `cellOf`. |
| `dragGhost` | `item-cell.ts` | The icon under the finger while an item is dragged; calls back where it was dropped. |
| `ItemCard` | `item-card.ts` | The sticky note an item shows on hover: name in grade colour, facts, power with its difference from what is worn, one line on it. |
| catalog | `../items/catalog.ts` | Names, bag lines and icons for books, tools, materials and snacks; `GRADE_INK` for names on paper; `bookPower`; `amount` for big numbers. |

## State and copy

| Piece | File | Use |
|---|---|---|
| `inventory` | `../state/inventory.ts` | The player's belongings: snapshot at entry, changes applied in `rev` order, `op(name, req)` with one retry under the same id. |
| `live` | `../state/live.ts` | The Page, the board, the 도감, the 연구노트 and the rules; `read(what)`, pushes to `watch`. |
| `spoken`, `refusal` | `../copy/lines.ts` | Narrative lines by id with their speaker; `refusal("op", code)` for any operation's refusal. |
| `sound`, `cue` | `sound.ts`, `../sound/audio.ts` | UI sounds and any library cue; silent until the first gesture. |
