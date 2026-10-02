import { Fabric, FabricComment, FabricDeduction, Tube } from "../schema.ts";
import axios from "axios";
import { createa_api } from "./axios_init.ts";

const api = createa_api("core");
// Exported API Module (Guarantees payload is wrapped in an object)
export const CoreAPI = {
  newTube: async () => await api.post("/new/tube", {}),
  update_tube: async (tube_id, payload: Partial<Tube>) => {
    return await api.post("/tube/update/", {
      id: tube_id,
      payload: payload,
    });
  },

  recentTubes: async () => await api.get("/recent_tubes"),

  fabric_add_many: async (fabrics: Array<Fabric>) =>
    await api.post("/fabric/add_many", { fabrics: fabrics }),

  fabric_delete: async (fabric_id: number) =>
    await api.post("/fabric/delete/", { id: fabric_id }),

  fabric_update_many: async (fabrics: Array<Object>) =>
    await api.post("/fabric/edit/many/", { data: fabrics }),

  create_deduction: async (deduction: FabricDeduction) => {
    return await api.post("/fabric/new/deduction/", deduction);
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

  delete_deduction: async (fabric_id: number, deduction_id: number) => {
    const res = await api.post("/fabric/deduction/delete/", {
      fabric_id: fabric_id,
      deduction_id: deduction_id,
    });
    return res;
  },

  fabricComment_new: async (fabricComment: FabricComment) => {
    const res = await api.post("/fabric/comment/new/", {
      comment: fabricComment,
    });
    return res;
  },

  fabricComment_update: async (
    fabricComment: Partial<FabricComment>,
    comment_id,
  ) => {
    const res = await api.post("/fabric/comment/update/", {
      comment_partial: fabricComment,
      comment_id: comment_id,
    });
    return res;
  },

  fabricComment_delete: async (comment_id, fabric_id) => {
    const res = await api.post("/fabric/comment/delete/", {
      comment_id: comment_id,
      fabric_id: fabric_id,
    });
    return res;
  },
};
