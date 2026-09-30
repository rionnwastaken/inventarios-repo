import { getLogger } from "loglevel";
import { Fabric, Location } from "../../typeObj.ts";
import { CatalogItem, FabricData, Tube } from "../../typeObj.ts";
import {
  createElementFromHTML,
  fabricDataColumn,
  get_partial_data,
  inspect_row,
} from "../utils.ts";
import { Api, ApiRowMethods, ColumnsConfig } from "datatables.net-dt";
import { state } from "../../state.ts";

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
import edit_icon from "../../../assets/icons/edit.png";
import archive_icon from "../../../assets/icons/archive.png";
import { Actions } from "./actions.ts";
import { ActionOverlay } from "../misc/ActionOverlay.ts";
import { createIconHTML } from "../renderUtils.ts";
import { shortLivedDialog } from "../shortLiveDialog.ts";
import arrow_icon from "../../../assets/icons/arrow.svg";
import { LocationController } from "./location/location.ts";

const add_id = "add-btn";
const edit_id = "edit-btn";
const archive_id = "archive-btn";
const tube_id = "tube-id";
const hierachy_id = "hierachy-id";

const tbl_id = "tube-overview-table";

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
  fabricColumns: (ColumnsConfig & { data: keyof FabricData })[];
  fabricCraft: FabricCraft;
  actions: Actions;
  initTable: InitTable;
  modal_dialog: ModalDialog;

  tbl_element: HTMLTableElement;
  tbody: HTMLBodyElement;
  add_btn: HTMLButtonElement;
  edit_btn: HTMLButtonElement;
  hierarchy_btn: HTMLButtonElement;
  archive_btn: HTMLButtonElement;
  tube_title: HTMLParagraphElement;
  selected_rows: Set<number>;
  single_select_btns: Array<HTMLButtonElement>;

  overlay_action_container: HTMLDivElement;
  edit_action_btn: HTMLButtonElement;
  archive_action_btn: HTMLButtonElement;

  selected_row: ApiRowMethods<FabricData> | null;
  actionOverlay: ActionOverlay;
  change_location: HTMLButtonElement;
  locationController: LocationController;
  location_par: HTMLParagraphElement;
  verified_p: HTMLParagraphElement;
  verified_container: HTMLDivElement;

  public events = new TypedEventEmitter<RowModalEvents>();

  constructor() {
    this.create_dialog();

    this.initTable = new InitTable(this.tbl_element, this.selected_rows);
    this.table = this.initTable.table;
    this.fabricCraft = new FabricCraft(this.events);
    this.actions = new Actions(this.fabricCraft, this.table);
    this.init_bindings();
    this.selected_rows = new Set();
    this.locationController = new LocationController();

    this.actionOverlay = new ActionOverlay({
      container: this.create_action_on_row_elements(),
      cb_samerow_2clicks: async (data: FabricData, row) => {
        await this.handle_fabric_selection(row);
      },
    });
    this.actionOverlay.init(this.table);
    this.single_select_btns = new Array();
    // this.single_select_btns.push(this.edit_btn, this.hierarchy_btn);

    this.create_action_on_row_elements();
  }

  init_bindings() {
    this.bind_add_btn();
    // this.bind_row_double_click();
    inspect_row(this.tbody, this.table);
    this.bind_row_right_click();
    this.bind_row_click();
  }

  private create_action_on_row_elements() {
    this.overlay_action_container = createElementFromHTML(`

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
      </div>
`);

    this.edit_action_btn =
      this.overlay_action_container.querySelector("#edit-action");
    this.archive_action_btn =
      this.overlay_action_container.querySelector("#archive-action");

    this.edit_action_btn.addEventListener("click", (e) => {
      e.stopPropagation();
      this.remove_actions_overlay();
      this.actions.open_form_editing(this.actionOverlay.selected_row);
    });
    return this.overlay_action_container;
  }

  private update_row_actions_overlay(row: ApiRowMethods<FabricData>) {
    this.remove_actions_overlay(row);
    this.render_actions_overlay(row);
  }

  /**
   * Renders and attaches the overlay to the target row's last cell.
   */
  private render_actions_overlay(row: any) {
    let node = row.node();
    let lastCell = node.cells[node.cells.length - 1];

    if (!lastCell) return;

    lastCell.classList.add("relative");

    lastCell.appendChild(this.overlay_action_container);
    log.debug("image data ", edit_icon);
  }

  /**
   * Removes all active overlays from the table DOM.
   */
  public remove_actions_overlay() {
    // Direct O(1) removal: check if the container is currently mounted anywhere
    if (this.overlay_action_container.parentElement) {
      this.overlay_action_container.parentElement.classList.remove("relative");
      this.overlay_action_container.remove();
    }
  }

  create_dialog() {
    const a_tw = "min-w-7xl min-h-5xl";
    this.modal_dialog = new ModalDialog({
      body: this.body(),
      title: this.title(),
      container_tailwind_class: a_tw,
      confirmText: "Guardar",
      cancelText: "Cerrar",
      onConfirm: () => {
        const mods = get_type_modifications_arrays(this.table);
        log.debug(
          `Count of the arrays. Created ${mods.created_arr.data().length}, edited ${mods.edited_arr.data().length}, deleted ${mods.deleted_arr.data().length}`,
        );
        this.handle_saving_edited_fabrics(mods.edited_arr);
        this.handle_saving_created_fabrics(mods.created_arr);
      },
      onCancel: () => {
        return this.clean_before_closing();
      },
      onClose: () => {
        return this.clean_before_closing();
      },
    });

    const d = this.modal_dialog.dialogEl;
    this.tube_title = d.querySelector(`#${tube_id}`);
    this.tbl_element = d.querySelector(`#${tbl_id}`);
    this.add_btn = d.querySelector(`#${add_id}`);
    this.tbody = d.querySelector(`#${tbl_id} tbody`);
  }
  body() {
    return `
      <div class="mr-20">
	<table id="${tbl_id}" class="display">
	  <thead></thead>
	  <tbody></tbody>
	</table>


      </div>


	<div class="flex gap-4">
	  <button id="${add_id}" class="w-fit  btn" type="">
	    Agregar
	  </button>
	</div>
    `;
  }
  title() {
    const element = createElementFromHTML(`
    <div class="flex justify-between"> 
	<div class="flex gap-2.5  flex-col">
	  <h3 id="${tube_id}" class="text-lg font-bold"></h3>
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

    this.verified_p = element.querySelector(".rectificado-container p");
    this.verified_container = element.querySelector(".rectificado-container");

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

    this.location_par = element.querySelector(".location-paragraph");
    this.change_location = element.querySelector("#change-location-btn");

    this.change_location.addEventListener("click", async () => {
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

    return element;
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

  // create_

  async clean_before_closing() {
    log.debug("clean_before_closing()");
    const mods = get_type_modifications_arrays(this.table);
    let display_message = "";

    if (mods.created_arr.data().length > 0) {
      display_message += `Telas creadas: ${mods.created_arr.length}<br>`;
    }

    if (mods.edited_arr.data().length > 0) {
      display_message += `Telas Editadas: ${mods.edited_arr.length}<br>`;
    }

    if (mods.deleted_arr.data().length > 0) {
      display_message += `Telas eliminado: ${mods.deleted_arr.length}<br>`;
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
    this.modal_dialog.close();
    this.table.data().clear();
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
    this.tbody.addEventListener("contextmenu", async (event) => {
      event.preventDefault();
      log.debug("right clieck");

      const row = event.target.closest("tr");
      log.debug(row);

      if (row && this.tbody.contains(row)) {
        const row_obj = this.table.row(row);
        this.actions.open_form_editing(row_obj);
      }
    });
  }

  bind_row_click() {
    this.tbody.addEventListener("click", async (event) => {
      this.actionOverlay.handle_row_click(event);
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
