import { getLogger } from "loglevel";
import { Fabric, Location } from "../../typeObj.ts";
import { CatalogItem, FabricData, Tube } from "../../typeObj.ts";
import {
  createElementFromHTML,
  get_partial_data,
  inspect_row,
  num,
} from "../utils.ts";
import { Api, ApiRowMethods, ColumnsConfig } from "datatables.net-dt";
import { state } from "../../state.ts";

import "datatables.net-select-dt";

import "tom-select/dist/css/tom-select.css";
import { TypedEventEmitter } from "../../emitter.ts";
import { CoreAPI } from "../../api/core.ts";
import { FabricCraft, ItemState } from "./fabricCraft.ts";
import { TubeOverviewTable } from "./table.ts";
import { ApiRowsMethods } from "datatables.net";
import { ModalDialog } from "../dialogs/modalDialog.ts";
import edit_icon from "../../../assets/icons/edit.png";
import archive_icon from "../../../assets/icons/archive.png";
import { Actions } from "./actions.ts";
// import { ActionOverlay } from "../misc/ActionOverlay.ts";
import { createIconHTML } from "../renderUtils.ts";
import { shortLivedDialog } from "../shortLiveDialog.ts";
import arrow_icon from "../../../assets/icons/arrow.svg";
import { LocationController } from "./location/location.ts";
import TomSelect from "tom-select";

let log = getLogger("app");

//TODO BIND modal_save_btn to sendrequest
export interface RowModalEvents {
  "catalog_item:added": (catalogItem: CatalogItem) => void;
  "tubo_overview:dblclick_fabric": (fabric: Fabric) => void;
  "fabric:edited": (fabrics: Fabric) => void;
  "fabric:created": (fabric: Fabric) => void;
  "fabric:deleted": (fabric: Fabric) => void;
  "hierarchy-button-pressed": (fabric: Fabric) => void;
  "tube:updated": (tube: Tube) => void;
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
  fabricCraft: FabricCraft;
  actions: Actions;
  tubeOverviewTable: TubeOverviewTable;
  modal_dialog: ModalDialog;

  tbl_element: HTMLTableElement;
  add_btn: HTMLButtonElement;
  edit_btn: HTMLButtonElement;
  archive_btn: HTMLButtonElement;
  tube_title: HTMLParagraphElement;

  overlay_action_container: HTMLDivElement;
  edit_action_btn: HTMLButtonElement;
  archive_action_btn: HTMLButtonElement;

  // actionOverlay: ActionOverlay;
  change_location_btn: HTMLButtonElement;
  locationController: LocationController;
  location_par: HTMLParagraphElement;
  verified_p: HTMLParagraphElement;
  verified_container: HTMLDivElement;

  moveFabric: MoveFabric;

  public events = new TypedEventEmitter<RowModalEvents>();

  constructor() {
    this.create_dialog();
    this.moveFabric = new MoveFabric();

    this.tubeOverviewTable = new TubeOverviewTable({
      tbl_element: this.tbl_element,
      edit_callback: async (data, row) => {
        await this.actions.open_form_editing(row);
      },
      archive_callback: async (data, row) => {},
      delete_callback: async (data, row) => {
        await this.handle_delete_fabric(data as FabricData, row);
      },

      move_callback: async (fdata: FabricData, row) => {
        let data = await this.moveFabric.show(fdata.original_fabric as Fabric);

        if (data == null) {
          return;
        }
        log.debug("Data: ", data);
        this.events.emit("fabric:edited", data.fabric);
        this.events.emit("tube:updated", data.tube);
        this.events.emit("tube:updated", data.previous_tube);

        row.remove();
        this.table.draw(false);
      },
      row_selected_callback: async (data, row) => {
        await this.handle_fabric_selection(row);
      },
    });
    this.table = this.tubeOverviewTable.table;
    this.fabricCraft = new FabricCraft(this.events);
    this.actions = new Actions(this.fabricCraft, this.table);
    this.init_bindings();
    this.locationController = new LocationController();
  }

