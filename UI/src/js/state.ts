import { CatalogItem, Tube, ViewMode } from "./typeObj";
import { CatalogApi } from "./api/catalog";
import {
  BlindModel,
  Color,
  FabricClassification,
  Location,
  LocationImage,
  Supplier,
  Tube,
} from "./schema";

import { Fabric } from "./typeObj";
import { TypedEventEmitter } from "./emitter";

export interface StateEvents {
  "catalago:loaded": () => void;
}

class State {
  active_view: ViewMode;
  catalagoData: CatalagoData;

  public events = new TypedEventEmitter<StateEvents>();

  constructor() {}

  init() {
    this.active_view = "tube";
    this.catalagoData = new CatalagoData(this.events);
  }

  cb_catalog_item_added(catalogItem: CatalogItem) {
    log.debug(`Adding item ${catalogItem} to state`);
    log.debug(catalogItem);
    this.catalagoData.data[catalogItem.table_name].push(catalogItem);

    log.debug(this.catalagoData.data[catalogItem.table_name]);
  }
}

class CatalagoData {
  public events = new TypedEventEmitter<StateEvents>();

  data: Map<string, Array<any>>;
  fabric_optional_tables: Record<string, { optional: Boolean }>;

  constructor(events) {
    this.data = new Map();
    this.events = events;
    this.load_catalago_data();
    this.load_optional_table_values_fabric();
  }

  async load_catalago_data() {
    console.log("FUCKING SHIT");
    if (typeof log === "undefined" || !log) {
      console.log("IT IS UNDEFINED");
    } else {
      console.log("IT AINT");
    }
    console.log("FUCK THIS SHIT bruv");

    log.debug("load_catalago_data()");

    let res = await CatalogApi.getCatalago();

    if (res.success) {
      const data = res.data;
      // console.log(data)

      for (let [key, arr] of Object.entries(data)) {
        log.debug(`key ${key}`);
        console.log(arr[0]);
        this.data[key] = arr;
      }

      log.debug("Catalog data loaded ", this.data);
      this.events.emit("catalago:loaded");
    }
  }

  catalagoValue(table_name, data) {
    if (!data) {
      return "";
    }

    let obj = this.data[table_name].find((obj) => obj.id == data);

    if (obj) {
      return obj.name;
    }
    return "";
  }

  async load_optional_table_values_fabric() {
    const res = await CatalogApi.get_optional_attributs_of_fabric();
    if (res.success) {
      const data = res.data;
      this.fabric_optional_tables = data;
      log.info("Optional data of row loaded");
    }
  }

  remove_by_id(table_name, id) {
    let arr: Array<Location> = this.data[table_name];
    if (arr == undefined) {
      throw `Array not found with table name ${table_name}`;
    }

    let index = arr.findIndex((value, index) => {
      if (value.id == id) {
        return true;
      }
    });

    if (index == -1) {
      throw `Id ${id} was not found in array state ${arr}`;
    }
    arr.splice(index, 1);
  }

  replace_by_id(tablename, id: number, obj: unknown) {
    let arr = this.data[tablename];
    if (arr == undefined) {
      throw Error("bruv");
    }
    const index = arr.findIndex((item) => item.id === id);

    if (index == -1) {
      log.error(`Not able to find fabric with id ${id}, obj is `, obj);
      return;
    }
    log.debug(`Updating in ${tablename}  in state with `, obj);
    arr[index] = obj;
  }
}

const state = new State();
export { state };
