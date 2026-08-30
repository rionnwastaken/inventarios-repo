import axios from "axios";

export function createa_api(baseURL) {
  const api = axios.create({
    baseURL: `/${baseURL}`,
    validateStatus: (status) => status >= 200 && status < 500, // Treats 400 as a resolved promise instead of an exception
    headers: {
      "Content-Type": "application/json",
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
    },
  );
  return api;
}
