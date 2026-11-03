import { CatalogApi } from "../../api/catalog.ts";
import { CoreAPI } from "../../api/core.ts";
import { Fabric } from "../../typeObj.ts";

import { Api, ApiRowMethods, ColumnsConfig } from "datatables.net-dt";
import { TableView, Tube as Tube, ViewMode } from "../../typeObj.ts";
import { TypedEventEmitter } from "../../emitter.ts";

import DataTable from "datatables.net-dt";
import "datatables.net-scroller-dt";
import save_icon from "../../../assets/icons/plus.svg?raw";

import "datatables.net-dt/css/dataTables.dataTables.css";
import {
  column,
  column2,
  createElementFromHTML,
  fabricColumn,
  fcolumn,
  input_only_allow_numbers,
  inspect_row,
  num,
  RenderingInfo,
  tcolumn,
  tubeColumn,
} from "../utils.ts";
import { state } from "../../state.ts";
import { render_datecell, render_plain2 } from "../renderUtils.ts";
import { fabric_catalago_title_id, tube_title_id } from "../misc.ts";
import { NavigationTable } from "./table.ts";
import { shortLivedDialog } from "../shortLiveDialog.ts";
import { ModalDialog } from "../dialogs/modalDialog.ts";
//TODO ON TUBO ADD BUTTON, add tube to table and refresh it
//TODO WHEN A NEW FABRIC IS ADDED, MAKE SURE IT IS REFLECTED IN THE VIEW, so it increments in tota lof the tube

type TubeColumns = ColumnsConfig & { data: keyof Tube };

export interface TableControllerEvents {
  // "row:dblclick": (tube_data: TubeExtraD, fabrics: Fabric[]) => void;
  "tube:dblclick": (tube_data: Tube, fabrics: Fabric[]) => void;
  "fabric:dblclick": (fabric: Fabric) => void;
}

class TableController {
  table: Api<Tube | Fabric>;
  // columns: (ColumnsConfig & { data: keyof Tube })[];
  public events = new TypedEventEmitter<TableControllerEvents>();

  filters: Object;
  tbl_element: HTMLTableElement;
  btn_new_tube: HTMLButtonElement;
  navigationTable: NavigationTable;
  btn_new_tube_customize: HTMLButtonElement;
  customizableTubeForm: CustomizeTubeForm;

  constructor() {
    this.body();
    // this.init_columns();
    // this.init_table();

    this.navigationTable = new NavigationTable({
      tbl_element: this.tbl_element,
      on_delete: async (data, row: ApiRowMethods<unknown>) => {
        this.on_delete_row(data, row);
      },
      on_row_select: async (data, row) => {
        this.on_select_row(data, row);
      },
      load_data_function: this.load_data.bind(this),
    });

    this.table = this.navigationTable.table;
    this.init_visible_group();
    this.init_bindings();

    this.customizableTubeForm = new CustomizeTubeForm(this.table);

    const bottomRow = document.querySelector(
      "#myTable_wrapper > div:nth-child(3)",
    );

    const xerxes = document.querySelector(".dt-search");

    const mainContainer =
      document.querySelector("#btn-new-tube").parentNode.parentNode; // Your main flex container
    if (bottomRow && mainContainer) {
      const btnNewTube = document.getElementById("btn-new-tube");
      mainContainer.prepend(bottomRow);
      mainContainer.prepend(xerxes);
    }
  }

