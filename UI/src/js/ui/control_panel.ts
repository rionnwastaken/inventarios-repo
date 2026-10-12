import { CatalogApi } from "../api/catalog.ts";
import { CoreAPI } from "../api/core.ts";
import { TypedEventEmitter } from "../emitter.ts";
import { Fabric, Tube } from "../schema.ts";

import { TableView, ViewMode } from "../typeObj.ts";
import { state } from "../state.ts";
import {
  createElementFromHTML,
  input_allow_numbers_min_max,
  input_only_allow_numbers,
  TruthyColorer,
} from "./utils.ts";

import save_icon from "../../assets/icons/plus.svg?raw";

import greater_than_icon from "../../assets/icons/greater-than.svg?raw";
import less_than_icon from "../../assets/icons/less-than.svg?raw";
import equal_icon from "../../assets/icons/equal-sign.svg?raw";
import TomSelect from "tom-select";

//TODO EVENT WHEN TUBO IS CREATED

let operation_symbol_labels = ["greater", "less", "equal"];
let operation_symbols = [greater_than_icon, less_than_icon, equal_icon];

export interface ControlPanelEvents {
  "view:changed": (filters: Object) => void;
  "data:change": (tubes: Tube[], fabrics: Fabric[]) => void;
  "search-btn:clicked": (filters: null | Object) => void;
}

type input_data = {
  input: HTMLInputElement;
  previous_value: String;
  operation_index: number;
};

let catalago = [
  { tablename: "blind_model", label: "Modelo de Persiana" },
  { tablename: "color", label: "Color" },
  { tablename: "fabric_classification", label: "Clasificación" },
  { tablename: "supplier", label: "Proveedor" },
];

class ControlPanel {
  public events = new TypedEventEmitter<ControlPanelEvents>();

  view_text: HTMLButtonElement;
  view_toggler: HTMLInputElement;

  tom_selects: Array<TomSelect>;
  map_tom_selects: Map<String, TomSelect>;

  width_data: input_data;
  height_data: input_data;
  availability_data: input_data;
  clear_filters_btn: HTMLButtonElement;

  block_send_filters: Boolean;

  search_btn: HTMLButtonElement;
  verified_btn: HTMLButtonElement;
  verified_btn_active: boolean;

  constructor() {
    this.tom_selects = new Array();
    this.map_tom_selects = new Map();

    this.body();
    this.init_bindings();
    this.init_state();
    this.block_send_filters = false;

    console.log("icon : ", save_icon);
  }

