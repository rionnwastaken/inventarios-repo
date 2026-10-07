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
} from "./utils.ts";

import save_icon from "../../assets/icons/plus.svg?raw";
import TomSelect from "tom-select";

//TODO EVENT WHEN TUBO IS CREATED

export interface ControlPanelEvents {
  "view:changed": (filters: Object) => void;
  "tube:new": (tube: Tube) => void;
  "data:change": (tubes: Tube[], fabrics: Fabric[]) => void;
  "search-btn:clicked": (filters: null | Object) => void;
}

type input_data = {
  input: HTMLInputElement;
  previous_value: String;
};

let catalago = [
  { tablename: "blind_model", label: "Modelo de Persiana" },
  { tablename: "color", label: "Color" },
  { tablename: "fabric_classification", label: "Clasificación" },
  { tablename: "supplier", label: "Proveedor" },
];

class ControlPanel {
  public events = new TypedEventEmitter<ControlPanelEvents>();

  btn_new_tube: HTMLButtonElement;
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
      <div class="flex  justify-between w-full">

        <div id="btn-new-tube" class="flex bg-green-900 p-2 btn">
          <p class="text-lg">Tubo</p>
          <span type="" class="btn w-7 h-7 btn-circle border-none bg-green-600">
            ${save_icon}
          </span>
        </div>



      <div class="flex flex-col items-end"> 
          <div class="flex"> 

             <input placeholder="Buscar Tubo">
             </input>
              <div class="flex flex-col gap-2">
                  <p id="tipo-tabla-vista-text">Vista Tabla</p>
                  <input
                    id="tipo-tabla-vista-toggler"
                    type="checkbox"
                    class="toggle border-none bg-yellow-900 checked:bg-purple-900"
                  />
                </div>
          </div>

          <div class="flex">
           <button id="clear-filters-btn">Borrar Filtros </button>
              ${this.input_number("Ancho", "Ancho")}
              ${this.input_number("Alto", "Alto")}
              ${this.input_percent("Disponibilidad %", "disponibilidad")}
              
             ${catalago.map((obj) => this.select_catalago(obj.tablename, obj.label)).join("")}

             <button id="buscar-btn" class="button">Buscar</button>
         </div>

     </div>

    </div>
                                      
                                      `);

    // tube searcher
    // measurements  2 num valid
    // remaining percent 1 num valid
    // catalago 4 text

    let a_tw = "justify-end";

    let container = document.querySelector("#panel-control-container");
    container.replaceWith(e);

    this.btn_new_tube = e.querySelector("#btn-new-tube");
    this.view_text = e.querySelector("#tipo-tabla-vista-text");
    this.view_toggler = e.querySelector("#tipo-tabla-vista-toggler");

    this.width_data = this.init_input(e.querySelector("#Ancho input"));
    this.height_data = this.init_input(e.querySelector("#Alto input"));
    this.availability_data = this.init_input(
      e.querySelector("#disponibilidad input"),
    );

    this.search_btn = e.querySelector("#buscar-btn");

    input_allow_numbers_min_max(this.availability_data.input, 0, 100);

    this.clear_filters_btn = e.querySelector("#clear-filters-btn");

    this.clear_filters_btn.addEventListener("click", () => {
      this.clear_filters();
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
        orientation: "greater",
      };
    }

    if (this.height_data.input.value != "") {
      obj["height"] = {
        value: Number(this.height_data.input.value),
        orientation: "greater",
      };
    }

    if (this.availability_data.input.value != "") {
      obj["availability"] = {
        value: Number(this.availability_data.input.value),
        orientation: "greater",
      };
    }

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
    let max_width_tw = `max-w-20`;
    let no_arrows_tw =
      "[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none";
    return `
    <div class="flex flex-col items-start gap-1 ${max_width_tw}" id="${id}">
      <label class="text-sm font-medium text-gray-700">${labelName}</label>
      <input type="number" class="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${no_arrows_tw}" />
    </div>
  `;
  }

  input_percent(label, id) {
    return `
    <div class="flex flex-col items-start gap-1" id="${id}">
      <label class="text-sm font-medium text-gray-700">${label}</label>
      <input type="number" min="0" max="100" class="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" />
    </div>
  `;
  }

  select_catalago(table_name, label_name) {
    return `
    <div id="${table_name}"> 
        <span class="label-text font-semibold">${label_name}</span>
        <select class="w-full input-lowercase" ></select>
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
    this.bind_new_tube();
  }

  init_input(input: HTMLInputElement) {
    let data = {
      input: input,
      previous_value: "",
    };

    input_only_allow_numbers(input);

    input.addEventListener("focus", () => {
      data.previous_value = input.value;
    });

    input.addEventListener("focusout", () => {
      if (input.value !== data.previous_value) {
        data.previous_value = input.value; // Update stored value
        // this.send_filters();
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

  bind_new_tube() {
    this.btn_new_tube.addEventListener("click", async () => {
      const res = await CoreAPI.newTube();
      console.log(res);

      if (res.success) {
        this.events.emit("tube:new", res.data.tube);
      }
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