  init_bindings() {
    this.bind_add_btn();
    inspect_row(this.table.table().body(), this.table);
    this.bind_row_right_click();
    this.handle_verify_click();
    this.handle_location_click();
  }

  create_dialog() {
    const a_tw = "min-w-7xl min-h-5xl";
    this.modal_dialog = new ModalDialog({
      body: this.body(),
      title: this.title(),
      container_tailwind_class: a_tw,
      confirmText: "Guardar",
      cancelText: "Cerrar",
      onConfirm: async () => {
        const mods = get_type_modifications_arrays(this.table);
        log.debug(
          `Count of the arrays. Created ${mods.created_arr.data().length}, edited ${mods.edited_arr.data().length}, deleted ${mods.deleted_arr.data().length}`,
        );
        this.handle_saving_edited_fabrics(mods.edited_arr);
        this.handle_saving_created_fabrics(mods.created_arr);
        return false;
      },
      onCancel: () => {
        return this.handle_unsaved_changes();
      },
      onClose: () => {
        this.table.data().clear();
      },
    });

    const d = this.modal_dialog.dialogEl;
  }
  body() {
    let e = createElementFromHTML(`
 <div>
      <div class="mr-20">
	<table  class="display">
	  <thead></thead>
	  <tbody></tbody>
	</table>


      </div>


	<div class="flex gap-4">
	  <button id="add" class="w-fit  btn" type="">
	    Agregar
	  </button>
	</div>

    </div>
    `);

    this.add_btn = e.querySelector("#add");
    this.tbl_element = e.querySelector(`table`);

    console.log("add btn ", this.add_btn);

    return e;
  }
  title() {
    const e = createElementFromHTML(`
    <div class="flex justify-between"> 
	<div class="flex gap-2.5  flex-col">
	  <h3 id="title" class="text-lg font-bold"></h3>
      <div class="flex gap-2 items-center"> 
      <p class="location-paragraph">Ubicacion: No asignado</p>
      ${createIconHTML({
        src: arrow_icon,
        id: "change-location-btn",
        title: "Cambiar ubicacion",
      })}
      </div>
	</div>

    <div class="rectificado-container flex justify-center items-center gap-2.5 border-black border-2 rounded-3xl p-4">
        <p class="font-bold select-none">Verificado</p>
    </div
    </div>
    `);

    let a_tw = "gap-2.5 border-4 rounde  ";

    this.tube_title = e.querySelector(`#title`);

    this.verified_p = e.querySelector(".rectificado-container p");
    this.verified_container = e.querySelector(".rectificado-container");

    this.location_par = e.querySelector(".location-paragraph");
    this.change_location_btn = e.querySelector("#change-location-btn");

    return e;
  }

  async handle_delete_fabric(data: FabricData, row) {
    let res = await CoreAPI.fabric_delete(data.original_fabric.id);

    if (!res.success) {
      log.debug(res.data);

      shortLivedDialog.titleContainer.innerHTML = res.data.error;
      const confirm = await shortLivedDialog.open();
      return;
    }

    row.remove();
    this.table.draw(false);

    this.events.emit("fabric:deleted", res.data.fabric);
    this.events.emit("tube:updated", res.data.tube);
  }

  handle_location_click() {
    this.change_location_btn.addEventListener("click", async () => {
      let location = null;

      if (this.tube.location_id != null) {
        let data = state.catalagoData.data["location"];
        location = data.find((el) => {
          if (el.id == this.tube.location_id) {
            return true;
          }
        });
      }
      let data: Location | null = await this.locationController.show(location);

      if (data == null) {
        return;
      }
      let payload: Partial<Tube> = {
        location_id: data.id,
      };

      log.debug("sending data ", this.tube.id, payload);
      const res = await CoreAPI.update_tube(this.tube.id, payload);

      if (!res.success) {
        log.debug(res.data);
        return;
      }

      this.tube = res.data.tube;
      this.update_display();
      this.events.emit("tube:updated", this.tube);

      log.debug("click");
    });
  }

