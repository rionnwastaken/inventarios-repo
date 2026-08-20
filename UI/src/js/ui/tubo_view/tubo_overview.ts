import { getLogger } from "loglevel";
import { Fabric, Tube } from "../../schema.ts";
import { CatalogItem, FabricData, TubeExtraD } from "../../typeObj.ts";
import { fabricDataColumn, fcolumn, tcolumn } from "../utils.ts";
import { Api, ColumnsConfig } from "datatables.net-dt";
import { state } from "../../state.ts";
import { showRecycleDialog } from "../utils.ts";

import DataTable from "datatables.net-dt";

import TomSelect from "tom-select";
import "tom-select/dist/css/tom-select.css";
import { CatalogApi } from "../../api/catalog.ts";
import { TypedEventEmitter } from "../../emitter.ts";
import { CoreAPI } from "../../api/core.ts";
import { FabricCraft, FabricState } from "./fabricCraft.ts";

const row_view_modal: HTMLDialogElement =
  document.querySelector("#row-view-model");
const modal_title: HTMLHeadingElement = document.querySelector("#modal-title");
const modal_save_btn: HTMLButtonElement =
  document.querySelector("#guardar-btn");

const close_btn: HTMLButtonElement = document.querySelector("#close-btn");

const modal_add_btn: HTMLButtonElement =
  document.querySelector("#modal-btn-add");

const tbody = document.querySelector("#row-modal-table tbody");

let log = getLogger("app");

//TODO BIND modal_save_btn to sendrequest
export interface RowModalEvents {
  "catalog_item:added": (catalogItem: CatalogItem) => void;
}

class RowModal {
  table: Api<FabricData>;
  tube: Tube;
  fabricColumns: (ColumnsConfig & { data: keyof FabricData })[];
  fabricCraft: FabricCraft;

  public events = new TypedEventEmitter<RowModalEvents>();

  // public events = new TypedEventEmitter<TableControllerEvents>();

  constructor() {
    this.init_columns();
    this.init_table();
    this.init_visible_group();
    this.init_bindings();

    this.fabricCraft = new FabricCraft(this.events);
  }

  init_bindings() {
    this.bind_add_btn();
    this.bind_save_btn();
    this.bind_close_btn();
    this.bind_row_double_click();
    this.bind_inspect_row();
  }

  bind_close_btn() {
    close_btn.addEventListener("click", async () => {
      const mods = get_type_modifications_arrays(this.table);
      let display_message = "";

      if (mods.created_arr.length > 0) {
        display_message += `Has creado ${mods.created_arr.length} telas`;
      }

      if (mods.edited_arr.length > 0) {
        display_message += ` y has editado ${mods.edited_arr.length} telas`;
      }

      if (mods.deleted_arr.length > 0) {
        display_message += ` y has eliminado ${mods.deleted_arr.length} telas`;
      }

      if (display_message != "") {
        showRecycleDialog({
          header: display_message,
          message: "Que desear hacer",
          cancelText: "Volver",
          confirmText: "No guardar los cambios",
        });
      }
    });
  }

  bind_save_btn() {
    modal_save_btn.addEventListener("click", async () => {
      const mods = get_type_modifications_arrays(this.table);

      if (mods.created_arr.length > 0) {
        log.info(`Adding  ${mods.created_arr.length} created rows`);
        //TODO since we are adding a temporary  date stamp, maybe update the real datestamp that we get from the server
        const rest = await CoreAPI.fabric_add_many(mods.created_arr);

        if (rest.success) {
          log.info("Creation of rows success");
        } else {
          log.error(rest.error);
        }
      }

      if (mods.edited_arr.length > 0) {
      }

      if (mods.deleted_arr.length > 0) {
      }

      if (mods.edited_arr.length > 0) {
      }
    });
  }

  bind_add_btn() {
    modal_add_btn.addEventListener("click", async () => {
      let fabricData: FabricData = {
        original_fabric: null,
        modified_fabric: null,
        mode: null,
      };

      const fabric = await this.fabricCraft.showCreating(
        fabricData,
        this.tube.id,
      );

      if (!fabric) {
        log.debug("operation was canceled");
        return;
      }

      // const fabricData = buildFabricObject(result, this.tube.id);
      log.info(`Adding table with data ${fabricData}`);
      this.table.row.add(fabricData);
      this.table.draw();
    });
  }

