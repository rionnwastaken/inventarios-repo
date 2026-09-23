import { ApiRowMethods, ColumnsConfig } from "datatables.net-dt";
import { Table } from "../table";
import { column2, createElementFromHTML, RenderingInfo } from "../utils";
import { FabricDeduction } from "../../schema";
import { createIconHTML, render_datecell, render_plain2 } from "../renderUtils";

import edit_icon from "../../../assets/icons/edit.png";

type callback = (
  data: unknown,
  row: ApiRowMethods<unknown>,
) => Promise<unknown>;

export class KardexTable extends Table {
  on_delete: callback;

  constructor(data: { on_delete: callback }) {
    super();
    this.on_delete = data.on_delete;
  }

  create_action_overlay(): HTMLDivElement {
    this.overlay_container = createElementFromHTML(`
      <div class="dt-row-overlay absolute left-full top-0 z-[9999]  flex flex-col gap-2    border border-slate-700 whitespace-nowrap">
      ${createIconHTML({
        src: edit_icon,
        id: "delete-action",
        title: "Eliminar Deduccion",
      })}
      </div>
`);

    const delete_action_btn =
      this.overlay_container.querySelector("#delete-action");

    delete_action_btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      log.debug("Deleting deduction");

      let row = this.actionOverlay.selected_row;
      let deduction = row.data() as FabricDeduction;

      await this.on_delete(deduction, row);
    });
    return this.overlay_container;
  }

  init_columns(): ColumnsConfig[] {
    //@ts-ignore
    const columns = [
      //@ts-ignore
      column2({
        id: "",
        column_name: "Salidas",
        rendering_func: (info: RenderingInfo) => {
          let data = info.data as FabricDeduction;
          let width = data.removed_width;
          let height = data.removed_height;
          return `${width} x ${height} mts`;
        },
        // format_func: format_measurement,
      }),

      //@ts-ignore
      column2({
        id: "comment",
        column_name: "Comentario",
        rendering_func: render_plain2,
      }),

      //@ts-ignore
      column2({
        id: "updated_at",
        column_name: "Ultima actualizacion",
        rendering_func: render_datecell,
      }),

      //@ts-ignore
      column2({
        id: "created_at",
        column_name: "Creado",
        rendering_func: render_datecell,
      }),
    ];
    return columns;
  }
}
