import { getLogger } from "loglevel";
import { Fabric, Tube } from "../../schema.ts";
import { CatalogItem, FabricData, TubeExtraD } from "../../typeObj.ts";
import {
  calc_remaining_fabric_measurements,
  column,
  column2,
  fabricDataColumn,
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
} from "../renderUtils.ts";
import { fabric_catalago_title_id } from "../misc.ts";
import { fabric_column_name_from_tablename } from "./utils.ts";

let log = getLogger("app");

export class InitTable {
  table: Api<FabricData>;
  tube: Tube;
  fabricColumns: (ColumnsConfig & { data: keyof FabricData })[];
  fabricCraft: FabricCraft;

  constructor() {
    this.init_columns();
    this.init_table();
    this.init_visible_group();
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
        id: "original_width",
        column_name: "Ancho",
        rendering_func: (info: RenderingInfo) => {
          return render_remaining_measurement(info, "width");
        },
      }), // @ts-ignore

      column2({
        id: "original_height",
        column_name: "Altura",
        rendering_func: (info: RenderingInfo) => {
          return render_remaining_measurement(info, "height");
        },
      }), // @ts-ignore

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
    this.table = new DataTable("#row-modal-table", {
      columns: this.fabricColumns,
      paging: false,
      autoWidth: true,
      searching: false,
      order: { name: "original_fabric.updated_at", dir: "asc" },
      rowCallback: render_row,
      columnDefs: [
        {
          targets: "_all", // Zero-based index of the columns you want to left-align
          className: "dt-left", // Applies left-alignment to both header and body cells
        },
      ],
    });
    if (typeof this.table.select === "object") {
      console.log("Select module is successfully loaded!");
    } else {
      console.error("Select module is NOT loaded.");
    }
  }

  init_visible_group() {
    this.table
      .columns((idx) => {
        const config = this.table.column(idx).init();
        return true;
      })
      .visible(true); // Pass boolean state directly
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
function render_remaining_measurement(
  info: RenderingInfo,
  which: "width" | "height",
) {
  {
    if (!which) {
      throw Error("FUck you, which is null in render_remaining_measurement ");
    }

    const data = info.data as FabricData;

    // log.debug("fabricdata in redenr cell", data);
    if (info.type === "display") {
      let original_value = data?.original_fabric[info.column_id] ?? null;
      let modified_value = data?.modified_fabric?.[info.column_id] ?? null;

      if (!original_value) {
        return "";
      }

      if (
        data.original_fabric.deductions != null &&
        data.original_fabric.deductions.length > 0
      ) {
        let measurements = calc_remaining_fabric_measurements(
          data.original_fabric,
        );
        let measure;
        if (which == "width") {
          measure = measurements["remaining_width"];
        } else {
          measure = measurements["remaining_height"];
        }

        return `${measure} mts`;
      }

      return getDiffValue(
        format_measurement(original_value),
        format_measurement(modified_value),
        data.mode,
      );
    }
  }

  //TODO I would like to display data for when data has been edited, to display original and modified, and the original criss cross
}

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