  body() {
    const e = createElementFromHTML(`
    <div class="flex flex-col gap-3 w-full">

      <!-- Row 1: primary action + search + view toggle -->
        <div class="flex flex-row-reverse items-center gap-4">
          <input class="input input-bordered w-64" placeholder="Buscar Tubo" />

          <label class="flex items-center gap-2 cursor-pointer">
            <span id="tipo-tabla-vista-text">Vista Tabla</span>
            <input
              id="tipo-tabla-vista-toggler"
              type="checkbox"
              class="toggle border-none bg-yellow-900 checked:bg-purple-900"
            />
          </label>
        </div>

      <!-- Row 2: filters (wrap) + actions -->
      <div class="flex flex-wrap items-end justify-between gap-3">

        <div class="flex flex-wrap items-end gap-3">
          ${this.input_number("Ancho", "Ancho")}
          ${this.input_number("Alto", "Alto")}
          ${this.input_percent("Disponibilidad %", "disponibilidad")}
          ${catalago.map((obj) => this.select_catalago(obj.tablename, obj.label)).join("")}
        </div>

        <div class="flex items-center gap-2">
          <button id="clear-filters-btn" class="btn">Borrar Filtros</button>
          <button id="verified-btn" class="btn">Tubos Verificados</button>
          <button id="buscar-btn" class="btn btn-primary">Buscar</button>
        </div>

      </div>
    </div>
  `);
    // ...rest unchanged

    // tube searcher
    // measurements  2 num valid
    // remaining percent 1 num valid
    // catalago 4 text

    let a_tw = "justify-end";

    let container = document.querySelector("#panel-control-container");
    container.replaceWith(e);

    this.view_text = e.querySelector("#tipo-tabla-vista-text");
    this.view_toggler = e.querySelector("#tipo-tabla-vista-toggler");

    this.width_data = this.init_input(e.querySelector("#Ancho"));
    this.height_data = this.init_input(e.querySelector("#Alto"));
    this.availability_data = this.init_input(
      e.querySelector("#disponibilidad"),
    );

    this.search_btn = e.querySelector("#buscar-btn");
    this.verified_btn = e.querySelector("#verified-btn");
    let verified_colorer = new TruthyColorer(
      "bg-green-200",
      "bg-red-200",
      this.verified_btn,
    );
    this.verified_btn_active = true;
    verified_colorer.color(this.verified_btn_active);

    input_allow_numbers_min_max(this.availability_data.input, 0, 100);

    this.clear_filters_btn = e.querySelector("#clear-filters-btn");

    this.clear_filters_btn.addEventListener("click", () => {
      this.clear_filters();
    });

    this.verified_btn.addEventListener("click", () => {
      this.verified_btn_active = !this.verified_btn_active;
      verified_colorer.color(this.verified_btn_active);
    });

    for (let obj of catalago) {
      let select = e.querySelector(
        `#${obj.tablename} select`,
      ) as HTMLSelectElement;
      this.createTom(select, obj.tablename);
    }

    this.search_btn.addEventListener("click", () => {
      const filters = this.get_active_filters();
      this.events.emit("search-btn:clicked", filters);
    });

    return e;
  }

  // async send_filters() {
  //   if (this.block_send_filters) {
  //       return
  //   }
  //
  //
  //   log.debug("send_filters()");
  //   let filters = this.get_active_filters();
  //
  //   log.debug("filters ", filters);
  //
  //   let res = await CoreAPI.get_tube_and_fabrics(filters);
  //
  //   if (!res.success) {
  //     log.debug(res.data);
  //     return;
  //   }
  //   this.events.emit("data:change", res.data.tubes, res.data.fabrics);
  // }

  get_active_filters() {
    let obj = {};

    if (this.width_data.input.value != "") {
      obj["width"] = {
        value: Number(this.width_data.input.value),
        orientation: operation_symbol_labels[this.width_data.operation_index],
      };
    }

    if (this.height_data.input.value != "") {
      obj["height"] = {
        value: Number(this.height_data.input.value),
        orientation: operation_symbol_labels[this.height_data.operation_index],
      };
    }

    if (this.availability_data.input.value != "") {
      obj["availability"] = {
        value: Number(this.availability_data.input.value),
        orientation:
          operation_symbol_labels[this.availability_data.operation_index],
      };
    }

    obj["tube_verified"] = this.verified_btn_active;

    for (let tom of this.tom_selects) {
      let values = tom.getValue();
      let table_name = tom.customData.table_name;

      if (values.length > 0) {
        obj[table_name] = values;
      }
    }

    if (Object.keys(obj).length === 0) {
      return null;
    }
    return obj;
  }

  clear_filters() {
    log.debug("Clearing filters");
    this.block_send_filters = true;

    this.width_data.input.value = "";
    this.height_data.input.value = "";
    this.availability_data.input.value = "";
    for (let tom of this.tom_selects) {
      tom.clear();
      // tom.refreshState()
    }
    this.block_send_filters = false;

    this.events.emit("search-btn:clicked", null);
    // this.send_filters()
  }

  //TODO Reuse this function as utilery
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

