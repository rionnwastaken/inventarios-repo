import { getLogger } from "loglevel";
import { Tube } from "../../schema.ts";
import { CatalogItem, Fabric, Tube } from "../../typeObj.ts";
import {
  column,
  column2,
  createElementFromHTML,
  fabricDataColumn,
  num,
  render_row,
  RenderingInfo,
} from "../utils.ts";
import { Api, ApiRowMethods, ColumnsConfig } from "datatables.net-dt";

import DataTable from "datatables.net-dt";
import "datatables.net-dt/css/dataTables.dataTables.css";

// select(DataTable);

// select(window, DataTable);

import "tom-select/dist/css/tom-select.css";
import { TypedEventEmitter } from "../../emitter.ts";
import { FabricCraft, ItemState } from "./fabricCraft.ts";
import { state } from "../../state.ts";
import {
  createButtonRawIcon,
  createIconHTML,
  format_measurement,
  render_datecell,
  render_plain2,
} from "../renderUtils.ts";
import { fabric_catalago_title_id } from "../misc.ts";
import { fabric_column_name_from_tablename } from "./utils.ts";
import { Table } from "../table.ts";

import edit_icon from "../../../assets/icons/edit2.svg?raw";
import move_icon from "../../../assets/icons/move.svg?raw";
import delete_icon from "../../../assets/icons/delete.svg?raw";
import archive_icon from "../../../assets/icons/archive.svg?raw";

let log = getLogger("app");

type callback = (
  data: unknown,
  row: ApiRowMethods<unknown>,
) => Promise<unknown>;

export class TubeOverviewTable extends Table {
  // table: Api<Fabric>;
  tube: Tube;
  fabricColumns: (ColumnsConfig & { data: keyof Fabric })[];
  fabricCraft: FabricCraft;
  tbl_element: HTMLTableElement;

  edit_action_btn: HTMLButtonElement;
  archive_action_btn: HTMLButtonElement;
  delete_fabric_btn: HTMLButtonElement;
  move_fabric_btn: HTMLButtonElement;

  edit_callback: callback;
  archive_callback: callback;
  delete_callback: callback;
  move_callback: callback;
  row_selected_callback: callback;
  archive_action_icon_container: HTMLElement;

  constructor(data: {
    edit_callback: callback;
    archive_callback: callback;
    row_selected_callback: callback;
    delete_callback: callback;
    move_callback: callback;
    tbl_element: HTMLTableElement;
  }) {
    super();
    this.tbl_element = data.tbl_element;
    this.edit_callback = data.edit_callback;
    ((this.archive_callback = data.archive_callback),
      (this.row_selected_callback = data.row_selected_callback));
    this.delete_callback = data.delete_callback;
    this.move_callback = data.move_callback;

    this.init(this.tbl_element, {
      order: { name: "updated_at", dir: "desc" },
      rowCallback: render_row,
      scrollY: "100%",
      scrollCollapse: true,
      paging: false,
    });

    this.actionOverlay.cb_samerow_2clicks = async (data, row) => {
      this.row_selected_callback(data, row);
    };

    log.debug("fartsnarts", this.delete_fabric_btn);
    this.actionOverlay.callback_row_click = (data: Fabric, row) => {
      log.debug("row clicked hahah ", this.delete_fabric_btn);
      log.debug("fucks this ", this); // this.delete_fabric_btn.classList.add("block");
    };

    // this.actionOverlay.init(this.dt)
  }

  create_action_overlay(): HTMLDivElement {
    log.debug("sparking up my heart");
    let container = createElementFromHTML(`

      <div class="dt-row-overlay absolute right-1 top-0 z-[9999]  flex  gap-2   whitespace-nowrap">
      ${createIconHTML({
        svg: edit_icon,
        id: "edit-action",
        title: "Editar Tela",
      })}

      ${createIconHTML({
        svg: delete_icon,
        id: "delete-action",
        title: "Eliminar Tela",
        btnClass: "text-red-800 bg-white w-14 h-14 hover:bg-red-300",
      })}


      ${createIconHTML({
        svg: move_icon,
        id: "move-action",
        title: "Mover Tela",
      })}

      ${createIconHTML({
        svg: archive_icon,
        id: "archive-action",
        title: "Archivar Tela",
      })}
      </div>
`);

    this.edit_action_btn = container.querySelector("#edit-action");
    this.archive_action_btn = container.querySelector("#archive-action");
    this.archive_action_icon_container =
      this.archive_action_btn.querySelector("span");
    this.delete_fabric_btn = container.querySelector("#delete-action");
    this.move_fabric_btn = container.querySelector("#move-action");

    this.edit_action_btn.addEventListener("click", (e) => {
      log.debug("big butts ", this.delete_fabric_btn, this.edit_action_btn);
      e.stopPropagation(); // Prevents triggering card click event
      let row = this.actionOverlay.selected_row;
      this.edit_callback(row.data(), row);
    });

    this.archive_action_btn.addEventListener("click", (e) => {
      e.stopPropagation(); // Prevents triggering card click event
      let row = this.actionOverlay.selected_row;
      this.archive_callback(row.data(), row);
    });

    log.debug("nice and slow", this.delete_fabric_btn);

    this.delete_fabric_btn.addEventListener("click", (e) => {
      e.stopPropagation(); // Prevents triggering card click event
      let row = this.actionOverlay.selected_row;
      this.delete_callback(row.data(), row);
    });

    this.move_fabric_btn.addEventListener("click", (e) => {
      e.stopPropagation(); // Prevents triggering card click event
      let row = this.actionOverlay.selected_row;
      this.move_callback(row.data(), row);
    });

    return container;
  }

  init_columns() {
    return [
      // @ts-ignore
      ...fabric_catalago_title_id.map(([column_name, schema_column_name]) =>
        column2({
          id: `${schema_column_name}_id`,
          column_name: column_name,
          rendering_func: function (info: RenderingInfo) {
            let data = info.data as Fabric;
            const id = data?.[info?.column_id];
            return state.catalagoData.catalagoValue(schema_column_name, id);
          },
        }),
      ),

      // @ts-ignore
      column2({
        id: "",
        column_name: "Medidas Entrada",
        rendering_func: (info: RenderingInfo) => {
          let fabric = info.data as Fabric;
          let original_value = `${fabric.original_width} x ${fabric.original_height} mts`;
          return original_value;
        },
      }),

      // @ts-ignore
      column2({
        id: "",
        column_name: "% Restante",
        rendering_func: (info: RenderingInfo) => {
          let data = info.data as Fabric;
          let percentage = data?.remaining_percent ?? 100;
          return `${percentage}%`;
        },
      }),

      // @ts-ignore
      column2({
        id: "updated_at",
        column_name: "Fecha actualizado",
        rendering_func: render_datecell,
      }),
      // @ts-ignore
      column2({
        id: "created_at",
        column_name: "Creado en ",
        rendering_func: render_datecell,
      }),
    ];
  }

  //Data is litterally the the value of a column, like an id
  render_plain(fabric: Fabric, type, row, meta, table_name, column_id) {
    if (type === "display") {
      let original_value = fabric?.[column_id] ?? null;
      original_value = `${original_value} mts`;

      return original_value;
    }
  }
}
