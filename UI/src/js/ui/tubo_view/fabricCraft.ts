import { getLogger } from "loglevel";
import { Fabric, Tube } from "../../schema";
import {
  CatalogItem,
  FabricData,
  FabricExData,
  TubeExtraD,
} from "../../typeObj";
import { fcolumn, tcolumn } from "../utils.ts";
import { Api, ColumnsConfig } from "datatables.net-dt";
import { state } from "../../state.ts";
import { showRecycleDialog } from "../utils.ts";

import DataTable from "datatables.net-dt";

import TomSelect from "tom-select";
import "tom-select/dist/css/tom-select.css";
import { CatalogApi } from "../../api/catalog.ts";
import { TypedEventEmitter } from "../../emitter.ts";
import { CoreAPI } from "../../api/core.ts";
import { RowModalEvents } from "./tubo_overview.ts";
import {
  fabric_column_name_from_tablename,
  isFabricUnchanged,
  request_to_create_value_on_table,
  viceversa_map,
} from "./utils.ts";

export type FabricState = "created" | "edited" | "normal" | "deleted";

export type ActionState = "creating" | "editing" | "editing_created";

const fabric_action_map: Partial<Record<FabricState, ActionState>> = {
  created: "creating",
  edited: "editing",
};

const modal_filling_data: HTMLDialogElement = document.querySelector(
  "#modal-filling-data",
);
const modal_filling_data_save_btn: HTMLHeadingElement = document.querySelector(
  "#modal-filling-data-save-btn",
);

const close_btn: HTMLHeadingElement = document.querySelector(
  "#filling-data-close-btn",
);

const filling_data_form: HTMLFormElement =
  document.querySelector("#filling-data-form");


function init_input(el_id, err_id) {
  const el: HTMLInputElement = document.querySelector(el_id);

  let data = {
    active: false,
    input: el,
  };

  el.addEventListener("focus", function (e) {
    if (data.active) {
      data.active = false;
      let err_mess = document.querySelector(`#error_text_filling-data-width`);
      err_mess.textContent = "";
    }
  });

  return data;
}
let width_obj = init_input(
  "#filling-data-width",
  `#error_text_filling-data-width`,
);
let height_obj = init_input(
  "#filling-data-height",
  `#error_text_filling-data-height`,
);


export class FabricCraft {
  public events = new TypedEventEmitter<RowModalEvents>();
  tom_selects: Array<TomSelect>;
  mode: ActionState;
  tube_id: number;
  fabricData: FabricData;
  private resolvePromise?: (value: FabricExData) => void;

  constructor(events) {
    this.init_bindings();
    this.events = events;
    this.tom_selects = new Array();
  }

  init_bindings() {
    this.bind_dialog();
    this.bind_save();
    this.bind_cancel();
  }

  bind_dialog() {
    modal_filling_data.addEventListener("submit", (e) => {
      e.preventDefault();
    });

    modal_filling_data.addEventListener("close", (event) => {
      this.clean_dialog();
    });
  }

  bind_save() {
    modal_filling_data_save_btn.addEventListener("click", (e) => {
      //validation phase
      let result = this.get_data_from_form();

      if (!result.correct) {
        return;
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
          isFabricUnchanged(
            this.fabricData.original_fabric,
            this.fabricData.modified_fabric,
          )
        ) {
          this.fabricData.mode = "normal";
        } else {
          this.fabricData.mode = "edited";
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
    });
  }

  resolveIt(data) {
    if (this.resolvePromise) {
      // log.debug(`Data after saving row `, data);
      this.resolvePromise(data); // Resolves the awaiting Promise
      this.resolvePromise = undefined; // Clean up reference
    }

    this.clean_dialog();
  }

  clean_dialog() {
    if (this.resolvePromise) {
      this.resolvePromise(null); // Resolves the awaiting Promise
      this.resolvePromise = undefined; // Clean up reference
    }

    for (let tom of this.tom_selects) {
      tom.clear();
      tom.refreshItems();
    }
    modal_filling_data.close();
    filling_data_form.reset();
  }

  bind_cancel() {
    close_btn.addEventListener("click", (e) => {
      this.clean_dialog();
    });
  }

  get_data_from_form() {
    let data: Fabric = {};
    const optional_tables = state.catalagoData.fabric_optional_tables;
    let isValid = true;

    let width = width_obj.input.value;
    if (width === "") {
      log.debug(`width is empty`);
      let el = document.querySelector("#error_text_filling-data-width");
      el.textContent = "*Obligatorio";
      width_obj.active = true;
      isValid = false;
    }

    let height = height_obj.input.value;
    if (height === "") {
      log.debug(`height is empty`);
      let el = document.querySelector("#error_text_filling-data-height");
      el.textContent = "*Obligatorio";

      height_obj.active = true;
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
        log.debug(`Column name ${fabric_column_name} and item `, item_option);
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
    data["original_width"] = parseFloat(width);
    data["original_height"] = parseFloat(height);

    return {
      data: data,
      correct: isValid,
    };
  }

  showCreating(fabricData: FabricData, tube_id: number): Promise<any> {
    return new Promise((resolve) => {
      this.resolvePromise = resolve;
      this.fabricData = fabricData;
      this.mode = "creating";
      this.tube_id = tube_id;
      modal_filling_data.showModal();
    });
  }

  show(fabricData: FabricData, actionState: ActionState): Promise<any> {
    return new Promise((resolve) => {
      this.resolvePromise = resolve;
      this.fabricData = fabricData;
      this.mode = actionState;
      this.tube_id = fabricData.original_fabric.tube_id;
      //Create editing copy just in case if the user decides to save

      if (actionState == "editing") {
        if (!fabricData.modified_fabric) {
          fabricData.modified_fabric = structuredClone(
            fabricData.original_fabric,
          );
          log.debug("clone of this has ", fabricData.modified_fabric);
        }
        this.insert_data_to_tom_selects(fabricData.modified_fabric);
      } else {
        this.insert_data_to_tom_selects(fabricData.original_fabric);
      }
      modal_filling_data.showModal();
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

    width_obj.input.value = data.original_width;
    height_obj.input.value = data.original_height;
  }

  get_tom_select_id(tablename) {
    return `#select-${tablename}`;
  }

  createToms<
    T extends {
      id: number;
      name?: string;
    },
  >(
    selectId: string,
    items: T[],
    labelKey: keyof T = "name",
    table_name: string,
  ) {
    // return
    log.debug(`id is ${selectId} and table ${table_name}`);
    const tom = new TomSelect(`${selectId}`, {
      create: true,
      openOnFocus: true,
      selectOnTab: true,
      refreshThrottle: 0,

      onOptionAdd: async (value, data) =>
        request_to_create_value_on_table(tom, value, table_name),
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

    console.log(items);

    items.forEach((item) => {
      let display = item.name ? item.name : item.id;
      tom.addOption({ value: item.id, text: display, table_name: table_name });
      log.debug({ value: item.id, text: display });
    });

    this.tom_selects.push(tom);
    tom.refreshOptions();
    tom.close();
  }
}

const table2column = new Map();
const column2table = new Map();

table2column["color"] = "color_id";
table2column["blind_model"] = "blind_model_id";
table2column["fabric_classification"] = "classification_id";
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
