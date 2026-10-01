import { disableAll, getLogger } from "loglevel";
import { Tube } from "../../schema";
import { CatalogItem, FabricData, Fabric, Tube } from "../../typeObj";
import {
  createElementFromHTML,
  ObjectChanged as ObjectChanged,
} from "../utils.ts";
import { Api, ColumnsConfig } from "datatables.net-dt";
import { state } from "../../state.ts";

import DataTable from "datatables.net-dt";

import TomSelect from "tom-select";
import "tom-select/dist/css/tom-select.css";
import { CatalogApi } from "../../api/catalog.ts";
import { TypedEventEmitter } from "../../emitter.ts";
import { CoreAPI } from "../../api/core.ts";
import { RowModalEvents } from "./tubo_overview.ts";
import {
  fabric_column_name_from_tablename,
  request_to_create_value_on_table,
  viceversa_map,
} from "./utils.ts";

import { ModalState, ItemState } from "../../typeObj";
import { ModalDialog } from "../dialogs/modalDialog.ts";
import { createPrefixedLogger } from "../utils";

let ID = "FabricCraft";

const log = createPrefixedLogger(ID, "DEBUG");

export class FabricCraft {
  public events = new TypedEventEmitter<RowModalEvents>();
  tom_selects: Array<TomSelect>;
  map_tom_selects: Map<string, TomSelect>;
  mode: ModalState;
  tube_id: number;
  fabricData: FabricData;
  modalDialog: ModalDialog;
  private resolvePromise?: (value: Fabric) => void;

  width_data: Object;
  height_data: Object;

  constructor(events) {
    this.tom_selects = new Array();
    this.map_tom_selects = new Map();

    this.modalDialog = new ModalDialog({
      title: this.title(),
      body: this.body(),
      cancelText: "Cancelar",
      confirmText: "Guardar",
      id: ID,

      onCancel: () => {
        this.resolvePromise(null);
        this.resolvePromise = null;
      },

      onConfirm: async () => {
        return await this.handle_save();
      },

      onClose: () => {
        this.clean();
        // this.modalDialog.close()
      },
    });

    this.events = events;
  }

  title() {
    return `Creando Tela`;
  }

  body() {
    let inputs = [
      { tablename: "blind_model", label: "Modelo de Persiana" },
      { tablename: "color", label: "Color" },
      { tablename: "fabric_classification", label: "Clasificación" },
      { tablename: "supplier", label: "Proveedor" },
    ];

    const el = createElementFromHTML(`

    <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2"> 
     ${inputs.map((obj) => this.input_box(obj)).join("")}

     ${this.measurement_input("Ancho")}
     ${this.measurement_input("Alto")}
    </div
      `);

    for (let obj of inputs) {
      let select = el.querySelector(
        `#${obj.tablename}_id`,
      ) as HTMLSelectElement;
      this.createTom(select, obj.tablename);
    }

    this.width_data = this.init_measurement(el.querySelector(".Ancho_id"));
    this.height_data = this.init_measurement(el.querySelector(".Alto_id"));

    return el;
  }

  init_measurement(container) {
    let input = container.querySelector("input");
    let data = {
      active: false,
      input: input,
      disable: (should_disable) => {
        input.disabled = should_disable;
      },
    };
    input.addEventListener("focus", function (e) {
      if (data.active) {
        data.active = false;
        let err_mess = document.querySelector(`.text-error`);
        err_mess.textContent = "";
      }
    });

    return data;
  }

  input_box(obj) {
    return `

    <div> 
<span class="label-text font-semibold">${obj.label}</span>
    <label class="form-control w-full" id="${obj.tablename}_id">
      
              <div class="label flex">
                
                <span class="text-error"></span>
              </div>
              <select
                class="w-full input-lowercase"
              ></select>
            </label>

        </div>`;
  }

  measurement_input(name) {
    return `<label class="form-control w-full ${name}_id">
                <div class="label">
                  <span class="label-text font-semibold">${name} (mts)</span>
                  <span class="text-error" ></span>
                </div>
                <input
                  type="number" step="0.01" id="filling-data-width" placeholder="0.00" class="input input-bordered w-full" required />
              </label>`;
  }

