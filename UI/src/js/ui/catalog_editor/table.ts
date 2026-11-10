import { ApiRowMethods, ColumnsConfig } from "datatables.net-dt";
import { Table } from "../table";
import { column2, createElementFromHTML, RenderingInfo } from "../utils";
import { FabricDeduction } from "../../schema";
import { createIconHTML, render_datecell, render_plain2 } from "../renderUtils";

import delete_icon from "../../../assets/icons/delete.svg?raw";
import replace_icon from "../../../assets/icons/replace.svg?raw";
import rename_icon from "../../../assets/icons/rename.svg?raw";

type callback = (
  data: unknown,
  row: ApiRowMethods<unknown>,
) => Promise<unknown>;

export class CatalogEditorTable extends Table {
  on_delete: callback;
  on_rename: callback;
  on_replace: callback;

  constructor(data: {
    on_delete: callback;
    on_rename: callback;
    on_replace: callback;
  }) {
    super();
    this.on_delete = data.on_delete;
    this.on_rename = data.on_rename;
    this.on_replace = data.on_replace;
  }

  create_action_overlay(): HTMLDivElement {
    this.overlay_container = createElementFromHTML(`
      <div class="dt-row-overlay absolute right-0 top-0 z-[9999]  flex gap-2     whitespace-nowrap">
      ${createIconHTML({
        svg: delete_icon,
        id: "delete-action",
        title: "Eliminar Articulo",
      })}
      ${createIconHTML({
        svg: rename_icon,
        id: "rename-action",
        title: "Renombrar Articulo",
      })}

      ${createIconHTML({
        svg: replace_icon,
        id: "replace-action",
        title: "Remplazar Articulo",
      })}
      </div>
`);

    const delete_action_btn =
      this.overlay_container.querySelector("#delete-action");

    const edit_action_btn =
      this.overlay_container.querySelector("#rename-action");

    const replace_action_btn =
      this.overlay_container.querySelector("#replace-action");

    delete_action_btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      this.call_callback(this.on_delete);
    });

    edit_action_btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      this.call_callback(this.on_rename);
    });

    replace_action_btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      this.call_callback(this.on_replace);
    });

    return this.overlay_container;
  }

  async call_callback(cb: callback) {
    let row = this.actionOverlay.selected_row;
    let deduction = row.data() as FabricDeduction;
    await cb(deduction, row);
  }

  init_columns(): ColumnsConfig[] {
    //@ts-ignore
    const columns = [
      //@ts-ignore
      // column2({
      //   id: "id",
      //   column_name: "Comentario",
      //   rendering_func: render_plain2,
      // }),

      //@ts-ignore
      column2({
        id: "name",
        column_name: "Nombre",
        rendering_func: render_plain2,
      }),

      column2({
        id: "count",
        column_name: "Tejidos utilizando el articulo",
        rendering_func: render_plain2,
      }),
    ];
    return columns;
  }
}
