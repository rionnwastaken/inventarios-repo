import { getLogger } from "loglevel";
import { Fabric, Tube } from "../../schema.ts";
import { CatalogItem, FabricData, TubeExtraD } from "../../typeObj.ts";
import {
  column,
  column2,
  fabricDataColumn,
  num,
  RenderingInfo,
} from "../utils.ts";
import { Api, ColumnsConfig } from "datatables.net-dt";

import DataTable from "datatables.net-dt";
import "datatables.net-dt/css/dataTables.dataTables.css";

// select(DataTable);

// select(window, DataTable);

import "tom-select/dist/css/tom-select.css";
import { TypedEventEmitter } from "../../emitter.ts";
import { FabricCraft, ItemState } from "./fabricCraft.ts";
import { state } from "../../state.ts";
import {
  format_measurement,
  getDiffValue,
  render_datecell,
  render_plain2,
} from "../renderUtils.ts";
import { fabric_catalago_title_id } from "../misc.ts";
import { fabric_column_name_from_tablename } from "./utils.ts";

let log = getLogger("app");

export class InitTable {
  table: Api<FabricData>;
  tube: Tube;
  fabricColumns: (ColumnsConfig & { data: keyof FabricData })[];
  fabricCraft: FabricCraft;
  tbl_element: HTMLTableElement;
  selected_rows: Set<number>;

  constructor(tbl_element: HTMLTableElement, selected_rows) {
    this.tbl_element = tbl_element;
    this.init_columns();
    this.init_table();
    // this.selected_rows = selected_rows
  }

  init_columns() {
    this.fabricColumns = [
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

  init_table() {
    this.table = new DataTable(this.tbl_element, {
      columns: this.fabricColumns,
      paging: false,
      autoWidth: true,
      searching: false,
      order: { name: "original_fabric.updated_at", dir: "desc" },
      rowCallback: render_row,
      select: {
        blurable: true,
      },
      columnDefs: [
        {
          targets: "_all", // Zero-based index of the columns you want to left-align
          className: "dt-left", // Applies left-alignment to both header and body cells
        },
      ],
    });
  }

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
