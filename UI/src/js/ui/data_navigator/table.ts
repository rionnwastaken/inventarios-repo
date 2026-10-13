import { ApiRowMethods, ColumnsConfig } from "datatables.net-dt";
import { Table } from "../table";
import {
  column2,
  createElementFromHTML,
  fabricColumn,
  RenderingInfo,
  tubeColumn,
} from "../utils";
import { FabricDeduction } from "../../schema";
import { createIconHTML, render_datecell, render_plain2 } from "../renderUtils";

import delete_icon from "../../../assets/icons/delete.svg?raw";
import { fabric_catalago_title_id, tube_title_id } from "../misc";
import { Fabric } from "../../typeObj";
import { state } from "../../state";

type callback = (
  data: unknown,
  row: ApiRowMethods<unknown>,
) => Promise<unknown>;

export class NavigationTable extends Table {
  on_delete: callback;
  on_row_select: callback;

  constructor(data: {
    on_delete: callback;
    load_data_function: Function;
    on_row_select: callback;
    tbl_element: HTMLElement;
  }) {
    super();
    this.on_delete = data.on_delete;
    this.init(data.tbl_element, {
      ajax: data.load_data_function,
      paging: true,
      serverSide: true,
      pageLength: 100,
      scroller: {
        loadingIndicator: true,
        displayBuffer: 10,
        rowHeight: 45,
      },
      scrollY: "800px",
      deferRender: true,
      info: true,
    });

    this.actionOverlay.cb_samerow_2clicks = async (row_data, row) => {
      await data.on_row_select(row_data, row);
    };
  }

  create_action_overlay(): HTMLDivElement {
    this.overlay_container = createElementFromHTML(`
      <div class="dt-row-overlay absolute right-1  top-0 z-[9999]  flex flex-col gap-2  whitespace-nowrap">
      ${createIconHTML({
        svg: delete_icon,
        id: "delete-action",
        title: "Eliminar Deduccion",
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
      let deduction = row.data();
      await this.on_delete(deduction, row);
    });
    return this.overlay_container;
  }

  init_columns(): ColumnsConfig[] {
    const tube_columns = [
      ...tube_title_id.map(([column_name, id]) =>
        tubeColumn({
          id: id,
          column_name: column_name,
          rendering_func: render_plain2,
        }),
      ),
    ];

    const fabric_columns = [
      column2({
        id: "",
        column_name: "Tubo ID",
        group: "fabric",
        rendering_func: (info: RenderingInfo) => {
          let data = info.data as Fabric;
          return `${data.tube_id}`;
        },
      }),

      ...fabric_catalago_title_id.map(([column_name, schema_column_name]) =>
        fabricColumn({
          id: `${schema_column_name}_id`,
          column_name: column_name,
          rendering_func: render_plain2,
          format_func: (id) => {
            let value = state.catalagoData.catalagoValue(
              schema_column_name,
              id,
            );
            return value;
          },
        }),
      ),

      column2({
        id: "",
        column_name: "Medidas Entrada",
        group: "fabric",
        rendering_func: (info: RenderingInfo) => {
          let data = info.data as Fabric;
          return `${data.original_width} x ${data.original_height} mts`;
        },
      }),

      column2({
        id: "",
        column_name: "% Restante",
        group: "fabric",
        rendering_func: (info: RenderingInfo) => {
          let data = info.data as Fabric;
          return `${data.remaining_percent}`;
        },
      }),
    ];

    const shared_columns = [
      column2({
        id: "updated_at",
        column_name: "Ultima actualizacion",
        rendering_func: render_datecell,
        group: "both",
      }),
      column2({
        id: "created_at",
        column_name: "Creado en",
        rendering_func: render_datecell,
        group: "both",
      }),
    ];
    const columns = [...tube_columns, ...fabric_columns, ...shared_columns];
    return columns;
  }
}
