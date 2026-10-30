import { getLogger } from "loglevel";
import { Fabric, Location } from "../../typeObj.ts";
import { CatalogItem, Tube } from "../../typeObj.ts";
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
import { createIconHTML } from "../renderUtils.ts";
import { shortLivedDialog } from "../shortLiveDialog.ts";
import arrow_icon from "../../../assets/icons/arrow.svg";
import { LocationController } from "./location/location.ts";
import TomSelect from "tom-select";
// import { ExcelTubeInfo } from "../../schema.ts";
import { ExcelTubeInfo } from "../../typeObj.ts";
import { TubeSearcher } from "../components/TubeSearcher.ts";

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
  table: Api<Fabric>;
  tube: Tube;
  fabricCraft: FabricCraft;
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
  excel_tube_data: HTMLParagraphElement;

  moveFabric: MoveFabric;
  excel_info: ExcelTubeInfo;
  archive_toggler_visibility: HTMLInputElement;
  public events = new TypedEventEmitter<RowModalEvents>();

  constructor() {
    this.create_dialog();
    this.moveFabric = new MoveFabric();

    this.tubeOverviewTable = new TubeOverviewTable({
      tbl_element: this.tbl_element,
      edit_callback: async (data: Fabric, row) => {
        let partial_payload = await this.fabricCraft.show(data);

        if (partial_payload == null) {
          return;
        }
        let res = await CoreAPI.fabric_update(data.id, partial_payload);

        if (!res.success) {
          log.debug(res.data);
          return;
        }

        this.table.row.add(res.data.fabric);

        row.remove();
        this.table.draw(false);

        this.events.emit("fabric:edited", res.data.fabric);
      },
      archive_callback: async (fabric: Fabric, row) => {
        let partial_fabric: Partial<Fabric> = {
          is_archived: !fabric.is_archived,
        };
        let res = await CoreAPI.fabric_update(fabric.id, partial_fabric);

        if (!res.success) {
          log.debug(res.data);
          return;
        }

        // 1. Remove the old row
        row.remove();

        // 2. Add the new row, draw, and immediately grab its new node
        let showArchived = this.archive_toggler_visibility.checked;

        let newRowApi = this.table.row.add(res.data.fabric).draw(false);
        let newNode = newRowApi.node();

        log.debug("stuff here ", res.data.fabric, " now node ", newNode);

        // 3. Apply visibility style to the fresh node
        if (newNode) {
          newNode.style.display = showArchived ? "" : "none";
        }
      },
      delete_callback: async (fabric: Fabric, row) => {
        if (
          fabric.deductions.length > 0 ||
          fabric.comments.length > 0 ||
          fabric.is_archived
        ) {
          shortLivedDialog.titleContainer.textContent = `No se puede eliminar la tela porque tiene salidas o comentarios o esta archivada`;
          await shortLivedDialog.open();
          return;
        }

        let res = await CoreAPI.fabric_delete(fabric.id);
        if (!res.success) {
          log.debug(res.data);
          return;
        }
        row.remove();
        this.table.draw(false);
      },

      move_callback: async (fabric: Fabric, row) => {
        let data = await this.moveFabric.show(fabric);

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
        this.events.emit("tubo_overview:dblclick_fabric", data as Fabric);
      },
    });
    this.table = this.tubeOverviewTable.table;
    this.fabricCraft = new FabricCraft(this.events);
    this.init_bindings();
    this.locationController = new LocationController();
  }

  init_bindings() {
    this.bind_add_btn();
    inspect_row(this.table.table().body(), this.table);
    this.handle_verify_click();
    this.handle_location_click();
    this.bind_archive_visibility_toggler();
  }

  update_archive_visibility() {
    const showArchived = this.archive_toggler_visibility.checked;

    this.table.rows().every(function () {
      const fabric = this.data();

      if (fabric.is_archived) {
        // If checked, clear display (show); if unchecked, set to "none" (hide)
        this.node().style.display = showArchived ? "" : "none";
      }
    });
  }

  bind_archive_visibility_toggler() {
    this.archive_toggler_visibility.addEventListener("change", () => {
      this.update_archive_visibility();
    });
  }

  create_dialog() {
    const a_tw = "min-w-7xl min-h-5xl";
    this.modal_dialog = new ModalDialog({
      body: this.body(),
      title: this.title(),
      container_tailwind_class: a_tw,
      cancelText: "Cerrar",
      showConfirm: false,
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
    <div class="flex justify-between items-center w-full">  
      
      <!-- Left Column (Needs w-full or flex-1 so inner elements can stretch) -->
      <div class="flex gap-2.5 flex-col w-full">
        
        <div class="flex justify-between items-center w-full text-lg font-bold">
          <!-- Left Section -->
          <div class="flex gap-6 items-center">
              <h3 id="title"></h3>
              <p id="excel_tube_info"></p>
          </div>

          <!-- Right Section (Toggle) -->
          <div class="flex gap-3 items-center" id="archived-fabric-toggler-container" >
                  
              <span id="tipo-tabla-vista-text">Mostrar telas archivadas</span>
              <input type="checkbox" class="toggle toggle-primary" />
          </div>
        </div>

        <div class="flex gap-2 items-center">  
          <p class="location-paragraph">Ubicacion: No asignado</p>
          ${createIconHTML({
            src: arrow_icon,
            id: "change-location-btn",
            title: "Cambiar ubicacion",
          })}
        </div>
      </div>

      <!-- Right Box (Rectificado) -->
      <div class="rectificado-container flex justify-center items-center gap-2.5 border-black border-2 rounded-3xl p-4 shrink-0">
          <p class="font-bold select-none"></p>
      </div>
      
    </div>
  `);

    let a_tw = "gap-2.5 border-4 rounde  ";

    this.tube_title = e.querySelector(`#title`);
    this.excel_tube_data = e.querySelector(`#excel_tube_info`);

    this.verified_p = e.querySelector(".rectificado-container p");
    this.verified_container = e.querySelector(".rectificado-container");

    this.location_par = e.querySelector(".location-paragraph");
    this.change_location_btn = e.querySelector("#change-location-btn");

    this.archive_toggler_visibility = e.querySelector(
      "#archived-fabric-toggler-container input",
    );
    this.archive_toggler_visibility.checked = false;

    return e;
  }

  // async handle_delete_fabric(data: Fabric, row) {
  //   let res = await CoreAPI.fabric_delete(data.original_fabric.id);
  //
  //   if (!res.success) {
  //     log.debug(res.data);
  //
  //     shortLivedDialog.titleContainer.innerHTML = res.data.error;
  //     const confirm = await shortLivedDialog.open();
  //     return;
  //   }
  //
  //   row.remove();
  //   this.table.draw(false);
  //
  //   this.events.emit("fabric:deleted", res.data.fabric);
  //   this.events.emit("tube:updated", res.data.tube);
  // }

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
      let res = await CoreAPI.update_verified_state_excel_info(
        this.excel_info.id,
        !this.excel_info.verified,
      );
      if (!res.success) {
        log.debug(res.data);
        return;
      }
      this.excel_info = res.data.excel_info;
      this.update_display_excel_info();
    });
  }

  update_display() {
    this.location_par.textContent = `Ubicación: ${this.tube.location_id ?? "No asignado"}`;
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

      log.debug("closing");
      shortLivedDialog.close();
    }

    return true;
  }

  bind_add_btn() {
    this.add_btn.addEventListener("click", async () => {
      const fabric = await this.fabricCraft.show(null, {
        tube_id: this.tube.id,
      });

      if (!fabric) {
        log.debug("operation was canceled");
        return;
      }

      // const fabricData = buildFabricObject(result, this.tube.id);
      log.info(`Adding table with data ${fabric}`);
      let res = await CoreAPI.fabric_add(fabric);

      if (!res.success) {
        log.debug(res.data);
        return;
      }

      this.table.row.add(res.data.fabric);
      this.table.draw();
    });
  }

  async handle_fabric_selection(row: ApiRowMethods<Fabric>) {
    const fabric = row.data();
    let changed_fabric = await this.fabricCraft.show(fabric);

    log.info("Redrawing table");
    log.info("Data of worked row ", fabric);
    if (changed_fabric) {
      let partial_data = get_partial_data(fabric, changed_fabric);
      log.info("Updating fabric with data ", partial_data);
      let res = await CoreAPI.fabric_update(fabric.id, partial_data);
      if (!res.success) {
        log.debug(res.data);
        return;
      }
      //TODO beware Everytime  i draw in the table, it makes a request to the  server
      this.events.emit("tube:updated", res.data.tube);
      row.data(res.data.fabric);
      this.table.draw(false);
    }
  }

  get_tom_select_id(tablename) {
    return `#select-${tablename}`;
  }

  cb_initModalDropdowns() {
    this.fabricCraft.cb_initModalDropdowns();
  }

  async get_excel_info(tube_id: number): Promise<null | ExcelTubeInfo> {
    let res = await CoreAPI.tube_excel_info(tube_id);

    if (!res.success) {
      log.debug(res.data);
      return null;
    }

    return res.data as ExcelTubeInfo;
  }

  update_display_excel_info() {
    if (this.excel_info) {
      let verified = this.excel_info.verified;
      this.verified_p.parentElement.classList.remove("hidden");
      this.verified_p.parentElement.classList.add("flex");

      log.debug("excel data is ", this.excel_info);
      if (verified) {
        this.verified_p.textContent = "Verificado";
        this.verified_p.classList.add("!text-green-500");
        this.verified_p.classList.remove("!text-red-500");
        this.excel_tube_data.textContent = ``;
      } else {
        let data = this.excel_info;
        let locations_text = "Ubicaciones: ";

        for (let location of data.locations) {
          locations_text += `${location.name},`;
        }
        if (data.locations.length <= 0) {
          locations_text = "No tiene ubicacion";
        }
        this.excel_tube_data.textContent = `Excel info: Tube ID : ${data.excel_tube_id} | ${locations_text}`;
        this.verified_p.textContent = "No Verificado";
        this.verified_p.classList.remove("!text-green-500");
        this.verified_p.classList.add("!text-red-500");
      }

      return;
    }

    this.verified_p.parentElement.classList.add("hidden");
    this.verified_p.parentElement.classList.remove("flex");
    this.excel_tube_data.textContent = ``;
  }

  async cb_open_modal_tube(tube: Tube, fabrics: Fabric[]) {
    if (this.modal_dialog.opened) {
      return;
    }

    this.tube_title.textContent = `Tubo ${tube.id}`;
    this.tube = tube;
    this.excel_info = await this.get_excel_info(tube.id); // Maybe if somebody by mistake  verifies , to make sure to get the data?

    this.update_display_excel_info();
    this.update_display();

    for (let fabric of fabrics) {
      this.table.row.add(fabric);
    }

    log.debug(`Length of fabrics here is ${fabrics.length}`);
    this.table.draw();

    this.update_archive_visibility();

    log.debug(tube, fabrics);

    this.modal_dialog.show();
  }

  cb_open_modal_fabric(fabric_data: Fabric) {}

  cb_update_fabric_data(fabric: Fabric) {
    if (!this.modal_dialog.opened) {
      return;
    }

    log.debug("cb_update_fabric_data(fabric: Fabric)");
    let row = this.table.row((index, data, node) => {
      if (data.id == fabric.id) {
        return true;
      }
    });

    if (!row) {
      log.debug(`Not able to find row with id ${fabric.id}`);
      return;
    }
    log.debug(fabric);
    row.data(fabric);
    this.table.draw(false);
  }
}

class MoveFabric {
  modalDialog: ModalDialog;
  tom: TomSelect;
  tubeSearcher: TubeSearcher;
  // resolve: (Fabric | null) => void;
  resolve: (
    data: { fabric: Fabric; tube: Tube; previous_tube: Tube } | null,
  ) => void;
  fabric: Fabric;

  constructor() {
    this.tubeSearcher = new TubeSearcher();
    this.tom = this.tubeSearcher.tom;

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
      body: this.tubeSearcher.element,
      title: "Mover Tela",
    });
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

function get_type_modifications_arrays(table) {
  return {
    created_arr: table.rows((idx, data) => data.mode === "created"),
    edited_arr: table.rows((idx, data) => data.mode === "edited"),
    deleted_arr: table.rows((idx, data) => data.mode === "deleted"),
  };
}

class Callbacks {}

const tubeOverview = new TubeOverview();
export { tubeOverview };
