import { Fabric, FabricDeduction } from "../schema.ts";
import {sendRequest} from "./api.ts";

// Exported API Module (Guarantees payload is wrapped in an object)
export const CoreAPI = {
  newTube: () =>
    sendRequest("/core/new/tube", "POST", {}),

  recentTubes: () =>
    sendRequest("/core/recent_tubes", "GET", {}),

  fabric_add_many: (fabrics:Array<Fabric>) =>
    sendRequest("/core/fabric/add_many", "POST", {fabrics:fabrics}),


  fabric_update_many: (fabrics:Array<Object>) =>
    sendRequest("/core/fabric/edit/many/", "POST", {data:fabrics}),

  create_deduction: (deduction:FabricDeduction) =>
    sendRequest("/core/fabric/new/deduction/", "POST", {data:deduction}),


  update_deductions: (deduction:FabricDeduction[]) =>
  axios.post("/core/fabric/deductions/update/")
};
