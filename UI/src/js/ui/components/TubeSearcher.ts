import TomSelect from "tom-select";
import { Fabric, Tube } from "../../typeObj";
import { createElementFromHTML, input_only_allow_numbers } from "../utils";
import { CoreAPI } from "../../api/core";

interface TubeSearcherData {
  tw_class?: string;
  cb_item_select?: (tube_id: number) => void;
  request_items?: (tube_id, callback) => void;
  placeholder?: string;
}

let defaults: TubeSearcherData = {
  tw_class: "form-control w-full",
  cb_item_select: (tube_id: number) => {},
  request_items: null,
  placeholder: "Buscar Tubo",
};

export class TubeSearcher {
  tom: TomSelect;
  resolve: (
    data: { fabric: Fabric; tube: Tube; previous_tube: Tube } | null,
  ) => void;
  fabric: Fabric;
  element: HTMLElement;

  constructor(data?: TubeSearcherData) {
    this.createTom(data);
  }

  createTom(provided: TubeSearcherData) {
    let data: TubeSearcherData = {
      ...defaults,
      ...provided,
    };

    const e = createElementFromHTML(`
    <label class="${data.tw_class}" >
      <select
        class="w-full input-lowercase"
      ></select>
    </label> `);

    this.tom = new TomSelect(e.querySelector("select"), {
      selectOnTab: true,
      refreshThrottle: 0,
      maxItems: 1,
      create: false,

      valueField: "id", // What gets submitted in forms
      labelField: "text", // What gets displayed in the dropdown
      searchField: "text",

      placeholder: data.placeholder,

      onItemAdd: () => {
        let value = this.tom.getValue();
        log.debug("Item added ", value);
        data.cb_item_select(Number(value));
      },

      load: async (query, callback) => {
        if (data.request_items == null) {
          await this.default_function(query, callback);
        } else {
          await data.request_items(query, callback);
        }
      },
    });

    let input = e.querySelector("input");
    input.type = "number";
    input_only_allow_numbers(input);
    this.element = e;
    return e;
  }

  async default_function(query, callback) {
    log.debug("claling");
    let res = await CoreAPI.search_tubes(query);

    if (!res.success) {
      log.debug(res.data);
      callback();
      return;
    }
    let tube_id_array = res.data;
    const items = tube_id_array.map((id) => {
      return {
        id: id,
        text: `Tubo ${id}`,
      };
    });
    callback(items);
  }
}