  async handle_save() {
    let result = this.get_data_from_form();

    if (!result.correct) {
      return false;
    }

    log.debug(`Mode when saving ${this.mode}`);
    // this.fabricData.mode = this.mode

    if (this.mode == "editing_created") {
      this.fabricData.mode = "created";
      Object.assign(this.fabricData.original_fabric, result.data);
    }

    if (this.mode == "editing") {
      Object.assign(this.fabricData.modified_fabric, result.data);

      log.debug("Assignind data to modified, the data:", result.data);
      log.debug("modified looks now like", this.fabricData.modified_fabric);

      if (
        ObjectChanged(
          this.fabricData.original_fabric,
          this.fabricData.modified_fabric,
          new Set(["created_at", "updated_at", "deleted_at"]),
        )
      ) {
        this.fabricData.mode = "edited";
      } else {
        this.fabricData.mode = "normal";
      }

      log.debug(
        `Mode assign to fabric in editing mode is ${this.fabricData.mode}`,
      );
    }

    if (this.mode == "creating") {
      this.fabricData.mode = "created";
      this.fabricData.original_fabric = result.data;
    }

    log.debug(`Correct ${result.correct}`);
    this.resolveIt(result.data);
  }

  async resolveIt(data) {
    if (this.resolvePromise) {
      // log.debug(`Data after saving row `, data);
      this.resolvePromise(data); // Resolves the awaiting Promise
      this.resolvePromise = undefined; // Clean up reference
    }

    this.clean();
  }

  clean() {
    for (let tom of this.tom_selects) {
      tom.clear();
      tom.refreshItems();
    }
    if (this.resolvePromise) {
      this.resolvePromise(null); // Resolves the awaiting Promise
      this.resolvePromise = undefined; // Clean up reference
    }

    this.width_data.input.value = "";
    this.height_data.input.value = "";
  }

  get_data_from_form() {
    let data: Fabric = {};
    const optional_tables = state.catalagoData.fabric_optional_tables;
    let isValid = true;

    let width = this.width_data.input.value;
    if (width === "") {
      log.debug(`width is empty`);
      let el = document.querySelector("#error_text_filling-data-width");
      el.textContent = "*Obligatorio";
      this.width_data.active = true;
      isValid = false;
    }

    let height = this.height_data.input.value;
    if (height === "") {
      log.debug(`height is empty`);
      let el = document.querySelector("#error_text_filling-data-height");
      el.textContent = "*Obligatorio";

      this.height_data.active = true;
      isValid = false;
    }

    for (const tom of this.tom_selects) {
      let table_name = tom.customData.table_name;
      let item = tom.getValue();
      let item_option = tom.options[item];
      let optional: Boolean;

      let fabric_column_name = fabric_column_name_from_tablename(
        table2column,
        table_name,
      );
      if (fabric_column_name) {
        data[fabric_column_name] = item_option ? item_option.value : null;
        // log.debug(`Column name ${fabric_column_name} and item `, item_option);
      }

      // row_data[table_name] = item_option ? item_option : null;

      if (optional_tables[table_name]) {
        optional = optional_tables[table_name].optional;
      } else {
        log.error(
          `TableName ${table_name} not in optional_tables ${optional_tables}`,
        );
        continue;
      }

      if (!optional && item === "") {
        log.debug(`Found not optional ${table_name}`);
        let err_mess = document.querySelector(`#error_text_${table_name}`);
        err_mess.textContent = "*Obligatorio";
        tom.customData.err_message_active = true;
        isValid = false;
      }
    }

    const now = new Date().toISOString();
    data["created_at"] = now;
    data["updated_at"] = now;

    data["tube_id"] = this.tube_id;
    data["original_width"] = width;
    data["original_height"] = height;

    return {
      data: data,
      correct: isValid,
    };
  }

  /*
    MOST DISGUSTING CODE EVER
  TODO MAKE IT PRETTY
    */

