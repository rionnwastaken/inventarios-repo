import { getLogger } from "loglevel";
import { Fabric, Tube } from "../../schema.ts";
import { CatalogItem, FabricData, TubeExtraD } from "../../typeObj.ts";
import { calc_remaining_fabric_measurements, fabricDataColumn, fcolumn, tcolumn } from "../utils.ts";
import { Api, ColumnsConfig } from "datatables.net-dt";

import DataTable from "datatables.net-dt";
import 'datatables.net-dt/css/dataTables.dataTables.css';

// select(DataTable);

// select(window, DataTable);

import "tom-select/dist/css/tom-select.css";
import { TypedEventEmitter } from "../../emitter.ts";
import { FabricCraft, ItemState } from "./fabricCraft.ts";
import { state } from "../../state.ts";
import { format_measurement, getDiffValue, render_datecell } from "../renderUtils.ts";

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

    const catalogConfigs: [string, string][] = [
      ["Modelo", "blind_model"],
      ["Color", "color"],
      ["Clasificacion", "fabric_classification"],
      ["Suministrador", "supplier"],
    ];

    this.fabricColumns = [
      ...catalogConfigs.map(([label, prop]) =>
	  fabricDataColumn(null, label, {
	    render: (data, type, row, meta) =>
	      this.render_catalago(data, type, row, meta, prop, `${prop}_id`),
	  })
	),

      //TODO CHANGE THIS CAUSE ITS NOT GOING TO REFLECT EDIT VIEW
      //TODO MAKE SURE THIS DATA DISPLAYS  THE REMAINING 
      fabricDataColumn(null, "Ancho", {
        render: (data, type, row, meta) =>
          this.render_remaining_measurement(data, type, row, meta, "original_width","width"),
      }),
      fabricDataColumn(null, "Altura", {
        render: (data, type, row, meta) =>
          this.render_remaining_measurement(data, type, row, meta, "original_height","height"),
      }),

      fabricDataColumn("original_fabric.updated_at", "Fecha actualizado", {
        render: (data, type, row, meta) =>
          render_datecell(data, type, row, meta),
      }),
      fabricDataColumn("original_fabric.created_at", "Fecha Creacion", {
        render: (data, type, row, meta) =>
          render_datecell(data, type, row, meta),
      }),
    ];
  }

  init_table() {
    this.table = new DataTable("#row-modal-table", {
      columns: this.fabricColumns,
      paging: false,
      autoWidth: true,
      searching: false,
      order: { name: "original_fabric.updated_at", dir: "desc" },
      rowCallback: this.render_row,
      columnDefs: [
        {
          targets: "_all", // Zero-based index of the columns you want to left-align
          className: "dt-left", // Applies left-alignment to both header and body cells
        },
      ],
    });
if (typeof this.table.select === 'object') {
  console.log('Select module is successfully loaded!');
} else {
  console.error('Select module is NOT loaded.');
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

      return getDiffValue(
        original_value,
        modified_value,
        fabricData.mode,
      );
    }
  }

  //TODO FIGURE OUT HOW TO DISPLAY THIS SHIT WHEN CHANGING XD
  render_remaining_measurement(fabricData: FabricData, type, row, meta,column_id,which:"width" | "height") {

    if (!which) {
      throw Error("FUck you, which is null in render_remaining_measurement ")
    }

    // log.debug("fabricdata in redenr cell", fabricData);
    if (type === "display") {
      let original_value = fabricData?.original_fabric[column_id] ?? null;
      let modified_value = fabricData?.modified_fabric?.[column_id] ?? null;

      if (!original_value) {
	return ""
      }

      if (fabricData.original_fabric.deductions != null && fabricData.original_fabric.deductions.length > 0 ) {
	let measurements = calc_remaining_fabric_measurements(fabricData.original_fabric)
	let measure
	if (which == "width") {
	  measure =  measurements["remaining_width"]
	}
	else {
	measure =  measurements["remaining_height"]
	}

	return `${measure} mts`
      }
      
      return getDiffValue(format_measurement(original_value),format_measurement(modified_value),fabricData.mode)
    }
  }



  //TODO I would like to display data for when data has been edited, to display original and modified, and the original criss cross
  render_catalago(
    fabricData: FabricData,
    type,
    row,
    meta,
    table_name,
    column_id,
    
  ) {
    // log.debug("fabricdata in redenr cell", fabricData);
    if (type === "display") {
      let original_value = state.catalagoData.catalagoValue(
        table_name,
        fabricData.original_fabric?.[column_id] ?? null,
      );
      let modified_value = state.catalagoData.catalagoValue(
        table_name,
        fabricData.modified_fabric?.[column_id] ?? null,
      );

      log.debug(`Formatting value for column ${column_id}`)
      return getDiffValue(
        original_value,
        modified_value,
        fabricData.mode,
      );
    }
  }

  render_row(row: HTMLTableRowElement, data: FabricData, index: number) {
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
}
