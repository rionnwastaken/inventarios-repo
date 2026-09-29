import { getLogger } from "loglevel";
let log = getLogger("app");
log.setLevel("DEBUG");
globalThis.log = log;

import { CatalogApi } from "./api/catalog.ts";

import { CoreAPI } from "./api/core.ts";
import { FabricComment, Tube } from "./schema.ts";
import { Fabric } from "./typeObj.ts";

// import {ColumnsConfig} from 'datatables.net-dt';

import TomSelect from "tom-select";

import { controlPanel } from "./ui/control_panel.ts";
import { tableController } from "./ui/table_controller.ts";
import { tubeOverview } from "./ui/tubo_view/tubo_overview.ts";

import "../css/input.css";
import { TableView } from "./typeObj.ts";
import { state } from "./state.ts";
import { deductionKardex } from "./ui/deduction_kardex/deduction_kardex.ts";

deductionKardex.init();
state.init();

controlPanel.events.on("view:changed", (...args) => {
  console.log("hey?");
  tableController.cb_toggle_group_colums(...args);
});

controlPanel.events.on("tube:new", (...args) => {
  tableController.cb_insert_tube_to_table(...args);
  state.tableData.cb_insert_new_tube(...args);
});

tableController.events.on("tube:dblclick", (...args) => {
  tubeOverview.cb_open_modal_tube(...args);
});

tableController.events.on("fabric:dblclick", (...args) => {
  tubeOverview.cb_open_modal_fabric(...args);
});

state.events.on("catalago:loaded", () => {
  console.log("fuck");
  tubeOverview.cb_initModalDropdowns();
  tubeOverview.locationController.loadSlots();
  tubeOverview.locationController.loadTags();
});

tubeOverview.events.on("catalog_item:added", (...args) => {
  state.cb_catalog_item_added(...args);
});
tubeOverview.events.on("fabric:edited", (...args) => {
  state.tableData.update_fabric_by_id(...args);
});

tubeOverview.events.on("tubo_overview:dblclick_fabric", (...args) => {
  deductionKardex.cb_show_kardex(...args);
});

deductionKardex.events.on("deduction:modified", (...args) => {
  tubeOverview.cb_update_fabric_data(...args);
});

deductionKardex.events.on(
  "deduction:deleted",
  (fabric: Fabric, deduction_id) => {
    state.tableData.update_fabric_by_id(fabric);
    tubeOverview.cb_update_fabric_data(fabric);
  },
);

deductionKardex.events.on(
  "comment:edited",
  (fabric: Fabric, comment: FabricComment) => {
    state.tableData.update_fabric_by_id(fabric);
    tubeOverview.cb_update_fabric_data(fabric);
    deductionKardex.cb_update_fabric_data(fabric);
  },
);

deductionKardex.events.on(
  "comment:deleted",
  (fabric: Fabric, comment: FabricComment) => {
    state.tableData.update_fabric_by_id(fabric);
    tubeOverview.cb_update_fabric_data(fabric);
    deductionKardex.cb_update_fabric_data(fabric);
  },
);

document.addEventListener("DOMContentLoaded", () => {});
