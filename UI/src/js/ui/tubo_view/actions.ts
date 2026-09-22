import { getLogger } from "loglevel";
import { Tube } from "../../schema.ts";
import { Fabric } from "../../typeObj.ts";
import { CatalogItem, FabricData, TubeExtraD } from "../../typeObj.ts";
import {
  createElementFromHTML,
  fabricDataColumn,
  get_partial_data,
  inspect_row,
} from "../utils.ts";
import { Api, ColumnsConfig } from "datatables.net-dt";
import { state } from "../../state.ts";

import DataTable from "datatables.net-dt";
import "datatables.net-select-dt";

import "tom-select/dist/css/tom-select.css";
import { CatalogApi } from "../../api/catalog.ts";
import { TypedEventEmitter } from "../../emitter.ts";
import { CoreAPI } from "../../api/core.ts";
import { FabricCraft, ItemState } from "./fabricCraft.ts";
import { InitTable } from "./init_table.ts";
import { ApiRow, ApiRowMethods, ApiRowsMethods } from "datatables.net";

export class Actions {
  fabricCraft: FabricCraft;
  table: Api<FabricData>;

  constructor(fabricCraft, table: Api<FabricData>) {
    this.fabricCraft = fabricCraft;
    this.table = table;
  }

  async open_form_editing(row: ApiRowMethods<FabricData>) {
    const data = row.data();

    if (data == undefined) {
      log.debug("Double click row undefined");
      return;
    }

    //We are passing data by reference
    if (data.mode == "created") {
      await this.fabricCraft.show(data, "editing_created");
    }

    if (data.mode == "normal") {
      await this.fabricCraft.show(data, "editing");
      // this.events.emit("tubo_overview:dblclick_fabric",data.original_fabric)
    }

    if (data.mode == "edited") {
      await this.fabricCraft.show(data, "editing");
    }

    log.info("Redrawing table");
    log.info("Data of worked row ", data);
    row.data(data);
    this.table.draw(false);
  }

  //Tube overwiew file is an incomprenhesible mess
  async open_form_create(tube_id) {
    let fabricData: FabricData = {
      original_fabric: null,
      modified_fabric: null,
      mode: null,
    };

    const fabric = await this.fabricCraft.show(fabricData, "creating", {
      tube_id: tube_id,
    });

    if (!fabric) {
      log.debug("operation was canceled");
      return;
    }

    // const fabricData = buildFabricObject(result, this.tube.id);
    log.info(`Adding table with data ${fabricData}`);
    this.table.row.add(fabricData);
    this.table.draw();
  }
}
