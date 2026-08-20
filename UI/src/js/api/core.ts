import { Fabric } from "../schema.ts";
import {sendRequest} from "./api.ts";

// Exported API Module (Guarantees payload is wrapped in an object)
export const CoreAPI = {
  newTube: () =>
    sendRequest("/core/new/tube", "POST", {}),

  recentTubes: () =>
    sendRequest("/core/recent_tubes", "GET", {}),

  fabric_add_many: (fabrics:Array<Fabric>) =>
    sendRequest("/core/fabric/add_many", "POST", {fabrics:fabrics}),

};
