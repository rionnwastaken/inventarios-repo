import { disableAll, getLogger } from "loglevel";
import { CatalogItem, Fabric, Tube } from "../../typeObj.ts";
import {
  createElementFromHTML,
  get_partial_data,
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
import { RowModalEvents } from "./init.ts";
import {
  fabric_column_name_from_tablename,
  request_to_create_value_on_table,
  viceversa_map,
} from "./utils.ts";

import { ModalState, ItemState } from "../../typeObj.ts";
import { ModalDialog } from "../dialogs/modalDialog.ts";
import { createPrefixedLogger } from "../utils.ts";

let ID = "FabricCraft";

const log = createPrefixedLogger(ID, "DEBUG");

interface MeasurementData {
  active: boolean;
  input: HTMLInputElement;
  disable: CallableFunction;
}

export class FabricCraft {
  public events = new TypedEventEmitter<RowModalEvents>();
  tom_selects: Array<TomSelect>;
  map_tom_selects: Map<string, TomSelect>;
  mode: ModalState;
  tube_id: number;
  fabric: Fabric;
  modalDialog: ModalDialog;
  private resolvePromise?: (value: Fabric) => void;

  width_data: MeasurementData;
  height_data: MeasurementData;

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
        await this.handle_save();
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
      { tablename: "fabric_classification", label: "Tejido" },
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
    let data: MeasurementData = {
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

    if (
      this.mode == "editing" &&
      ObjectChanged(this.fabric, result.data, new Set())
    ) {
      let partial_data = get_partial_data(this.fabric, result.data);
      this.resolveIt(partial_data);
      return;
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

  show(fabric?: Fabric, extra?: { tube_id: number }): Promise<Fabric | null> {
    return new Promise((resolve) => {
      this.resolvePromise = resolve;
      this.fabric = fabric;
      this.tube_id = fabric?.tube_id || extra?.tube_id;
      //Create editing copy just in case if the user decides to save

      this.width_data.disable(false);
      this.height_data.disable(false);

      if (fabric != null) {
        this.should_disable_measurementes_huh(fabric);
        this.insert_data_to_tom_selects(fabric);
      }
      this.modalDialog.show();
      // modal_filling_data.showModal();
    });
  }

  should_disable_measurementes_huh(fabric: Fabric) {
    let should_disable = (fabric?.deductions?.length ?? 0) > 0;
    log.debug("Should disable inputs ", should_disable);
    this.width_data.disable(should_disable);
    this.height_data.disable(should_disable);
  }

  insert_data_to_tom_selects(fabric: Fabric) {
    for (let tom of this.tom_selects) {
      tom.clear();
      let table_name = tom.customData.table_name;
      let column_id = table2column[table_name];
      let value = fabric[column_id];

      if (value) {
        tom.setValue(value);
        tom.refreshItems();
      }
    }

    this.width_data.input.value = fabric.original_width;
    this.height_data.input.value = fabric.original_height;
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
      openOnFocus: false,
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

      onItemAdd: () => {
        setTimeout(() => {
          tom.setTextboxValue("");
          tom.refreshOptions();
          tom.close();
        }, 100);
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
