import { getLogger } from "loglevel";
let log = getLogger("app");
log.setLevel("DEBUG");
globalThis.log = log;

import { CatalogApi } from "./api/catalog.ts";

import { CoreAPI } from "./api/core.ts";
import { FabricComment } from "./schema.ts";
import { Fabric, Tube } from "./typeObj.ts";

// import {ColumnsConfig} from 'datatables.net-dt';

import TomSelect from "tom-select";

import { controlPanel } from "./ui/control_panel.ts";
import { tableController } from "./ui/data_navigator/init.ts";
import { tubeOverview } from "./ui/tubo_view/init.ts";

import "../css/input.css";
import { TableView } from "./typeObj.ts";
import { state } from "./state.ts";
import { deductionKardex } from "./ui/deduction_kardex/deduction_kardex.ts";

import { catalogEditor } from "./ui/catalog_editor/inits.ts";

catalogEditor.init();
deductionKardex.init();
state.init();

catalogEditor.events.on("item:renamed", (item, table_name) => {
  tableController.reload();
  controlPanel.update_tom_data(table_name);
  tubeOverview.fabricCraft.update_tom_data(table_name);
});

catalogEditor.events.on("item:replaced", (item, table_name) => {
  tableController.reload();
  controlPanel.update_tom_data(table_name);
  tubeOverview.fabricCraft.update_tom_data(table_name);
});

catalogEditor.events.on("item:deleted", (item, table_name) => {
  tableController.reload();
  controlPanel.update_tom_data(table_name);
  tubeOverview.fabricCraft.update_tom_data(table_name);
});

controlPanel.events.on("view:changed", () => {
  console.log("hey?");
  tableController.cb_toggle_group_colums();
});

controlPanel.events.on(
  "searchbar:tube-selected",
  (tube: Tube, fabrics: Fabric[]) => {
    tubeOverview.cb_open_modal_tube(tube, fabrics);
  },
);

controlPanel.events.on("search-btn:clicked", () => {
  tableController.get_data();
});

tableController.events.on("tube:dblclick", (...args) => {
  tubeOverview.cb_open_modal_tube(...args);
});

tableController.events.on("fabric:dblclick", (...args) => {
  // tubeOverview.cb_open_modal_fabric(...args);
  deductionKardex.cb_show_kardex(...args);
});

state.events.on("catalago:loaded", () => {
  console.log("fuck");
  tubeOverview.cb_initModalDropdowns();
  tubeOverview.locationController.loadSlots();
  tubeOverview.locationController.loadTags();
  controlPanel.cb_initModalDropdowns();
  catalogEditor.init_table_with_catalago_data();
});

tubeOverview.events.on("catalog_item:added", (...args) => {
  state.cb_catalog_item_added(...args);
});

tubeOverview.locationController.events.on("catalago:created", (...args) => {
  state.cb_catalog_item_added(...args);
});
tubeOverview.events.on("fabric:edited", (...args) => {
  tableController.update_fabric(...args);
  //TODO maybe get the tube here and update it because its updated_at attribute has changed
});

tubeOverview.events.on("fabric:created", (...args) => {
  tableController.update_fabric(...args);
});

tubeOverview.events.on("fabric:deleted", (...args) => {
  tableController.update_fabric(...args);
});

tubeOverview.events.on("tubo_overview:dblclick_fabric", (...args) => {
  deductionKardex.cb_show_kardex(...args);
});

tubeOverview.events.on("tube:updated", (...args) => {
  tableController.update_tube(...args);
});

deductionKardex.events.on("deduction:modified", (...args) => {
  tableController.update_fabric(...args);
  tubeOverview.cb_update_fabric_data(...args);
});

deductionKardex.events.on(
  "deduction:deleted",
  (fabric: Fabric, deduction_id) => {
    tubeOverview.cb_update_fabric_data(fabric);

    tableController.update_fabric(fabric);
  },
);

deductionKardex.events.on(
  "open:vista-tubos",
  (tube: Tube, fabrics: Fabric[]) => {
    tubeOverview.cb_open_modal_tube(tube, fabrics);
  },
);

deductionKardex.events.on(
  "comment:edited",
  (fabric: Fabric, comment: FabricComment) => {
    tubeOverview.cb_update_fabric_data(fabric);
    deductionKardex.cb_update_fabric_data(fabric);
  },
);

deductionKardex.events.on(
  "comment:deleted",
  (fabric: Fabric, comment: FabricComment) => {
    tubeOverview.cb_update_fabric_data(fabric);
    deductionKardex.cb_update_fabric_data(fabric);
  },
);

document.addEventListener("DOMContentLoaded", () => {});
