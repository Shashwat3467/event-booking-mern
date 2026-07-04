const express=require('express');
const dotenv= require('dotenv');
const cors= require('cors');
const mongoose=require('mongoose');
const dns = require('dns');
const authRoutes= require('./routes/auth');
const eventRoutes= require('./routes/events');
const bookingRoutes= require('./routes/booking');
dotenv.config();

// Use a reliable public DNS resolver for SRV lookups when Node's default resolver fails.
// This fixes issues where Node cannot resolve MongoDB Atlas SRV records on some Windows network setups.
dns.setServers(['8.8.8.8', '1.1.1.1']);

const app= express();
app.use(cors());
app.use(express.json());

//Routes
app.use('/api/auth',authRoutes);
app.use('/api/events',eventRoutes); 
app.use('/api/bookings',bookingRoutes);

mongoose.connect(process.env.MONGO_URL)
.then(()=>{
    console.log('Connected to MongoDB');
})
.catch((err)=>{
    console.error('Error connecting to MongoDB:',err)
})

app.listen(process.env.PORT,()=>{
    console.log(`Server is running on port ${process.env.PORT}`);
}); 