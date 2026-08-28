
import {getLogger } from "loglevel";
let log = getLogger("app")
log.setLevel("DEBUG")
globalThis.log = log;

import { CatalogApi } from "./api/catalog.ts";


import { CoreAPI } from "./api/core.ts";
import { Fabric, Tube } from "./schema.ts";

import {ColumnsConfig} from 'datatables.net-dt';


import TomSelect from "tom-select";


import { controlPanel } from "./ui/control_panel.ts";
import { tableController } from "./ui/table_controller.ts";
import { rowModal } from "./ui/tubo_view/tubo_overview.ts";

import '../css/input.css';
import { TableView } from "./typeObj.ts";
import { state } from "./state.ts";
import { deductionKardex } from "./ui/deduction_kardex/deduction_kardex.ts";




state.init()


controlPanel.events.on("view:changed",(...args) => {
  console.log("hey?")
  tableController.toggle_group_colums(...args)
})



tableController.events.on("tube:dblclick",(...args) => {
  rowModal.cb_open_modal_tube(...args)
})

tableController.events.on("fabric:dblclick",(...args) => {
  rowModal.cb_open_modal_fabric(...args)
})

state.events.on("catalago:loaded",() => {
  console.log("fuck")
  rowModal.cb_initModalDropdowns()
})

rowModal.events.on("catalog_item:added",(...args) => {
  state.cb_catalog_item_added(...args)
})


deductionKardex.events.on("deduction:modified",(...args) => {
  tubeOverview.cb_update_fabric_data(...args)
})

document.addEventListener("DOMContentLoaded", () => {
});