  body() {
    const e = createElementFromHTML(`
      <div class="flex flex-col h-full max-h-full gap-4 overflow-y-hidden overflow-x-visible p-2">
        
        <!-- Table container: flex-1 min-h-0 allows it to shrink/grow and scroll -->
        <div class="flex-1 min-h-0 overflow-y-clip overflow-x-visible   ">
            <table id="myTable" class="display w-full">
              <thead></thead>
              <tbody></tbody>
            </table>
        </div>

        <!-- Button stays fixed at the bottom -->
        <div class="flex flex-row">
            <div id="btn-new-tube" class="flex items-center gap-2 bg-green-900 p-2 btn w-fit flex-shrink-0">
              <p class="text-lg text-white">Tubo</p>
              <span class="btn w-7 h-7 btn-circle border-none text-white bg-green-600">
                ${save_icon}
              </span>
            </div>


            <div id="btn-new-tube-custom" class="flex items-center gap-2 bg-green-900 p-2 btn w-fit flex-shrink-0">
              <p class="text-lg text-white">Tubo customizado</p>
              <span class="btn w-7 h-7 btn-circle border-none text-white bg-green-600">
                ${save_icon}
              </span>
            </div>

        </div>

      </div>
    `);

    const container = document.querySelector("#table-controller-container");
    this.tbl_element = e.querySelector("table");
    this.btn_new_tube = e.querySelector("#btn-new-tube");
    this.btn_new_tube_customize = e.querySelector("#btn-new-tube-custom");
    container.replaceWith(e);

    this.btn_new_tube.addEventListener("click", async () => {
      const res = await CoreAPI.newTube();
      console.log(res);
      if (res.success) {
        this.cb_insert_tube_to_table(res.data.tube);
      }
    });

    this.btn_new_tube_customize.addEventListener("click", async () => {
      let tube = await this.customizableTubeForm.openForm();
      if (tube == null) {
        return;
      }
      this.cb_insert_tube_to_table(tube);
    });
  }

  async load_data(data, cb, settings) {
    try {
      data.offset = data.start;
      data.limit = data.length;
      data.filters = state.filters || { tube_verified: null };

      console.debug("Sending data ", data);
      console.debug("Getting ", state.active_view);

      let res;
      if (state.active_view == "tube") {
        res = await CoreAPI.get_tubes(data);
      } else if (state.active_view == "fabric") {
        res = await CoreAPI.get_fabrics(data);
      }

      if (res.success) {
        log.debug("Data loaded in main table ", res.data.data);

        cb({
          draw: data.draw,
          recordsTotal: res.data.total_records, // Total rows in DB
          recordsFiltered: res.data.total_filtered, // Filtered rows in DB
          data: res.data.data,
        });
      }
    } catch (error) {
      console.error("Fetch failed:", error);
    }
  }

  async get_data() {
    log.debug("Table controller reloading data");
    this.table.ajax.reload();
  }

  update_data(tubes: Tube[], fabrics: Fabric[]) {
    this.table.data().clear();
    // this.insert_data_to_table(state.active_view);
    this.table.draw();
  }

  init_bindings() {
    inspect_row(this.table.table().body(), this.table);
    // this.bind_row_double_click();
  }

  async on_delete_row(data, row) {
    if (state.active_view == "tube") {
      return this.delete_tube(data, row);
    }

    if (state.active_view == "fabric") {
      return this.delete_fabric(data, row);
    }
  }

  async delete_tube(tube: Tube, row) {
    log.debug("deleting tube");

    let res = await CoreAPI.delete_tube(tube.id);

    if (!res.success) {
      log.debug(res.data);
      shortLivedDialog.titleContainer.innerHTML = res.data.error;
      shortLivedDialog.open();
      return;
    }
    // row.remove()
    // this.table.draw(false)
    this.table.ajax.reload(null, false);
  }

  async delete_fabric(fabric: Fabric, row) {
    let res = await CoreAPI.fabric_delete(fabric.id);
    if (!res.success) {
      log.debug(res.data);
      return;
    }
    row.remove();
    this.table.draw(false);
  }

