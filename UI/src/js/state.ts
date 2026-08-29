import { CatalogItem, ViewMode } from "./typeObj";
import { CatalogApi } from "./api/catalog";
import {
  BlindModel,
  Color,
  FabricClassification,
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
  tableData: TableData;

  public events = new TypedEventEmitter<StateEvents>();

  constructor() {}

  init() {
    this.active_view = "tube";
    this.catalagoData = new CatalagoData(this.events);
    this.tableData = new TableData(this.events);
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
}

class TableData {
  tubes: Array<Tube>;
  fabrics: Array<Fabric>;
  size: number;
  public events = new TypedEventEmitter<StateEvents>();

  constructor(events) {
    this.tubes = [];
    this.fabrics = [];
    this.size = -1;
    this.events = events;
  }

  get_fabrics_by_tube_id(tube_id: number): Array<unknown> {
    if (!this.fabrics) {
      log.error("fabrics is undefined");
      return [];
    }
    log.debug("fabrics here in getting them by filter ", this.fabrics);
    return this.fabrics.filter((el) => el.tube_id == tube_id);
  }

  update_fabric_by_id(fabric: Fabric) {
    //TODO MAKE SURE WHEN YOU UPDATE, THAT IT ALSO REFLECTS IN THE TABLE VIEW XD
    const index = this.fabrics.findIndex((item) => item.id === fabric.id);
    if (index == -1) {
      log.error(
        `Not able to find fabric with id ${fabric.id}, obj is `,
        fabric,
      );
      return;
    }
    log.debug("Updating fabric  in state with ", fabric);
    this.fabrics[index] = fabric;
  }

  cb_insert_new_tube(tube: Tube) {
    log.debug("cb_insert_new_tube(tube:Tube)");
    this.tubes.push(tube);
  }
}

const state = new State();

export { state };
