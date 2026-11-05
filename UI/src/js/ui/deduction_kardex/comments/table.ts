import { ApiRowMethods, ColumnsConfig } from "datatables.net-dt";
import { Table } from "../../table";
import { column2, createElementFromHTML, RenderingInfo } from "../../utils";
import { FabricDeduction } from "../../../schema";
import {
  createIconHTML,
  render_datecell,
  render_plain2,
} from "../../renderUtils";

import delete_icon from "../../../../assets/icons/delete.svg?raw";

type callback = (
  data: unknown,
  row: ApiRowMethods<unknown>,
) => Promise<unknown>;

export class CommentsTable extends Table {
  on_delete: callback;
  on_select_row: callback;

  constructor(data: { on_delete: callback; on_select_row: callback }) {
    super();
    this.on_delete = data.on_delete;
    this.on_select_row = data.on_select_row;

    this.actionOverlay.cb_samerow_2clicks = (data, row) => {
      this.on_select_row(data, row);
    };
  }

  create_action_overlay(): HTMLDivElement {
    this.overlay_container = createElementFromHTML(`
      <div class="dt-row-overlay absolute right-1 top-0 z-[9999]  flex  gap-2   whitespace-nowrap">
      ${createIconHTML({
        id: "delete-action",
        title: "Eliminar Deduccion",
        svg: delete_icon,

        btnClass: "text-red-800 bg-white w-12 h-12",
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