  input_number(labelName, id) {
    let max_width_tw = `w-fit`;
    let no_arrows_tw =
      "[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none";
    return `
    <div class="flex flex-col items-start gap-1 ${max_width_tw}" id="${id}">
      <div class="flex items-center gap-2">
          <label class="text-sm font-medium text-gray-700">${labelName}</label>
          ${this.math_operation_image()}
        
      </div>
      <input type="number" class="h-10  w-20 px-3 py-2 border  focus:outline-none focus:ring-2 focus:ring-blue-500 ${no_arrows_tw}" />
    </div>
  `;
  }

  math_operation_image() {
    return `
      <div class="w-8 h-8 rounded-4xl p-1.5 bg-yellow-500 border border-4  border-white text-black math-operation-container">
      </div>
      `;
  }

  input_percent(label, id) {
    return `
    <div class="flex flex-col items-start gap-1" id="${id}">
      <div class="flex items-center gap-2">
          <label class="text-sm font-medium text-gray-700">${label}</label>
          ${this.math_operation_image()}
      </div>
      <input type="number" min="0" max="100" class="w-full h-10 px-3 py-2 border  focus:outline-none focus:ring-2 focus:ring-blue-500" />
    </div>
  `;
  }

  select_catalago(table_name, label_name) {
    return `
    <div id="${table_name}"> 
        <span class="label-text font-semibold">${label_name}</span>
        <select class="w-full h-10 input-lowercase" ></select>
    </div>`;
  }

  createTom<
    T extends {
      id: number;
      name: string;
    },
  >(select: HTMLSelectElement, table_name: string) {
    const tom = new TomSelect(select, {
      openOnFocus: true,
      selectOnTab: true,
      refreshThrottle: 0,
      maxItems: null,
      // wrapperClass: 'ts-wrapper [&_.ts-control]:!flex [&_.ts-control]:!flex-col [&_.ts-control]:max-h-16 [&_.ts-control]:overflow-y-auto [&_.ts-control]:gap-1.5 [&_.ts-control_.item]:!w-full [&_.ts-control_.item]:!m-0 [&_.ts-control_input]:!w-full',

      // onChange: () => {
      //   this.send_filters();
      // },
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

    this.tom_selects.push(tom);
    this.map_tom_selects.set(table_name, tom);
  }

  title() {}
  init_state() {
    this.init_state_toggler();
  }

  init_bindings() {
    this.bind_vista_toggler();
  }

  init_input(container: HTMLElement) {
    let input = container.querySelector("input");
    let data: input_data = {
      input: input,
      previous_value: "",
      operation_index: 0,
    };

    let operation_container = container.querySelector(
      ".math-operation-container",
    );

    operation_container.innerHTML = greater_than_icon;
    operation_container.addEventListener("click", () => {
      let index = (data.operation_index + 1) % 3;
      let icon = operation_symbols[index];
      operation_container.innerHTML = icon;
      data.operation_index = index;
    });

    input_only_allow_numbers(input);

    input.addEventListener("focus", () => {
      data.previous_value = input.value;
    });

    input.addEventListener("focusout", () => {
      if (input.value !== data.previous_value) {
        data.previous_value = input.value; // Update stored value
      }
    });
    return data;
  }

  bind_vista_toggler() {
    this.view_toggler.addEventListener("click", () => {
      let view: TableView;
      let previous = state.active_view;

      if (state.active_view == "tube") {
        state.active_view = "fabric";
      } else {
        state.active_view = "tube";
      }

      this.view_text.textContent = get_view_text(state.active_view);
      view = {
        previous_view: previous,
        new_view: state.active_view,
      };
      console.log(view);
      this.events.emit("view:changed", this.get_active_filters());
    });
  }

  init_state_toggler() {
    this.view_toggler.checked = false;
    state.active_view = "tube";
    this.view_text.textContent = get_view_text(state.active_view);
  }
}

function get_view_text(state: ViewMode) {
  if (state == "fabric") {
    return "Vista Telas";
  }
  if (state == "tube") {
    return "Vista Tubos";
  }

  return "Error";
}

const controlPanel = new ControlPanel();
export { controlPanel };
