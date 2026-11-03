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
  ElementToggler,
} from "./utils.ts";

import save_icon from "../../assets/icons/plus.svg?raw";

import greater_than_icon from "../../assets/icons/greater-than.svg?raw";
import less_than_icon from "../../assets/icons/less-than.svg?raw";
import equal_icon from "../../assets/icons/equal-sign.svg?raw";
import TomSelect from "tom-select";
import { TubeSearcher } from "./components/TubeSearcher.ts";
import { getLogger } from "loglevel";

//TODO EVENT WHEN TUBO IS CREATED

let operation_symbol_labels = ["greater", "less", "equal"];
let operation_symbols = [greater_than_icon, less_than_icon, equal_icon];

let log = getLogger("app");

export interface ControlPanelEvents {
  "view:changed": (filters: Object) => void;
  "data:change": (tubes: Tube[], fabrics: Fabric[]) => void;
  "search-btn:clicked": (filters: null | Object) => void;
  "searchbar:tube-selected": (tube: Tube, fabrics: Fabric[]) => void;
}

type input_data = {
  input: HTMLInputElement;
  previous_value: String;
  operation_index: number;
  reset: Function;
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
  tubeSearcher: TubeSearcher;

  search_btn: HTMLButtonElement;
  verified_data: ElementToggler;
  filtering_elements: Array<unknown>;

  excel_tube_searcher: TubeSearcher;

  constructor() {
    this.tom_selects = new Array();
    this.map_tom_selects = new Map();
    this.filtering_elements = new Array();

    this.tubeSearcher = new TubeSearcher({
      tw_class: "w-80",
      cb_item_select: async (tube_id) => {
        await this.open_tube(this.tubeSearcher, tube_id);
      },
    });

    this.verified_data = new ElementToggler(
      [null, true, false],
      ["empty", "bg-green-200", "bg-red-200"],
    );

    this.body();
    this.init_bindings();
    this.init_state();
    this.block_send_filters = false;
  }
  async open_tube(tubeSearcher: TubeSearcher, tube_id) {
    tubeSearcher.tom.clear();
    tubeSearcher.tom.close();
    let res = await CoreAPI.get_tube_data(tube_id);

    if (!res.success) {
      log.debug(res.data);
      return;
    }
    let data = res.data;
    this.events.emit("searchbar:tube-selected", data.tube, data.fabrics);
  }

  body() {
    const e = createElementFromHTML(`
    <div class="flex flex-col gap-3 w-full">

      <!-- Row 1: primary action + search + view toggle -->
        <div class="flex flex-row-reverse items-center gap-4 mr-4">
          <input id="replaceme-search-tube"> </input>

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
 <div class="flex flex-col">

    <div class="flex flex-col" id="excel-panel">
      <p class="font-bold">Panel de control Excel</p>
      <div class="flex  items-center">
        <button class="tube-searcher"></button>
        ${this.select_catalago("excel_tube_location", "Ubicacion")}
      </div>
    </div>


      <div class="flex flex-wrap items-end justify-between gap-3">

           <div class="flex flex-col">
                <div class="flex flex-wrap items-end gap-3">
                  ${this.input_number("Ancho", "Ancho")}
                  ${this.input_number("Alto", "Alto")}
                  ${this.input_percent("Disponibilidad %", "disponibilidad")}
                  ${catalago.map((obj) => this.select_catalago(obj.tablename, obj.label)).join("")}
                </div>

          </div>

            <div class="flex items-center gap-2">
              <button id="clear-filters-btn" class="btn">Borrar Filtros</button>
              <button id="verified-btn" class="btn">Tubos Verificados</button>
              <button id="buscar-btn" class="btn btn-primary">Buscar</button>
            </div>

          </div>
</div>
    </div>
  `);
    let a_tw = "justify-end";

    let container = document.querySelector("#panel-control-container");
    container.replaceWith(e);

    e.querySelector("#replaceme-search-tube").replaceWith(
      this.tubeSearcher.element,
    );

    this.view_text = e.querySelector("#tipo-tabla-vista-text");
    this.view_toggler = e.querySelector("#tipo-tabla-vista-toggler");

    this.width_data = this.init_input(e.querySelector("#Ancho"));
    this.height_data = this.init_input(e.querySelector("#Alto"));
    this.availability_data = this.init_input(
      e.querySelector("#disponibilidad"),
    );

    this.search_btn = e.querySelector("#buscar-btn");
    this.verified_data.el = e.querySelector("#verified-btn");

    let excel_panel = e.querySelector("#excel-panel");
    let searcher = excel_panel.querySelector("button");
    this.excel_tube_searcher = new TubeSearcher({
      placeholder: "Buscar Tubo Excel",
      tw_class: "fit-w",
      cb_item_select: (tube_id) => {
        this.open_tube(this.excel_tube_searcher, tube_id);
      },
      request_items: async (tube_id, callback) => {
        let res = await CoreAPI.search_excel_tubes(tube_id);
        if (!res.success) {
          log.debug(res.data);
          return;
        }
        log.debug(res.data);
        let formattedItems = res.data.map((item) => {
          return {
            ...item, // Keeps all existing properties (excel_id, tube_id, textile, etc.)
            text: `Tubo ${item.excel_id} | ${item.textile}`,
            id: item.tube_id,
          };
        });

        callback(formattedItems);
      },
    });
    searcher.replaceWith(this.excel_tube_searcher.element);

    input_allow_numbers_min_max(this.availability_data.input, 0, 100);

    this.clear_filters_btn = e.querySelector("#clear-filters-btn");

    this.clear_filters_btn.addEventListener("click", () => {
      this.clear_filters_btn.classList.remove("btn-warning");
      this.clear_filters();
    });

    this.verified_data.el.addEventListener("click", () => {
      this.verified_data.change();
    });

    this.init_filtering_objects(e);

    let select = e.querySelector(
      `#excel_tube_location select`,
    ) as HTMLSelectElement;
    let tom = this.createTom(select, "excel_tube_location");
    this.filtering_elements.push(tom);

    tom.on("change", () => {
      this.clear_filter_update_ux();
    });

    this.search_btn.addEventListener("click", () => {
      const filters = this.get_active_filters();
      this.events.emit("search-btn:clicked", filters);
    });

    return e;
  }

  init_filtering_objects(e) {
    this.filtering_elements.push(
      this.availability_data.input,
      this.verified_data,
      this.width_data.input,
      this.height_data.input,
    );

    for (let obj of catalago) {
      let select = e.querySelector(
        `#${obj.tablename} select`,
      ) as HTMLSelectElement;
      let tom = this.createTom(select, obj.tablename);

      this.filtering_elements.push(tom);

      tom.on("change", () => {
        this.clear_filter_update_ux();
      });
    }

    for (let el of this.filtering_elements) {
      if (el instanceof HTMLInputElement) {
        el.addEventListener("focusout", () => {
          this.clear_filter_update_ux();
        });
      } else if (el instanceof ElementToggler) {
        el.el.addEventListener("click", () => {
          this.clear_filter_update_ux();
        });
      }
    }
  }

  clear_filter_update_ux() {
    let filters_active = this.check_if_filters_active();
    this.clear_filters_btn.classList.remove("btn-warning");
    if (filters_active) {
      this.clear_filters_btn.classList.add("btn-warning");
    }

    // for (let )
  }
  check_if_filters_active() {
    for (let el of this.filtering_elements) {
      if (el instanceof TomSelect) {
        let value = el.getValue();
        if (value.length >= 1) {
          return true;
        }
      } else if (el instanceof ElementToggler) {
        if (el.filterActive()) {
          return true;
        }
      } else if (el instanceof HTMLInputElement) {
        if (el.value != "") {
          return true;
        }
      }
    }

    return false;
  }

  element_has_value(el) {
    if (typeof el == "function") {
      return el() != "";
    }

    return el.value != "";
  }

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

    obj["tube_verified"] = this.verified_data.value();

    //Adds all tom selects created by createTom
    for (let tom of this.tom_selects) {
      let values = tom.getValue();
      let table_name = tom.customData.table_name;

      if (values.length > 0) {
        obj[table_name] = values;
      }
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
    this.verified_data.reset();

    this.width_data.reset();
    this.height_data.reset();
    this.availability_data.reset();
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
    // log.debug(this.map_tom_selects, table_name);
    // console.log("tommy here", tom, items);

    if (!tom) {
      return;
    }

    items.forEach((item) => {
      let display = item.name ? item.name : item.id;
      tom.addOption({ value: item.id, text: display, table_name: table_name });
      // log.debug({ value: item.id, text: display });
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

  createTom(select: HTMLSelectElement, table_name: string) {
    const tom = new TomSelect(select, {
      openOnFocus: true,
      selectOnTab: true,
      refreshThrottle: 0,
      maxItems: null,

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

    tom.control.addEventListener("click", (e) => {
      // Look for the clicked item element inside the control container
      const itemEl = e.target.closest(".item");
      if (itemEl && tom.control.contains(itemEl)) {
        const value = itemEl.dataset.value;
        if (value !== undefined) {
          tom.removeItem(value);
          tom.refreshOptions(false);
        }
      }
    });

    this.tom_selects.push(tom);
    this.map_tom_selects.set(table_name, tom);
    return tom;
  }

  title() {}
  init_state() {
    this.init_state_toggler();
  }

  init_bindings() {
    this.bind_vista_toggler();
  }

  init_input(container: HTMLElement) {
    let operation_container = container.querySelector(
      ".math-operation-container",
    );
    let input = container.querySelector("input");
    let data: input_data = {
      input: input,
      previous_value: "",
      operation_index: 0,
      reset: () => {
        data.previous_value = "";
        data.operation_index = 0;
        operation_container.innerHTML = greater_than_icon;
      },
    };

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
