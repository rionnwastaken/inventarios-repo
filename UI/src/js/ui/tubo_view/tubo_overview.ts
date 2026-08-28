import { getLogger } from "loglevel";
import { Fabric, Tube } from "../../schema.ts";
import { CatalogItem, FabricData, TubeExtraD } from "../../typeObj.ts";
import {
  fabricDataColumn,
  fcolumn,
  get_partial_data,
  tcolumn,
} from "../utils.ts";
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

  constructor() {
    this.init_bindings();

    this.initTable = new InitTable();
    this.fabricCraft = new FabricCraft(this.events);
    this.table = this.initTable.table;
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

      log.debug(
        `Count of the arrays. Created ${mods.created_arr.data().length}, edited ${mods.edited_arr.data().length}, deleted ${mods.deleted_arr.data().length}`,
      );

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

  bind_row_right_click() {
    // Listen for clicks
    tbody.addEventListener("contextmenu", async (event) => {

      event.preventDefault(); 
      log.debug("right clieck")

      const row = event.target.closest("tr");

      if (row && tbody.contains(row)) {
        const row_obj = this.table.row(row);
        const data = row_obj.data();

        if (data == undefined) {
          log.debug("Double click row undefined");
          return;
        }

        //We are passing data by reference
        if (data.mode == "created") {
          await this.fabricCraft.show(data, "editing_created");
        }

        if (data.mode == "normal") {



        log.info("Redrawing table");
        log.info("Data of worked row ", data);
        row_obj.data(data);
        this.table.draw(false);
      }
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

        if (data.mode == "normal") {
	  this.events.emit("tubo_overview:dblclick_fabric",data.original_fabric)
        }

        if (data.mode == "edited") {
          await this.fabricCraft.show(data, "editing");
        }

        log.info("Redrawing table");
        log.info("Data of worked row ", data);
        row_obj.data(data);
        this.table.draw(false);
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

    row_view_modal.showModal();

    // this.table.row(0).select()
  }
}

// type Mode
//TODO add context to row

function get_type_modifications_arrays(table: ApiRowsMethods<FabricData>) {
  return {
    created_arr: table.rows((idx, data) => data.mode === "created"),
    edited_arr: table.rows((idx, data) => data.mode === "edited"),
    deleted_arr: table.rows((idx, data) => data.mode === "deleted"),
  };
}

class Callbacks {}

const rowModal = new RowModal();
export { rowModal };
