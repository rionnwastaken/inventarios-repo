import { getLogger } from "loglevel";
import { Fabric, Tube } from "../../schema.ts";
import { CatalogItem, FabricData, Tube } from "../../typeObj.ts";
import {
  column,
  column2,
  createElementFromHTML,
  fabricDataColumn,
  num,
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
  createIconHTML,
  format_measurement,
  getDiffValue,
  render_datecell,
  render_plain2,
} from "../renderUtils.ts";
import { fabric_catalago_title_id } from "../misc.ts";
import { fabric_column_name_from_tablename } from "./utils.ts";
import { Table } from "../table.ts";

import edit_icon from "../../../assets/icons/edit.png";
import archive_icon from "../../../assets/icons/archive.png";

let log = getLogger("app");

type callback = (
  data: unknown,
  row: ApiRowMethods<unknown>,
) => Promise<unknown>;

export class TubeOverviewTable extends Table {
  table: Api<FabricData>;
  tube: Tube;
  fabricColumns: (ColumnsConfig & { data: keyof FabricData })[];
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

    this.init_columns();

    this.init(this.tbl_element, {
      order: { name: "original_fabric.updated_at", dir: "desc" },
      rowCallback: render_row,
    });

    this.actionOverlay.cb_samerow_2clicks = async (data, row) => {
      this.row_selected_callback(data, row);
    };

    this.actionOverlay.callback_row_click = (data: FabricData, row) => {
      let deductions = data.original_fabric.deductions;
      if (deductions.length > 1) {
        //TODO hide deletebutton when more
      }
    };

    // this.actionOverlay.init(this.dt)
  }

  create_action_overlay(): HTMLDivElement {
    let container = createElementFromHTML(`

      <div class="dt-row-overlay absolute left-full top-0 z-[9999]  flex flex-col gap-2    border border-slate-700 whitespace-nowrap">
      ${createIconHTML({
        src: edit_icon,
        id: "edit-action",
        title: "Editar Tela",
      })}
      ${createIconHTML({
        src: archive_icon,
        id: "archive-action",
        title: "Archivar Tela",
      })}

      ${createIconHTML({
        src: archive_icon,
        id: "delete-action",
        title: "Eliminar Tela",
      })}

      ${createIconHTML({
        src: archive_icon,
        id: "move-action",
        title: "Mover Tela",
      })}
      </div>
`);

    this.edit_action_btn = container.querySelector("#edit-action");
    this.archive_action_btn = container.querySelector("#archive-action");
    this.delete_fabric_btn = container.querySelector("#delete-action");
    this.move_fabric_btn = container.querySelector("#move-action");

    this.edit_action_btn.addEventListener("click", (e) => {
      e.stopPropagation(); // Prevents triggering card click event
      let row = this.actionOverlay.selected_row;
      this.edit_callback(row.data(), row);
    });

    this.archive_action_btn.addEventListener("click", (e) => {
      e.stopPropagation(); // Prevents triggering card click event
      let row = this.actionOverlay.selected_row;
      this.archive_callback(row.data(), row);
    });

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
            return render_catalago(info, schema_column_name);
          },
        }),
      ),

      // @ts-ignore
      column2({
        id: "",
        column_name: "Medidas Entrada",
        rendering_func: (info: RenderingInfo) => {
          let data = info.data as FabricData;
          let original_value = `${data.original_fabric.original_width} x ${data.original_fabric.original_height} mts`;
          let modified_value = `${data?.modified_fabric?.original_width} x ${data?.modified_fabric?.original_height} mts`;

          return getDiffValue(original_value, modified_value, data.mode);
        },
      }),

      // @ts-ignore
      column2({
        id: "",
        column_name: "% Restante",
        rendering_func: (info: RenderingInfo) => {
          let data = info.data as FabricData;
          let percentage = data?.original_fabric?.remaining_percent ?? 100;
          return `${percentage}%`;
        },
      }),

      // @ts-ignore
      column2({
        id: "original_fabric.updated_at",
        column_name: "Fecha actualizado",
        rendering_func: render_datecell,
      }),
      // @ts-ignore
      column2({
        id: "original_fabric.created_at",
        column_name: "Creado en ",
        rendering_func: render_datecell,
      }),
    ];
  }

  // init_table() {
  //   this.table = new DataTable(this.tbl_element, {
  //     columns: this.fabricColumns,
  //     paging: false,
  //     autoWidth: true,
  //     searching: false,
  //     order: { name: "original_fabric.updated_at", dir: "desc" },
  //     rowCallback: render_row,
  //
  //     info: false,
  //     select: {
  //       blurable: true,
  //     },
  //     columnDefs: [
  //       {
  //         targets: "_all", // Zero-based index of the columns you want to left-align
  //         className: "dt-left", // Applies left-alignment to both header and body cells
  //       },
  //     ],
  //   });
  // }

  //Data is litterally the the value of a column, like an id
  render_plain(fabricData: FabricData, type, row, meta, table_name, column_id) {
    // log.debug("fabricdata in redenr cell", fabricData);
    if (type === "display") {
      let original_value = fabricData?.original_fabric[column_id] ?? null;
      let modified_value = fabricData?.modified_fabric?.[column_id] ?? null;

      original_value = `${original_value} mts`;

      if (modified_value) {
        modified_value = `${modified_value} mts`;
      }

      return getDiffValue(original_value, modified_value, fabricData.mode);
    }
  }
}

//TODO FIGURE OUT HOW TO DISPLAY THIS SHIT WHEN CHANGING XD

function render_row(row: HTMLTableRowElement, data: FabricData, index: number) {
  // Reset custom inline styles back to default DataTables values
  row.style.removeProperty("background-color");
  row.style.removeProperty("text-decoration");
  row.style.removeProperty("color");

  // Remove background styles on child cells in case DataTables set them directly
  const cells = row.querySelectorAll<HTMLTableCellElement>("td, th");
  cells.forEach((cell) => {
    cell.style.removeProperty("background-color");
    cell.style.removeProperty("color");
  });

  style_row_with_color(row, data, index);
}

function style_row_with_color(
  row: HTMLTableRowElement,
  data: FabricData,
  index: number,
) {
  switch (data.mode) {
    case "created":
      row.style.setProperty("background-color", "#dfffbf", "important");
      break;

    case "edited":
      row.style.setProperty("background-color", "#bfe2ff", "important");
      break;

    case "deleted":
      row.style.setProperty("background-color", "#ffbfbf", "important");
      row.style.setProperty("text-decoration", "line-through");
      break;

    case "normal":
    default:
  }
}

function render_catalago(info: RenderingInfo, catalago_tablename) {
  // log.debug("fabricdata in redenr cell", data);
  let data = info.data as FabricData;
  if (info.type === "display") {
    let original_value = state.catalagoData.catalagoValue(
      catalago_tablename,
      data.original_fabric?.[info.column_id] ?? null,
    );
    let modified_value = state.catalagoData.catalagoValue(
      catalago_tablename,
      data.modified_fabric?.[info.column_id] ?? null,
    );

    log.debug(`Formatting value for column ${info.column_id}`);
    return getDiffValue(original_value, modified_value, data.mode);
  }
}