  handle_verify_click() {
    this.verified_container.addEventListener("click", async () => {
      let payload: Partial<Tube> = {
        verified: !this.tube.verified,
      };
      let res = await CoreAPI.update_tube(this.tube.id, payload);

      if (!res.success) {
        log.debug(res.data);
        return;
      }
      this.tube = res.data.tube;
      this.events.emit("tube:updated", this.tube);

      if (this.tube.verified) {
        this.verified_p.textContent = "Verificado";
        this.verified_p.classList.remove("text-red-500");
        this.verified_p.classList.add("text-green-500");
      } else {
        this.verified_p.textContent = "No Verificado";
        this.verified_p.classList.add("text-red-500");
        this.verified_p.classList.remove("text-green-500");
      }
    });
  }

  update_display() {
    this.location_par.textContent = `Ubicación: ${this.tube.location_id ?? "No asignado"}`;

    if (this.tube.verified) {
      this.verified_p.classList.add("text-green-500");
      this.verified_p.classList.remove("text-red-500");
    } else {
      this.verified_p.classList.remove("text-green-500");
      this.verified_p.classList.add("text-red-500");
    }
  }

  async handle_unsaved_changes() {
    log.debug("clean_before_closing()");
    const mods = get_type_modifications_arrays(this.table);
    let display_message = "";

    let created_length = mods.created_arr.data().length;
    let deleted_length = mods.deleted_arr.data().length;
    let edited_length = mods.edited_arr.data().length;

    if (created_length > 0) {
      display_message += `Telas creadas: ${created_length}<br>`;
    }

    if (edited_length > 0) {
      display_message += `Telas Editadas: ${edited_length}<br>`;
    }

    if (deleted_length > 0) {
      display_message += `Telas eliminado: ${deleted_length}<br>`;
    }

    if (display_message != "") {
      shortLivedDialog.titleContainer.innerHTML = `Acciones realizadas:<br>${display_message}`;
      shortLivedDialog.confirmBtn.textContent = "Cerrar sin  guardar";
      shortLivedDialog.cancelBtn.textContent = "Regresar";
      const confirm = await shortLivedDialog.open();

      if (!confirm) {
        return false;
      }
    }

    log.debug("closing");
    shortLivedDialog.close();
    return true;
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

          row.original_fabric = fabric_data_response;
          this.events.emit("fabric:created", fabric_data_response);
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
  async handle_saving_edited_fabrics(rows: ApiRowsMethods<FabricData>) {
    if (rows.data().length > 0) {
      log.info("handle_saving_edited_fabrics()");
      log.info(`Updating  ${rows.length} rows`);

      const data: FabricData[] = rows.data().toArray();
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
        const updated_fabrics = res.data;
        for (const updated_obj of updated_fabrics) {
          const id = updated_obj["id"];
          const obj = data.find((obj) => obj.original_fabric.id == id);

          obj.original_fabric = updated_obj;
          obj.modified_fabric = null;
          this.events.emit("fabric:edited", updated_obj);
          //TODO FIX HERE
        }

        rows.every(function () {
          const fabricData = this.data();
          fabricData.mode = "normal";
          this.data(fabricData); // Re-syncs the data and invalidates the row's cache
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

  bind_add_btn() {
    this.add_btn.addEventListener("click", async () => {
      await this.actions.open_form_create(this.tube.id);
    });
  }

  bind_row_right_click() {
    // Listen for clicks
    let body = this.table.table().body();
    body.addEventListener("contextmenu", async (event) => {
      event.preventDefault();
      log.debug("right clieck");

      const row = event.target.closest("tr");
      log.debug(row);

      if (row && body.contains(row)) {
        const row_obj = this.table.row(row);
        this.actions.open_form_editing(row_obj);
      }
    });
  }

  async handle_fabric_selection(row: ApiRowMethods<FabricData>) {
    const data = row.data();
    if (data.mode == "created") {
      await this.fabricCraft.show(data, "editing_created");
    }

    if (data.mode == "normal") {
      this.events.emit("tubo_overview:dblclick_fabric", data.original_fabric);
      //SHOULDNT I RETURN?
    }

    if (data.mode == "edited") {
      await this.fabricCraft.show(data, "editing");
    }

    log.info("Redrawing table");
    log.info("Data of worked row ", data);
    row.data(data);
    this.table.draw(false);
  }

  get_tom_select_id(tablename) {
    return `#select-${tablename}`;
  }

  cb_initModalDropdowns() {
    this.fabricCraft.cb_initModalDropdowns();
  }

  cb_open_modal_tube(tube_data: Tube) {
    if (this.modal_dialog.opened) {
      return;
    }

    this.tube_title.textContent = `Tubo ${tube_data.id}`;
    this.tube = tube_data;

    this.update_display();

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

    // this.table.clear()
    this.table.rows.add(fabrics_data);
    this.table.draw();

    log.debug(tube_data, fabrics);

    this.modal_dialog.show();
  }

  cb_open_modal_fabric(fabric_data: Fabric) {}

  cb_update_fabric_data(fabric: Fabric) {
    if (!this.modal_dialog.opened) {
      return;
    }

    log.debug("cb_update_fabric_data(fabric: Fabric)");
    let row = this.table.row((index, data, node) => {
      if (data.original_fabric.id == fabric.id) {
        return true;
      }
    });

    if (!row) {
      log.debug(`Not able to find row with id ${fabric.id}`);
      return;
    }
    let data: FabricData = {
      original_fabric: fabric,
      mode: "normal",
    };
    log.debug(data);
    row.data(data);
    this.table.draw(false);
  }
}

class MoveFabric {
  modalDialog: ModalDialog;
  tom: TomSelect;
  // resolve: (Fabric | null) => void;
  resolve: (
    data: { fabric: Fabric; tube: Tube; previous_tube: Tube } | null,
  ) => void;
  fabric: Fabric;

  constructor() {
    this.modalDialog = new ModalDialog({
      onConfirm: async () => {
        let tube_id = this.tom.getValue() as String;

        if (!tube_id || tube_id == "") {
          return false;
        }

        log.debug("id is ", tube_id);

        let payload: Partial<Fabric> = {
          tube_id: Number(tube_id),
        };

        let res = await CoreAPI.fabric_move(this.fabric.id, payload);

        if (!res.success) {
          log.debug(res.data);
          return;
        }
        this.resolve(res.data);
        this.resolve = null;
      },
      onCancel: () => {
        this.resolve(null);
        this.resolve = null;
      },
      body: this.body(),
    });
  }

  body() {
    const e = createElementFromHTML(`
    <label class="form-control w-full" >
      <select
        class="w-full input-lowercase"
      ></select>
    </label> `);

    this.tom = new TomSelect(e.querySelector("select"), {
      selectOnTab: true,
      refreshThrottle: 0,
      maxItems: 1,

      valueField: "id", // What gets submitted in forms
      labelField: "text", // What gets displayed in the dropdown
      searchField: "text",

      load: function (query, callback) {
        var url = "/core/tubes?q=" + encodeURIComponent(query);
        fetch(url)
          .then((response) => response.json())
          .then((ids) => {
            const items = ids.map((id) => ({
              id: id, // Property named "id" holding the numeric value (e.g. 1)
              text: `Tubo ${String(id)}`, // Property named "text" holding the string version (e.g. "1")
            }));

            // 2. Pass the created objects to Tom Select
            callback(items);
          })
          .catch(() => {
            callback();
          });
      },
    });

    return e;
  }

  show(fabric: Fabric) {
    return new Promise<{
      fabric: Fabric;
      tube: Tube;
      previous_tube: Tube;
    } | null>((resolve) => {
      this.resolve = resolve;
      this.fabric = fabric;
      this.modalDialog.show();

      this.tom.clear();
    });
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
