import axios from "axios";

const api = axios.create({
    baseURL: import.meta.env.VITE_API_URL || (import.meta.env.DEV ? "http://localhost:3000/api" : "/api"),
    headers: {
        "Content-Type": "application/json",
    },
});

api.interceptors.request.use((config) => { // interceptor means before every request run this code 
    const token=localStorage.getItem('token');//get token from local storage and add to header of every request if it exists
    if(token){
        config.headers.Authorization=`Bearer ${token}`;//attach token automatically 
    }
    return config;
}); 

export default api;
