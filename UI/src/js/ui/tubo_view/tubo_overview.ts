import { getLogger } from "loglevel";
import { Tube } from "../../schema.ts";
import { Fabric } from "../../typeObj.ts";
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
import "datatables.net-select-dt";

import TomSelect from "tom-select";
import "tom-select/dist/css/tom-select.css";
import { CatalogApi } from "../../api/catalog.ts";
import { TypedEventEmitter } from "../../emitter.ts";
import { CoreAPI } from "../../api/core.ts";
import { FabricCraft, ItemState } from "./fabricCraft.ts";
import { InitTable } from "./init_table.ts";
import { ApiRowsMethods } from "datatables.net";
import { ModalDialog } from "../dialogs/modalDialog.ts";

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
  "tubo_overview:dblclick_fabric": (fabric: Fabric) => void;
}

class TemporalID {
  id_incremental: number;

  constructor() {
    this.id_incremental = 0;
  }

  get() {
    let id = this.id_incremental;
    this.id_incremental += 1;
    return id;
  }
}

const temporalID = new TemporalID();

class TubeOverview {
  table: Api<FabricData>;
  tube: Tube;
  fabricColumns: (ColumnsConfig & { data: keyof FabricData })[];
  fabricCraft: FabricCraft;
  initTable: InitTable;

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
    this.bind_dialog();
    this.bind_row_right_click();
  }

  bind_close_btn() {
    close_btn.addEventListener("click", async () => {
      this.clean_before_closing();
    });
  }

  bind_dialog() {
    row_view_modal.addEventListener("submit", (e) => {
      e.preventDefault();
    });

    row_view_modal.addEventListener("close", (event) => {
      this.clean_before_closing();
    });
  }

  async clean_before_closing() {
    const mods = get_type_modifications_arrays(this.table);
    let display_message = "";

    if (mods.created_arr.data().length > 0) {
      display_message += `Has creado ${mods.created_arr.length} telas`;
    }

    if (mods.edited_arr.data().length > 0) {
      display_message += `,has editado ${mods.edited_arr.length} telas`;
    }

    if (mods.deleted_arr.data().length > 0) {
      display_message += `,has eliminado ${mods.deleted_arr.length} telas`;
    }

    if (display_message != "") {
      const confirm = await showRecycleDialog({
        header: display_message,
        message: "Que desear hacer",
        cancelText: "Volver",
        confirmText: "No guardar los cambios",
      });

      if (!confirm) {
        return;
      }
    }

    log.debug("closing");
    row_view_modal.close();
    this.table.data().clear();
  }

  async handle_saving_created_fabrics(arr: ApiRowsMethods<FabricData>) {
    if (arr.data().length > 0) {
      log.info("handle_saving_created_fabrics()");
      log.info(`Adding ${arr.count()} created rows`);

      // Extract the raw data objects from the rows API instance into an array
      const data: FabricData[] = arr.data().toArray();

      data.forEach(
        (row) => (row.original_fabric["temp_id"] = temporalID.get()),
      );

      log.debug("SEnding data ", data);
      const res = await CoreAPI.fabric_add_many(
        data.map((row) => row.original_fabric),
      );

      if (res.success) {
        for (const data_response of res.data["fabrics"]) {
          const temp_id = data_response["temp_id"];
          const fabric_data_response = data_response["fabric"];

          const row = data.find((f) => f.original_fabric["temp_id"] == temp_id);
          if (row == undefined) {
            for (const row of data) {
              console.log(row);
            }
            log.debug("Row is undeifned");
            log.debug(data.forEach((f) => f.original_fabric["temp_id"]));
            log.debug(temp_id);
            return;
          }
          state.tableData.fabrics.push(fabric_data_response);
          row.original_fabric["id"] = fabric_data_response["id"];
        }

        arr.every(function (row) {
          const rowData = this.data();
          rowData.mode = "normal";
          this.data(rowData); // Re-syncs the data and invalidates the row's cache

          log.debug("This data right now after creating is ", this.data());
        });
        this.table.draw(false);

        log.info("Creation of rows success");
      } else {
        log.error(res);
      }
    }
  }

  /*
    GIVE ME BLEACH PLEASE, MY EYES GOTTA UNSEE IT
    */
  async handle_saving_edited_fabrics(arr: ApiRowsMethods<FabricData>) {
    if (arr.data().length > 0) {
      log.info("handle_saving_edited_fabrics()");
      log.info(`Updating  ${arr.length} rows`);

      const data: FabricData[] = arr.data().toArray();
      const partial_data = [];
      for (let fabricData of data) {
        const p = get_partial_data(
          fabricData.original_fabric,
          fabricData.modified_fabric,
          {
            omitKeys: ["created_at", "updated_at", "id"],
          },
        );

        partial_data.push({
          partial_data: p,
          id: fabricData.original_fabric.id,
        });
      }

      console.debug("Sending partial data ", partial_data);
      const res = await CoreAPI.fabric_update_many(partial_data);
      if (res.success) {
        log.info("Update of rows success ", res);

        log.debug("data right now here after editing is ", data);
        const updated_fabrics = res.data.updated_fabrics.data;
        for (const obj of updated_fabrics) {
          const id = obj["id"];
          const partial_data = obj["partial_data"];
          const d = data.find((row) => row.original_fabric.id == id);

          // state.tableData.fabrics.push(fabric_data_response)
          for (const [key, value] of Object.entries(partial_data)) {
            d.original_fabric[key] = value;
          }
          d.modified_fabric = null;

          const index = state.tableData.fabrics.findIndex(
            (fabric) => fabric.id == id,
          );
          if (index !== -1) {
            state.tableData.fabrics[index] = d.original_fabric;
          }
        }

        arr.every(function () {
          const rowData = this.data();
          rowData.mode = "normal";
          this.data(rowData); // Re-syncs the data and invalidates the row's cache
        });
        this.table.draw(false);

        log.debug(res.data);
      } else {
        log.error(res);
      }
    }
  }

  async handle_saving_deleted_fabrics(arr: Array<FabricData>) {
    if (arr.data().length > 0) {
      log.info(`Deleting  ${arr.length} rows`);
    }
  }

  bind_save_btn() {
    modal_save_btn.addEventListener("click", async () => {
      const mods = get_type_modifications_arrays(this.table);

      log.debug(
        `Count of the arrays. Created ${mods.created_arr.data().length}, edited ${mods.edited_arr.data().length}, deleted ${mods.deleted_arr.data().length}`,
      );

      this.handle_saving_created_fabrics(mods.created_arr);
      this.handle_saving_edited_fabrics(mods.edited_arr);
    });
  }

  bind_add_btn() {
    modal_add_btn.addEventListener("click", async () => {
      let fabricData: FabricData = {
        original_fabric: null,
        modified_fabric: null,
        mode: null,
      };

      const fabric = await this.fabricCraft.show(fabricData, "creating", {
        tube_id: this.tube.id,
      });

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
      log.debug("right clieck");

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
          await this.fabricCraft.show(data, "editing");
          // this.events.emit("tubo_overview:dblclick_fabric",data.original_fabric)
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
          await this.fabricCraft.show(data, "editing_created");
        }

        if (data.mode == "normal") {
          this.events.emit(
            "tubo_overview:dblclick_fabric",
            data.original_fabric,
          );
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
    this.fabricCraft.cb_initModalDropdowns();
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

  cb_open_modal_fabric(fabric_data: Fabric) {}

  cb_update_fabric_data(fabric: Fabric) {
    log.debug("cb_update_fabric_data(fabric: Fabric)")
    let row = this.table.row((index,data,node) => {
      if (data.original_fabric.id == fabric.id) {
	return true
      }
    })

    if (!row) {
      log.debug(`Not able to find row with id ${fabric.id}`)
      return
    }
    let data:FabricData = {
      original_fabric:fabric,
      mode:"normal",
    }
    row.data(data)
    this.table.draw()
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

const tubeOverview = new TubeOverview();
export { tubeOverview };
