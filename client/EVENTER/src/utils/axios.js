import axios from "axios";

const api = axios.create({//instead of writing base url everytime (axios.get(...)) we can create this instance and call using this  
    baseURL: import.meta.env.VITE_API_URL || "http://localhost:3000/api",//eg api.get('/events') gives us http://localhost:3000/api/events
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
