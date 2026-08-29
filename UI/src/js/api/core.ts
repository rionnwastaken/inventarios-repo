import { Fabric, FabricDeduction } from "../schema.ts";
import axios from "axios";
import {sendRequest} from "./api.ts";


const api = axios.create({
  baseURL: '/core',
  validateStatus: (status) => status >= 200 && status < 500, // Treats 400 as a resolved promise instead of an exception
  headers: {
    'Content-Type': 'application/json',
  },
});

api.interceptors.response.use(
  (response) => {
    // Dynamically add a .success boolean flag (true for 2xx statuses)
    response.success = response.status >= 200 && response.status < 300;
    return response;
  },
  (error) => {
    // Handles 500+ errors or total network failures
    error.success = false;
    return error;
  }
);


// Exported API Module (Guarantees payload is wrapped in an object)
export const CoreAPI = {
  // newTube: () =>
  //   sendRequest("/core/new/tube", "POST", {}),
  //
  // recentTubes: () =>
  //   sendRequest("/core/recent_tubes", "GET", {}),
  //
  // fabric_add_many: (fabrics:Array<Fabric>) =>
  //   sendRequest("/core/fabric/add_many", "POST", {fabrics:fabrics}),
  //
  //
  // fabric_update_many: (fabrics:Array<Object>) =>
  //   sendRequest("/core/fabric/edit/many/", "POST", {data:fabrics}),

newTube: async () =>
    await api.post("/new/tube", {}),

  recentTubes: async () =>
    await api.get("/recent_tubes"),

  fabric_add_many: async (fabrics: Array<Fabric>) =>
    await api.post("/fabric/add_many", { fabrics: fabrics }),

  fabric_update_many: async (fabrics: Array<Object>) =>
    await api.post("/fabric/edit/many/", { data: fabrics }),

  create_deduction: async (deduction:FabricDeduction) => {
    return await api.post("/fabric/new/deduction/", deduction)
  },


update_deduction: async (fabric_id: number, deduction_id: number, partial_deduction_payload: Record<string, unknown>) => {
  const res = await api.post("/fabric/deduction/update/", {
    fabric_id: fabric_id,
    deduction_id: deduction_id,
    deduction_partial_data: partial_deduction_payload,
  });
  return res;
}




// 2. Refactored API object
// export const CoreAPI = {
//   newTube: () => 
//     api.post('/new/tube', {}),
//
//   recentTubes: () => 
//     api.get('/recent_tubes'),
//
//   fabric_add_many: (fabrics: Fabric[]) => 
//     api.post('/fabric/add_many', { fabrics }),
//
//   fabric_update_many: (fabrics: Object[]) => 
//     api.post('/fabric/edit/many/', { data: fabrics }),
//
//   create_deduction: (deduction: FabricDeduction) => 
//     api.post('/fabric/new/deduction/', { data: deduction }),
//
//   update_deductions: (deductions: FabricDeduction[]) => 
//     api.post('/fabric/deductions/update/', { data: deductions }),
// };
