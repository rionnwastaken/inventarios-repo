import { Fabric, FabricDeduction, SpareFabric } from "../schema.ts";
import axios from "axios";
import { createa_api } from "./axios_init.ts";

const api = createa_api("core");
// Exported API Module (Guarantees payload is wrapped in an object)
export const CoreAPI = {
  newTube: async () => await api.post("/new/tube", {}),

  recentTubes: async () => await api.get("/recent_tubes"),

  fabric_add_many: async (fabrics: Array<Fabric>) =>
    await api.post("/fabric/add_many", { fabrics: fabrics }),

  fabric_update_many: async (fabrics: Array<Object>) =>
    await api.post("/fabric/edit/many/", { data: fabrics }),

  create_deduction: async (deduction: FabricDeduction) => {
    return await api.post("/fabric/new/deduction/", deduction);
  },

  update_spare_fabric: async (
    spare_fabric_id,
    spare_fabric: Partial<SpareFabric>,
  ) => {
    return await api.post("/spare/fabric/update/", {
      spare_fabric_id: spare_fabric_id,
      payload: spare_fabric,
    });
  },

  update_deduction: async (
    fabric_id: number,
    deduction_id: number,
    partial_deduction_payload: Record<string, unknown>,
  ) => {
    const res = await api.post("/fabric/deduction/update/", {
      fabric_id: fabric_id,
      deduction_id: deduction_id,
      deduction_partial_data: partial_deduction_payload,
    });
    return res;
  },
};