  //Data is litterally the the value of a column, like an id
  render_datecell(data, type, row, meta) {
    if (type === "display") {
      const date = new Date(data);
      return date.toLocaleString("es-MX", { hour12: true });
    }

    if (type == "sort") {
      return new Date(data).getTime();
    }

    return data;
  }

  catalagoValue(table_name, data) {
    if (!data) {
      return "";
    }

    let obj = state.catalagoData.data[table_name].find((obj) => obj.id == data);

    if (obj) {
      return obj.name;
    }
    return "";
  }

  getFormattedCellValue(
    original_value,
    modified_value,
    mode: FabricState,
  ): string {
    if (mode == "normal" || mode == "created") {
      return original_value;
    }

    if (original_value === modified_value) {
      log.debug(`Showing orignal value ${original_value}`);
      return original_value;
    }

    log.debug(`Render comparison ${original_value} ${original_value}`);
    return `
        <div class="flex flex-col justify-center leading-tight py-0.5 text-xs font-mono">
            <span class="text-red-600 dark:text-red-400 line-through decoration-red-500 decoration-1 opacity-80 select-none">
                ${original_value}
            </span>
            <span class="text-emerald-600 dark:text-emerald-400 font-semibold">
                ${modified_value}
            </span>
        </div>
    `;
  }

  render_plain(
    fabricData: FabricData,
    type,
    row,
    meta,
    table_name,
    column_id,
    options?: { plain_value: Boolean },
  ) {
    // log.debug("fabricdata in redenr cell", fabricData);
    if (type === "display") {
        let original_value = fabricData?.original_fabric[column_id] ?? null;
	let modified_value = fabricData?.modified_fabric?.[column_id] ?? null;

	original_value = `${original_value} mts`

	if (modified_value) {
	  modified_value = `${modified_value} mts`
	}


      return this.getFormattedCellValue(
        original_value,
        modified_value,
        fabricData.mode,
      );
    }
  }



