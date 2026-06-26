import React from 'react'
import api from '../utils/axios';

export const AuthContext = React.createContext(); // Creates a global storage box for auth data.

export const AuthProvider = ({ children }) => {
    const [user, setUser] = React.useState(null);//Stores logged-in user.
    const [loading, setLoading] = React.useState(true);
    //Used while checking:
    //is user already saved in localStorage?
    //Prevents app flickering.


//useEffect here = "startup pe check karo user already login hai ya nahi"
    React.useEffect(() => {//Runs when app starts.
        const storedUser = localStorage.getItem('user');   //Reads previously saved user from browser.
        if (storedUser) {
            setUser(JSON.parse(storedUser));//Converts string back into object. So user stays logged in even after refresh.
        }
        setLoading(false);//auth check completed
    }, []);

    const login = async(email,password) => {
        try{
            const {data}=await api.post('/auth/login',{email,password}) ;
            setUser(data);//updates React state.
            localStorage.setItem('user', JSON.stringify(data));//saves user permanently in browser.
            localStorage.setItem("token",data.token);
            return data;
        }
        catch(err){
            console.error("login failed: ",err);
            // Normalize Axios error to include server message and a flag for unverified accounts
            const serverMessage = err?.response?.data?.message || err?.response?.data?.error || err.message;
            const isNotVerified = typeof serverMessage === 'string' && serverMessage.toLowerCase().includes('not verified');
            const errorToThrow = new Error(serverMessage || 'Login failed');
            if (isNotVerified) errorToThrow.needsVerification = true;
            throw errorToThrow;
        }
    };

    const register=async(name,email,password)=>{
        try{
            const {data}=await api.post('/auth/register',{name,email,password});
            setUser(data);
            return data;// we are not doing setItem as only registration is done verification is still pending
        }
        catch(err){
            console.error("Registration failed : ",err);
            throw err;
        }
    }

    const verifyOTP=async(email,otp)=>{
        try{
            const {data}=await api.post('/auth/verify_otp',{ email, otp });
            setUser(data);
            localStorage.setItem('user', JSON.stringify(data));
            localStorage.setItem("token",data.token);
            return data;
        }
        catch(err){
            console.error("OTP verification failed :  ",err);
            throw err;
        }
    }

    const logout = () => {
//Clears:
    //React state
    //localStorage
//So user becomes logged out.
        setUser(null);
        localStorage.removeItem('user');
        localStorage.removeItem('token');
    };

    return (
// Makes these available globally.
// Any component can use:
    // const { user, login, logout } =
    //    useContext(AuthContext);
        <AuthContext.Provider value={{ user, loading, login, logout ,verifyOTP,register}}>
            {children}
        </AuthContext.Provider>
    );
};

// App starts 
//    ↓
// useEffect checks localStorage
//    ↓
// User found?
//    ↓
// YES → restore session
// NO → stay logged out

// Login
//    ↓
// Backend verifies credentials
//    ↓
// JWT token received
//    ↓
// Save user + token
//    ↓
// User stays logged in

// Logout
//    ↓
// Clear state + localStorage
//    ↓
// User logged out