import TomSelect from "tom-select";
import { Fabric, Tube } from "../../typeObj";
import { createElementFromHTML, input_only_allow_numbers } from "../utils";

interface TubeSearcherData {
  tw_class?: string;
  cb_item_select?: (tube_id: number) => void;
}

let defaults: TubeSearcherData = {
  tw_class: "form-control w-full",
  cb_item_select: (tube_id: number) => {},
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

      placeholder: "Buscar Tubo",

      onItemAdd: () => {
        let value = this.tom.getValue();
        log.debug("Item added ", value);
        data.cb_item_select(Number(value));
      },

      load: function (query, callback) {
        var url = "/core/tubes2?q=" + encodeURIComponent(query);
        fetch(url)
          .then((response) => response.json())
          .then((ids) => {
            const items = ids.map((id) => ({
              id: id, // Property named "id" holding the numeric value (e.g. 1)
              text: `Tubo ${String(id)}`, // Property named "text" holding the string version (e.g. "1")
            }));

            // 2. Pass the created objects to Tom Select
            callback(items);
          })
          .catch(() => {
            callback();
          });
      },
    });

    let input = e.querySelector("input");
    input.type = "number";
    input_only_allow_numbers(input);
    this.element = e;
    return e;
  }
}
