import { get, post } from "../api.ts";
import { form, h, select, table, td, when } from "../dom.ts";
import type { Ctx } from "../nav.ts";

interface AdminRow {
  id: string;
  loginId: string;
  role: "moderator" | "owner";
  status: "active" | "disabled";
  createdAt: string;
  lastLoginAt: string | null;
}

/** Owners only. Admins are created on the server with `pnpm admin create`. */
export async function adminsScreen(ctx: Ctx): Promise<Node> {
  const { admins } = await get<{ admins: AdminRow[] }>("/admins");
  const rows = admins.map((a) => {
    const self = a.id === ctx.admin.id;
    const edit = self
      ? h("span", { class: "muted" }, "you")
      : form(
          { class: "row" },
          [
            select(
              "role",
              [
                ["moderator", "moderator"],
                ["owner", "owner"],
              ],
              a.role,
            ),
            select(
              "status",
              [
                ["active", "active"],
                ["disabled", "disabled"],
              ],
              a.status,
            ),
            h("input", {
              name: "reason",
              placeholder: "reason",
              required: true,
              maxlength: 500,
              size: 24,
            }),
            h("button", { type: "submit" }, "Save"),
          ],
          async (d) => {
            await post(`/admins/${a.id}`, {
              role: d.get("role"),
              status: d.get("status"),
              reason: d.get("reason"),
            });
            ctx.reload();
            return "Saved";
          },
        );
    return [
      td(a.loginId),
      td(a.role),
      td(a.status === "disabled" ? h("span", { class: "bad" }, "disabled") : "active"),
      td(when(a.lastLoginAt, true), "when"),
      td(when(a.createdAt, true), "when"),
      td(edit),
    ];
  });
  return h(
    "div",
    null,
    h("h1", null, "Admins"),
    table(["Login", "Role", "Status", "Last login", "Created", ""], rows),
  );
}