  async on_select_row(data, row) {
    let tbody = this.table.table().body();
    if (data == undefined) {
      log.debug("Double click row undefined");
      return;
    }

    log.debug(`Data of row `, data);
    if (state.active_view == "tube") {
      log.info("Double click on tube");
      let tube = data as Tube;
      let res = await CoreAPI.get_tube_data(tube.id);

      if (!res.success) {
        log.debug(res.data);
        return;
      }
      let fabrics = res.data.fabrics;
      this.events.emit("tube:dblclick", tube, fabrics);
      return;
    }

    if (state.active_view == "fabric") {
      log.info("Double click on Fabric");
      this.events.emit("fabric:dblclick", data as Fabric);
      return;
    }
    log.error(
      `Active view is neither fabric nor tube, that should not have happened, data is ${data}`,
    );
  }

  update_tube(tube: Tube) {
    log.debug("Updating tube in tube_controller");
    if (state.active_view === "tube") {
      const row = this.table.row((idx, data) => data.id === tube.id);
      if (row.any()) {
        row.data(tube).draw(false);
      } else {
        this.table.row.add(tube).draw(false);
      }
    }
  }

  update_fabric(fabric: Fabric) {
    if (state.active_view === "fabric") {
      const row = this.table.row((idx, data) => data.id === fabric.id);
      if (row.any()) {
        row.data(fabric).draw(false);
      } else {
        this.table.row.add(fabric).draw(false);
      }
    }
  }

  cb_toggle_group_colums() {
    console.log("called?");
    this.table.columns().every(function () {
      const config = this.init();
      const v =
        config &&
        (config.group === state.active_view || config.group === "both");
      this.visible(v);
    });

    this.table.ajax.reload();
  }

  init_visible_group() {
    this.table.columns().every(function () {
      const config = this.init();
      const isTubeGroup =
        config && (config.group === "tube" || config.group === "both");
      this.visible(isTubeGroup);
    });
  }

  cb_insert_tube_to_table(tube: Tube) {
    log.debug("cb_insert_tube_to_table(fabric:Tube), data", tube);
    if (!tube) {
      log.error("Tube is undefined ");
      return;
    }
    this.table.row.add(tube);
    this.table.draw();
  }
}

class CustomizeTubeForm {
  modalDialog: ModalDialog;
  input: HTMLInputElement;
  error_p: HTMLParagraphElement;
  table: Api<Tube | Fabric>;
  resolve?: (value: Tube | null) => void;

  constructor(table: Api<Tube | Fabric>) {
    this.table = table;
    this.modalDialog = new ModalDialog({
      body: this.body(),
      title: "Tubo customizable",

      onConfirm: async () => {
        let tube_id = this.get_tube_id();
        if (tube_id == null) {
          return false;
        }
        let res = await CoreAPI.newTube(tube_id);

        if (!res.success) {
          log.debug(res.data);
          this.update_error_message(res.status);
          return false;
        }
        this.resolve(res.data.tube);
        return true;
      },

      onClose: () => {
        this.input.value = "";
        this.update_error_message(0);
        this.resolve(null);
        this.resolve = null;
      },
    });
  }

  get_tube_id() {
    let value = this.input.value;
    let id = Number(value);

    // Use isNaN() instead of == NaN
    if (value === "" || isNaN(id)) {
      this.update_error_message(1);
      return null; // or handle invalid state appropriately
    }

    return id;
  }

  openForm() {
    return new Promise<Tube | null>((resolve) => {
      this.resolve = resolve;
      this.modalDialog.show();
    });
  }

  update_error_message(error_num) {
    let e = this.error_p;
    switch (error_num) {
      case 0:
        e.classList.add("hidden");
        e.textContent = "";
        break;

      case 1:
        e.classList.remove("hidden");
        e.textContent = "Input no es numero";

      case 409:
        e.classList.remove("hidden");
        e.textContent = "El tubo que quiere crear ya existe";
    }
  }

  body() {
    let e = createElementFromHTML(`

        <div>
  <p class="hidden text-red-500"> </p>
  <input> </input>
</div>


`);
    this.input = e.querySelector("input");
    this.error_p = e.querySelector("p");

    input_only_allow_numbers(this.input);
    return e;
  }
}

const tableController = new TableController();
export { tableController };