  show(
    fabricData: FabricData,
    actionState: ModalState,
    extra?: { tube_id: number },
  ): Promise<any> {
    return new Promise((resolve) => {
      log.debug(`Opening with mode ${actionState} `);
      this.resolvePromise = resolve;
      this.fabricData = fabricData;
      this.mode = actionState;
      this.tube_id = fabricData?.original_fabric?.tube_id || extra?.tube_id;
      //Create editing copy just in case if the user decides to save

      this.width_data.disable(false);
      this.height_data.disable(false);

      let fabric;
      if (actionState == "editing") {
        let should_disable =
          (fabricData?.original_fabric?.deductions?.length ?? 0) > 0;
        log.debug("Should disable inputs ", should_disable);
        this.width_data.disable(should_disable);
        this.height_data.disable(should_disable);
        if (!fabricData.modified_fabric) {
          fabricData.modified_fabric = structuredClone(
            fabricData.original_fabric,
          );
          log.debug("clone of this has ", fabricData.modified_fabric);
        }
        fabric = fabricData.modified_fabric;
      }

      if (actionState == "editing_created") {
        fabric = fabricData.original_fabric;
      }

      if (actionState !== "creating") {
        this.insert_data_to_tom_selects(fabric);
      }

      this.modalDialog.show();
      // modal_filling_data.showModal();
    });
  }

  insert_data_to_tom_selects(data: Fabric) {
    for (let tom of this.tom_selects) {
      tom.clear();
      let table_name = tom.customData.table_name;
      let column_id = table2column[table_name];
      let value = data[column_id];

      if (value) {
        tom.setValue(value);
        tom.refreshItems();
      }
    }

    this.width_data.input.value = data.original_width;
    this.height_data.input.value = data.original_height;
  }

  get_tom_select_id(tablename) {
    return `#select-${tablename}`;
  }

  createTom<
    T extends {
      id: number;
      name?: string;
    },
  >(select: HTMLSelectElement, table_name: string) {
    const tom = new TomSelect(select, {
      create: true,
      createOnBlur: true,
      openOnFocus: true,
      selectOnTab: true,
      refreshThrottle: 0,
      maxItems: 1,

      onOptionAdd: async (value, data) => {
        // this.
        let res = await request_to_create_value_on_table(
          tom,
          value,
          table_name,
        );
        if (res.created) {
          this.events.emit("catalog_item:added", res.item);
        }
      },
    });

    tom.customData = {
      table_name: table_name,
      err_message_active: false,
    };

    tom.control_input.addEventListener("input", function (e) {
      const pos = e.target.selectionStart;
      e.target.value = e.target.value.toLowerCase();
      e.target.setSelectionRange(pos, pos);
    });

    tom.control_input.addEventListener("focus", function (e) {
      if (tom.customData.err_message_active) {
        tom.customData.err_message_active = false;
        let err_mess = document.querySelector(`#error_text_${table_name}`);
        err_mess.textContent = "";
      }
    });
    this.tom_selects.push(tom);
    this.map_tom_selects.set(table_name, tom);
  }

  initTom<
    T extends {
      id: number;
      name?: string;
    },
  >(table_name: string, items: T[]) {
    let tom = this.map_tom_selects.get(table_name);
    log.debug(this.map_tom_selects, table_name);
    console.log("tommy here", tom, items);

    if (!tom) {
      return;
    }

    items.forEach((item) => {
      let display = item.name ? item.name : item.id;
      tom.addOption({ value: item.id, text: display, table_name: table_name });
      log.debug({ value: item.id, text: display });
    });

    tom.refreshOptions();
    tom.close();
  }

  cb_initModalDropdowns() {
    const catalog = state.catalagoData;

    const keyCount = Object.keys(catalog.data).length;
    console.log(keyCount);

    for (const [table_name, arr] of Object.entries(catalog.data)) {
      this.initTom(table_name, arr);
    }

    log.info("Row Dropdowns initialized");
  }
}

const table2column = new Map();
const column2table = new Map();

table2column["color"] = "color_id";
table2column["blind_model"] = "blind_model_id";
table2column["fabric_classification"] = "fabric_classification_id";
table2column["supplier"] = "supplier_id";

viceversa_map(table2column, column2table);

/*
Modes
Creating -> fabric created by clickin button
Editing -> row loaded into table double clicked and modified
notmal -> rows loaded into table
Deleted

if a fabric is created, it can be edited but it will only do a sql insert clause cause its not in db yet

  */