  //TODO I would like to display data for when data has been edited, to display original and modified, and the original criss cross
  render_cell(
    fabricData: FabricData,
    type,
    row,
    meta,
    table_name,
    column_id,
    options?: { plain_value: Boolean },
  ) {
    // log.debug("fabricdata in redenr cell", fabricData);
    if (type === "display") {
      let original_value = null;
      let modified_value = null;

      if (options && options.plain_value) {
        log.debug("column id ", column_id, fabricData);
        original_value = fabricData?.original_fabric[column_id] ?? null;
	modified_value = fabricData?.modified_fabric?.[column_id] ?? null;
      } else {
        original_value = this.catalagoValue(
          table_name,
          fabricData.original_fabric?.[column_id] ?? null,
        );
        modified_value = this.catalagoValue(
          table_name,
          fabricData.modified_fabric?.[column_id] ?? null,
        );
      }

      return this.getFormattedCellValue(
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
        // Keeps DataTables standard zebra striping / theme
        break;
    }
  }

  //We pass null for data to get the whole object
  init_columns() {
    this.fabricColumns = [
      fabricDataColumn(null, "Model", {
        render: (data, type, row, meta) =>
          this.render_cell(
            data,
            type,
            row,
            meta,
            "blind_model",
            "blind_model_id",
          ),
      }),
      fabricDataColumn(null, "Color", {
        render: (data, type, row, meta) =>
          this.render_cell(data, type, row, meta, "color", "color_id"),
      }),

      fabricDataColumn(null, "Clasificacion", {
        render: (data, type, row, meta) =>
          this.render_cell(
            data,
            type,
            row,
            meta,
            "fabric_classification",
            "classification_id",
          ),
      }),

      fabricDataColumn(null, "Suministrador", {
        render: (data, type, row, meta) =>
          this.render_cell(data, type, row, meta, "supplier", "supplier_id"),
      }),

      //TODO CHANGE THIS CAUSE ITS NOT GOING TO REFLECT EDIT VIEW
      fabricDataColumn(null, "Ancho", {
        render: (data, type, row, meta) =>
          this.render_plain(data, type, row, meta, "", "original_width", {
            plain_value: true,
          }),
      }),
      fabricDataColumn(null, "Altura", {
        render: (data, type, row, meta) =>
          this.render_plain(data, type, row, meta, "", "original_height", {
            plain_value: true,
          }),
      }),

      fabricDataColumn("original_fabric.updated_at", "Fecha actualizado", {
        render: (data, type, row, meta) =>
          this.render_datecell(data, type, row, meta),
      }),
      fabricDataColumn("original_fabric.created_at", "Fecha Creacion", {
        render: (data, type, row, meta) =>
          this.render_datecell(data, type, row, meta),
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
  }

  bind_row_double_click() {
    // Listen for clicks
    tbody.addEventListener("dblclick", async (event) => {
      const row = event.target.closest("tr");

      if (row && tbody.contains(row)) {
        const row_obj = this.table.row(row);
        const data = row_obj.data();

        if (data == undefined) {
          log.debug("Double click row undefined");
          return;
        }

        log.debug(`Dobule clicking row with mode ${data.mode} and data`, data);

        //We are passing data by reference
        if (data.mode == "created") {
          await this.fabricCraft.show(data,"editing_created");
        }

        if (data.mode == "normal" || data.mode == "edited") {
          await this.fabricCraft.show(data,"editing");
        }

        log.info("Redrawing table");
        log.info("Data of worked row ", data);
        row_obj.data(data);
        this.table.draw(false);

        // if (!fabricData) {
        //   log.debug("operation was canceled");
        //   return;
        // }
      }
    });
  }

  bind_inspect_row() {
    // Listen for clicks
    tbody.addEventListener("click", async (event) => {
      const row = event.target.closest("tr");

      if (row && tbody.contains(row)) {
        const row_obj = this.table.row(row);
        const data = row_obj.data();
        log.debug("Inspecting row", data);
      }
    });
  }

  init_visible_group() {
    this.table
      .columns((idx) => {
        const config = this.table.column(idx).init();
        return true;
      })
      .visible(true); // Pass boolean state directly
  }

  test() {
    // Loop through each row using the DataTables API
    this.table.rows().every(function () {
      const data = this.data();

      // Modify the property
      data.original_fabric.original_width = 293;

      // Pass the updated data object back into the row instance
      this.data(data);
    });

    // Redraw the table without resetting user pagination
    this.table.draw(false);
  }

  get_tom_select_id(tablename) {
    return `#select-${tablename}`;
  }

  cb_initModalDropdowns() {
    const catalog = state.catalagoData;

    const keyCount = Object.keys(catalog.data).length;
    console.log(keyCount);

    for (const [table_name, arr] of Object.entries(catalog.data)) {
      console.log("here");
      const id = this.get_tom_select_id(table_name);
      const select = document.querySelector(id);

      if (!select) {
        log.debug(`select-${table_name} was not found`);
        continue;
      }

      log.debug(id, arr, table_name);
      this.fabricCraft.createToms(id, arr, "name", table_name);
    }

    log.info("Row Dropdowns initialized");
  }

  cb_open_modal_tube(tube_data: TubeExtraD) {
    modal_title.textContent = `Tubo ${tube_data.id}`;
    this.tube = tube_data;

    let fabrics = state.tableData.get_fabrics_by_tube_id(
      this.tube.id,
    ) as Fabric[];

    let fabrics_data = [];
    for (let fabric of fabrics) {
      let data: FabricData = {
        original_fabric: fabric,
        modified_fabric: null,
        mode: "normal",
      };
      fabrics_data.push(data);
    }

    log.debug(`Length of fabrics here is ${fabrics_data.length}`);

    this.table.rows.add(fabrics_data);
    this.table.draw();

    log.debug(tube_data, fabrics);

    // this.test()
    row_view_modal.showModal();
  }

  cb_open_modal_fabric(fabric_data: Fabric) {
    // modal_title.textContent = `Tubo ${tube_data.id}`;
    // this.tube = tube_data;
    //
    // const fabrics = tableData.get_fabrics_by_tube_id(this.tube.id)
    //
    // log.debug(tube_data, fabrics);
    // row_view_modal.showModal();
  }
}

// type Mode
//TODO add context to row

function get_type_modifications_arrays(table: Api<FabricData>) {
  const created_arr = [];
  const edited_arr = [];
  const deleted_arr = [];
  let display_message = "";

  for (let row of table.data().toArray()) {
    if (row.mode == "created") {
      created_arr.push(row);
    }

    if (row.mode == "edited") {
      edited_arr.push(row);
    }

    if (row.mode == "deleted") {
      deleted_arr.push(row);
    }

    console.log(row);
  }

  return {
    created_arr: created_arr,
    edited_arr: edited_arr,
    deleted_arr: deleted_arr,
  };
}

class Callbacks {}

const rowModal = new RowModal();
export { rowModal };
